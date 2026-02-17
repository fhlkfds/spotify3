import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { SpotifyApiError, spotifyRequest } from "@/lib/spotify/client";
import type { SpotifyTrack } from "@/lib/spotify/types";

export const runtime = "nodejs";

const MAX_JSON_IMPORT_BYTES = 200 * 1024 * 1024;
const MIN_MS_PLAYED = 30 * 1000;
const SPOTIFY_TRACK_ID_REGEX = /^[A-Za-z0-9]{22}$/;
const LOOKUP_BATCH_SIZE = 500;
const CREATE_BATCH_SIZE = 500;
const PLAY_BATCH_SIZE = 2_000;

const restoreSchema = z.object({
  albums: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        releaseDate: z.string().nullable().optional(),
        imageUrl: z.string().nullable().optional(),
      }),
    )
    .default([]),
  artists: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        imageUrl: z.string().nullable().optional(),
        genres: z.array(z.string()).default([]),
      }),
    )
    .default([]),
  tracks: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        durationMs: z.number(),
        albumId: z.string().nullable().optional(),
        artistIds: z.array(z.string()).default([]),
        popularity: z.number().nullable().optional(),
        previewUrl: z.string().nullable().optional(),
        imageUrl: z.string().nullable().optional(),
        danceability: z.number().nullable().optional(),
        energy: z.number().nullable().optional(),
        valence: z.number().nullable().optional(),
        tempo: z.number().nullable().optional(),
      }),
    )
    .default([]),
  plays: z
    .array(
      z.object({
        trackId: z.string(),
        playedAt: z.string(),
      }),
    )
    .default([]),
});

const yourSpotifyPrivacySchema = z.array(
  z.object({
    endTime: z.string(),
    artistName: z.string(),
    trackName: z.string(),
    msPlayed: z.number(),
  }),
);

const yourSpotifyFullPrivacySchema = z.array(
  z.object({
    ts: z.string(),
    ms_played: z.number(),
    spotify_track_uri: z.string().nullable(),
    master_metadata_track_name: z.string().nullable(),
    master_metadata_album_artist_name: z.string().nullable(),
  }),
);

type RestorePayload = z.infer<typeof restoreSchema>;
type YourSpotifyPrivacyItem = z.infer<typeof yourSpotifyPrivacySchema>[number];
type YourSpotifyFullPrivacyItem = z.infer<typeof yourSpotifyFullPrivacySchema>[number];

type SpotifyTracksResponse = {
  tracks: Array<SpotifyTrack | null>;
};

type SpotifySearchTracksResponse = {
  tracks: {
    items: SpotifyTrack[];
  };
};

type NormalizedTrackRow = {
  id: string;
  name: string;
  durationMs: number;
  albumId: string | null;
  artistIds: string[];
  popularity: number | null;
  previewUrl: string | null;
  imageUrl: string | null;
  danceability: number | null;
  energy: number | null;
  valence: number | null;
  tempo: number | null;
};

class RequestTooLargeError extends Error {}
class UnsupportedImportFormatError extends Error {}

function getContentLength(request: NextRequest): number | null {
  const value = request.headers.get("content-length");
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isMultipartRequest(request: NextRequest): boolean {
  const contentType = request.headers.get("content-type");
  return Boolean(contentType && contentType.includes("multipart/form-data"));
}

function mergeRestorePayloads(payloads: RestorePayload[]): RestorePayload {
  return {
    albums: payloads.flatMap((payload) => payload.albums),
    artists: payloads.flatMap((payload) => payload.artists),
    tracks: payloads.flatMap((payload) => payload.tracks),
    plays: payloads.flatMap((payload) => payload.plays),
  };
}

function mergeRawPayloads(payloads: unknown[]): unknown {
  if (payloads.length === 1) {
    return payloads[0];
  }

  const parsedRestorePayloads = payloads.map((payload) => restoreSchema.safeParse(payload));
  if (parsedRestorePayloads.every((result) => result.success)) {
    return mergeRestorePayloads(
      parsedRestorePayloads.map((result) =>
        result.success ? result.data : { albums: [], artists: [], tracks: [], plays: [] },
      ),
    );
  }

  if (payloads.every(Array.isArray)) {
    return payloads.flat();
  }

  throw new UnsupportedImportFormatError("Mixed JSON file formats are not supported");
}

function chunkArray<T>(items: T[], size: number): T[][] {
  if (size <= 0) {
    return [items];
  }

  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const map = new Map<string, T>();
  for (const item of items) {
    map.set(item.id, item);
  }
  return [...map.values()];
}

async function fetchExistingIds(
  ids: string[],
  finder: (chunk: string[]) => Promise<Array<{ id: string }>>,
): Promise<Set<string>> {
  const existing = new Set<string>();
  if (ids.length === 0) {
    return existing;
  }

  const uniqueIds = [...new Set(ids)];
  for (const chunk of chunkArray(uniqueIds, LOOKUP_BATCH_SIZE)) {
    const rows = await finder(chunk);
    for (const row of rows) {
      existing.add(row.id);
    }
  }

  return existing;
}

function formatPrismaImportError(error: Prisma.PrismaClientKnownRequestError): string {
  if (error.code === "P2003") {
    return "Import failed due to missing related records (track/artist/album).";
  }

  if (error.code === "P2024") {
    return "Import failed because the database timed out. Try importing a smaller file.";
  }

  if (error.code === "P2028") {
    return "Import transaction failed. Please retry.";
  }

  return "Import failed while writing data to the database.";
}

async function readImportPayload(request: NextRequest): Promise<unknown> {
  const contentLength = getContentLength(request);
  if (contentLength !== null && contentLength > MAX_JSON_IMPORT_BYTES) {
    throw new RequestTooLargeError("Payload exceeds 200MB");
  }

  if (isMultipartRequest(request)) {
    const formData = await request.formData();
    const files = [...formData.values()].filter((value): value is File => value instanceof File);

    if (files.length === 0) {
      throw new Error("Missing JSON file");
    }

    const totalFileSize = files.reduce((sum, file) => sum + file.size, 0);
    if (totalFileSize > MAX_JSON_IMPORT_BYTES) {
      throw new RequestTooLargeError("Payload exceeds 200MB");
    }

    const payloads: unknown[] = [];
    for (const file of files) {
      if (file.size > MAX_JSON_IMPORT_BYTES) {
        throw new RequestTooLargeError("Payload exceeds 200MB");
      }

      const text = await file.text();
      if (Buffer.byteLength(text, "utf8") > MAX_JSON_IMPORT_BYTES) {
        throw new RequestTooLargeError("Payload exceeds 200MB");
      }

      payloads.push(JSON.parse(text));
    }

    return mergeRawPayloads(payloads);
  }

  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > MAX_JSON_IMPORT_BYTES) {
    throw new RequestTooLargeError("Payload exceeds 200MB");
  }

  return mergeRawPayloads([JSON.parse(text)]);
}

function normalizeIsoDate(input: string): string | null {
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

function normalizePrivacyEndTime(input: string): string | null {
  const withTimeSeparator = input.includes("T") ? input : input.replace(" ", "T");
  const withZone = withTimeSeparator.endsWith("Z") ? withTimeSeparator : `${withTimeSeparator}Z`;
  return normalizeIsoDate(withZone);
}

function extractTrackIdFromSpotifyUri(uri: string | null): string | null {
  if (!uri) {
    return null;
  }

  const parts = uri.split(":");
  if (parts.length !== 3 || parts[1] !== "track") {
    return null;
  }

  const trackId = parts[2];
  if (!trackId || !SPOTIFY_TRACK_ID_REGEX.test(trackId)) {
    return null;
  }

  return trackId;
}

function buildNormalizedPayloadFromTrackEvents(
  events: Array<{ track: SpotifyTrack; playedAt: string }>,
): RestorePayload {
  const albumMap = new Map<string, RestorePayload["albums"][number]>();
  const artistMap = new Map<string, RestorePayload["artists"][number]>();
  const trackMap = new Map<string, RestorePayload["tracks"][number]>();
  const plays: RestorePayload["plays"] = [];

  for (const event of events) {
    const { track, playedAt } = event;

    if (!albumMap.has(track.album.id)) {
      albumMap.set(track.album.id, {
        id: track.album.id,
        name: track.album.name,
        releaseDate: track.album.release_date ?? null,
        imageUrl: track.album.images?.[0]?.url ?? null,
      });
    }

    for (const artist of track.artists) {
      if (!artistMap.has(artist.id)) {
        artistMap.set(artist.id, {
          id: artist.id,
          name: artist.name,
          imageUrl: artist.images?.[0]?.url ?? null,
          genres: artist.genres ?? [],
        });
      }
    }

    if (!trackMap.has(track.id)) {
      trackMap.set(track.id, {
        id: track.id,
        name: track.name,
        durationMs: track.duration_ms,
        albumId: track.album.id,
        artistIds: track.artists.map((artist) => artist.id),
        popularity: track.popularity ?? null,
        previewUrl: track.preview_url ?? null,
        imageUrl: track.album.images?.[0]?.url ?? null,
        danceability: null,
        energy: null,
        valence: null,
        tempo: null,
      });
    }

    plays.push({
      trackId: track.id,
      playedAt,
    });
  }

  return {
    albums: [...albumMap.values()],
    artists: [...artistMap.values()],
    tracks: [...trackMap.values()],
    plays,
  };
}

async function fetchTracksByIds(userId: string, trackIds: string[]): Promise<Map<string, SpotifyTrack>> {
  const validIds = [...new Set(trackIds)].filter((id) => SPOTIFY_TRACK_ID_REGEX.test(id));
  const trackMap = new Map<string, SpotifyTrack>();

  for (let i = 0; i < validIds.length; i += 50) {
    const chunkIds = validIds.slice(i, i + 50);
    if (chunkIds.length === 0) {
      continue;
    }

    try {
      const payload = await spotifyRequest<SpotifyTracksResponse>(
        userId,
        `/tracks?ids=${chunkIds.join(",")}`,
        undefined,
        { maxRetries: 5 },
      );

      for (const track of payload.tracks) {
        if (track) {
          trackMap.set(track.id, track);
        }
      }
    } catch (error) {
      // Fallback to per-track lookups to avoid failing full imports.
      for (const trackId of chunkIds) {
        try {
          const singlePayload = await spotifyRequest<SpotifyTracksResponse>(
            userId,
            `/tracks?ids=${trackId}`,
            undefined,
            { maxRetries: 2 },
          );
          const track = singlePayload.tracks[0];
          if (track) {
            trackMap.set(track.id, track);
          }
        } catch (singleError) {
          if (singleError instanceof SpotifyApiError) {
            console.warn(
              `[JSON import] Skipping unresolved track id ${trackId} (status ${singleError.status})`,
            );
          }
        }
      }

      if (error instanceof SpotifyApiError) {
        console.warn(
          `[JSON import] Track batch lookup failed with status ${error.status}; fallback applied`,
        );
      }
    }
  }

  return trackMap;
}

async function buildFromYourSpotifyFullPrivacy(
  userId: string,
  items: YourSpotifyFullPrivacyItem[],
): Promise<RestorePayload> {
  const trackIdToPlayedAt = new Map<string, string[]>();

  for (const item of items) {
    if (item.ms_played < MIN_MS_PLAYED) {
      continue;
    }

    const trackId = extractTrackIdFromSpotifyUri(item.spotify_track_uri);
    if (!trackId) {
      continue;
    }

    const playedAt = normalizeIsoDate(item.ts);
    if (!playedAt) {
      continue;
    }

    const current = trackIdToPlayedAt.get(trackId) ?? [];
    current.push(playedAt);
    trackIdToPlayedAt.set(trackId, current);
  }

  const trackMap = await fetchTracksByIds(userId, [...trackIdToPlayedAt.keys()]);

  const events: Array<{ track: SpotifyTrack; playedAt: string }> = [];
  for (const [trackId, playedAtList] of trackIdToPlayedAt.entries()) {
    const track = trackMap.get(trackId);
    if (!track) {
      continue;
    }

    for (const playedAt of playedAtList) {
      events.push({ track, playedAt });
    }
  }

  return buildNormalizedPayloadFromTrackEvents(events);
}

async function buildFromYourSpotifyPrivacy(
  userId: string,
  items: YourSpotifyPrivacyItem[],
): Promise<RestorePayload> {
  const uniqueTrackArtistPairs = new Map<string, { trackName: string; artistName: string }>();
  const searchCache = new Map<string, SpotifyTrack | null>();

  for (const item of items) {
    if (item.msPlayed < MIN_MS_PLAYED) {
      continue;
    }

    const key = `${item.trackName}\u0000${item.artistName}`;
    if (!uniqueTrackArtistPairs.has(key)) {
      uniqueTrackArtistPairs.set(key, {
        trackName: item.trackName,
        artistName: item.artistName,
      });
    }
  }

  for (const [key, value] of uniqueTrackArtistPairs.entries()) {
    try {
      const query = new URLSearchParams({
        q: `track:${value.trackName} artist:${value.artistName}`,
        type: "track",
        limit: "1",
      });

      const payload = await spotifyRequest<SpotifySearchTracksResponse>(
        userId,
        `/search?${query.toString()}`,
        undefined,
        { maxRetries: 5 },
      );

      searchCache.set(key, payload.tracks.items[0] ?? null);
    } catch (error) {
      if (error instanceof SpotifyApiError) {
        console.warn(
          `[JSON import] Search failed for ${value.trackName} - ${value.artistName} (status ${error.status})`,
        );
      }
      searchCache.set(key, null);
    }
  }

  const events: Array<{ track: SpotifyTrack; playedAt: string }> = [];
  for (const item of items) {
    if (item.msPlayed < MIN_MS_PLAYED) {
      continue;
    }

    const playedAt = normalizePrivacyEndTime(item.endTime);
    if (!playedAt) {
      continue;
    }

    const key = `${item.trackName}\u0000${item.artistName}`;
    const track = searchCache.get(key);
    if (!track) {
      continue;
    }

    events.push({ track, playedAt });
  }

  return buildNormalizedPayloadFromTrackEvents(events);
}

async function normalizeImportPayload(userId: string, payload: unknown): Promise<RestorePayload> {
  const restoreParsed = restoreSchema.safeParse(payload);
  if (restoreParsed.success) {
    return restoreParsed.data;
  }

  const fullPrivacyParsed = yourSpotifyFullPrivacySchema.safeParse(payload);
  if (fullPrivacyParsed.success) {
    return buildFromYourSpotifyFullPrivacy(userId, fullPrivacyParsed.data);
  }

  const privacyParsed = yourSpotifyPrivacySchema.safeParse(payload);
  if (privacyParsed.success) {
    return buildFromYourSpotifyPrivacy(userId, privacyParsed.data);
  }

  throw new UnsupportedImportFormatError("Unsupported JSON format");
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await readImportPayload(request);
  } catch (error) {
    if (error instanceof RequestTooLargeError) {
      return NextResponse.json(
        { error: "Import file too large. Maximum size is 200MB." },
        { status: 413 },
      );
    }

    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid JSON file" }, { status: 400 });
    }

    if (error instanceof Error && error.message === "Missing JSON file") {
      return NextResponse.json({ error: "Missing JSON file upload" }, { status: 400 });
    }

    if (error instanceof UnsupportedImportFormatError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ error: "Invalid restore payload" }, { status: 400 });
  }

  let data: RestorePayload;
  try {
    data = await normalizeImportPayload(user.id, payload);
  } catch (error) {
    if (error instanceof UnsupportedImportFormatError) {
      return NextResponse.json(
        {
          error:
            "Unsupported JSON format. Accepted: this app export JSON or your_spotify privacy/full-privacy JSON arrays.",
        },
        { status: 400 },
      );
    }

    if (error instanceof SpotifyApiError) {
      const status = error.status === 401 ? 401 : 400;
      return NextResponse.json(
        {
          error:
            status === 401
              ? "Spotify connection expired. Sign in with Spotify again, then retry import."
              : "Could not resolve tracks from JSON via Spotify API. Check file format and retry.",
        },
        { status },
      );
    }

    console.error("JSON normalization failed", error);
    return NextResponse.json({ error: "Invalid restore payload" }, { status: 400 });
  }

  try {
    const uniqueAlbums = dedupeById(data.albums);
    const uniqueArtists = dedupeById(data.artists);
    const uniqueTracks = dedupeById(data.tracks);

    const albumIdSet = new Set(uniqueAlbums.map((album) => album.id));
    const referencedAlbumIds = [
      ...new Set(
        uniqueTracks
          .map((track) => track.albumId)
          .filter((albumId): albumId is string => typeof albumId === "string" && albumId.length > 0),
      ),
    ];
    const missingAlbumIds = referencedAlbumIds.filter((albumId) => !albumIdSet.has(albumId));
    const existingAlbumIds = await fetchExistingIds(missingAlbumIds, (chunk) =>
      prisma.album.findMany({
        where: { id: { in: chunk } },
        select: { id: true },
      }),
    );
    for (const albumId of existingAlbumIds) {
      albumIdSet.add(albumId);
    }

    const artistIdSet = new Set(uniqueArtists.map((artist) => artist.id));
    const referencedArtistIds = [...new Set(uniqueTracks.flatMap((track) => track.artistIds))];
    const missingArtistIds = referencedArtistIds.filter((artistId) => !artistIdSet.has(artistId));
    const existingArtistIds = await fetchExistingIds(missingArtistIds, (chunk) =>
      prisma.artist.findMany({
        where: { id: { in: chunk } },
        select: { id: true },
      }),
    );
    for (const artistId of existingArtistIds) {
      artistIdSet.add(artistId);
    }

    const trackRows: NormalizedTrackRow[] = uniqueTracks.map((track) => {
      const validArtistIds = [...new Set(track.artistIds.filter((artistId) => artistIdSet.has(artistId)))];
      const validAlbumId = track.albumId && albumIdSet.has(track.albumId) ? track.albumId : null;

      return {
        id: track.id,
        name: track.name,
        durationMs: Math.max(1, Math.round(track.durationMs)),
        albumId: validAlbumId,
        artistIds: validArtistIds,
        popularity: track.popularity ?? null,
        previewUrl: track.previewUrl ?? null,
        imageUrl: track.imageUrl ?? null,
        danceability: track.danceability ?? null,
        energy: track.energy ?? null,
        valence: track.valence ?? null,
        tempo: track.tempo ?? null,
      };
    });

    const trackArtistMap = new Map<string, Prisma.TrackArtistCreateManyInput>();
    for (const track of trackRows) {
      for (const artistId of track.artistIds) {
        trackArtistMap.set(`${track.id}:${artistId}`, {
          trackId: track.id,
          artistId,
        });
      }
    }
    const trackArtistRows = [...trackArtistMap.values()];

    const knownTrackIds = new Set(trackRows.map((track) => track.id));
    const referencedPlayTrackIds = [...new Set(data.plays.map((play) => play.trackId))];
    const missingPlayTrackIds = referencedPlayTrackIds.filter((trackId) => !knownTrackIds.has(trackId));
    const existingTrackIds = await fetchExistingIds(missingPlayTrackIds, (chunk) =>
      prisma.track.findMany({
        where: { id: { in: chunk } },
        select: { id: true },
      }),
    );
    for (const trackId of existingTrackIds) {
      knownTrackIds.add(trackId);
    }

    const playRows: Prisma.PlayEventCreateManyInput[] = [];
    const uniquePlayKeys = new Set<string>();
    for (const play of data.plays) {
      if (!knownTrackIds.has(play.trackId)) {
        continue;
      }

      const parsedDate = new Date(play.playedAt);
      if (Number.isNaN(parsedDate.getTime())) {
        continue;
      }

      const playedAtIso = parsedDate.toISOString();
      const uniqueKey = `${play.trackId}:${playedAtIso}`;
      if (uniquePlayKeys.has(uniqueKey)) {
        continue;
      }

      uniquePlayKeys.add(uniqueKey);
      playRows.push({
        userId: user.id,
        trackId: play.trackId,
        playedAt: parsedDate,
        importSource: "json_restore",
      });
    }

    let insertedPlayCount = 0;
    await prisma.$transaction(async (transaction) => {
      for (const chunk of chunkArray(uniqueAlbums, CREATE_BATCH_SIZE)) {
        await transaction.album.createMany({
          data: chunk.map((album) => ({
            id: album.id,
            name: album.name,
            releaseDate: album.releaseDate ?? null,
            imageUrl: album.imageUrl ?? null,
          })),
          skipDuplicates: true,
        });
      }

      for (const chunk of chunkArray(uniqueArtists, CREATE_BATCH_SIZE)) {
        await transaction.artist.createMany({
          data: chunk.map((artist) => ({
            id: artist.id,
            name: artist.name,
            imageUrl: artist.imageUrl ?? null,
            genres: artist.genres,
          })),
          skipDuplicates: true,
        });
      }

      for (const chunk of chunkArray(trackRows, CREATE_BATCH_SIZE)) {
        await transaction.track.createMany({
          data: chunk.map((track) => ({
            id: track.id,
            name: track.name,
            durationMs: track.durationMs,
            albumId: track.albumId,
            artistIds: track.artistIds,
            popularity: track.popularity,
            previewUrl: track.previewUrl,
            imageUrl: track.imageUrl,
            danceability: track.danceability,
            energy: track.energy,
            valence: track.valence,
            tempo: track.tempo,
          })),
          skipDuplicates: true,
        });
      }

      for (const chunk of chunkArray(trackArtistRows, CREATE_BATCH_SIZE)) {
        await transaction.trackArtist.createMany({
          data: chunk,
          skipDuplicates: true,
        });
      }

      for (const chunk of chunkArray(playRows, PLAY_BATCH_SIZE)) {
        const chunkResult = await transaction.playEvent.createMany({
          data: chunk,
          skipDuplicates: true,
        });
        insertedPlayCount += chunkResult.count;
      }

      await transaction.user.update({
        where: { id: user.id },
        data: {
          lastImportAt: new Date(),
          lastImportStatus: `JSON restore completed (${insertedPlayCount} play events)`,
        },
      });
    });

    return NextResponse.json({
      ok: true,
      importedPlays: insertedPlayCount,
      importedTracks: trackRows.length,
      importedAlbums: uniqueAlbums.length,
      importedArtists: uniqueArtists.length,
      skippedPlays: data.plays.length - playRows.length,
    });
  } catch (error) {
    console.error("JSON restore failed", error);
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return NextResponse.json({ error: formatPrismaImportError(error) }, { status: 500 });
    }

    if (error instanceof Error && error.message) {
      return NextResponse.json({ error: `Restore failed: ${error.message}` }, { status: 500 });
    }

    return NextResponse.json({ error: "Restore failed" }, { status: 500 });
  }
}
