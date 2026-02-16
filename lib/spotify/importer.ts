import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { SpotifyApiError, spotifyRequest } from "@/lib/spotify/client";
import type {
  SpotifyArtistsResponse,
  SpotifyAudioFeaturesResponse,
  SpotifyRecentlyPlayedItem,
  SpotifyRecentlyPlayedResponse,
  SpotifyTopArtistsResponse,
  SpotifyTopTracksResponse,
  SpotifyTrack,
} from "@/lib/spotify/types";

type ImportSummary = {
  importRunId: string;
  importedPlays: number;
  importedTracks: number;
  rateLimitedHits: number;
  message: string;
};

type AudioFeatureEnrichmentSummary = {
  updatedCount: number;
  skippedCount: number;
};

const SPOTIFY_ID_REGEX = /^[A-Za-z0-9]{22}$/;

function chunk<T>(input: T[], size: number): T[][] {
  const output: T[][] = [];
  for (let i = 0; i < input.length; i += size) {
    output.push(input.slice(i, i + size));
  }
  return output;
}

function pickImage(input?: Array<{ url: string }>): string | null {
  if (!input || input.length === 0) {
    return null;
  }

  return input[0]?.url ?? null;
}

async function fetchRecentlyPlayed(
  userId: string,
  onRateLimit: () => Promise<void>,
  maxPages = 20,
): Promise<SpotifyRecentlyPlayedItem[]> {
  const rows: SpotifyRecentlyPlayedItem[] = [];
  let nextUrl: string | null = "/me/player/recently-played?limit=50";
  let page = 0;

  while (nextUrl && page < maxPages) {
    const payload: SpotifyRecentlyPlayedResponse = await spotifyRequest<SpotifyRecentlyPlayedResponse>(
      userId,
      nextUrl,
      undefined,
      {
        maxRetries: 5,
        onRateLimit,
      },
    );

    rows.push(...payload.items);
    nextUrl = payload.next;
    page += 1;
  }

  return rows;
}

async function fetchTopTracks(
  userId: string,
  onRateLimit: () => Promise<void>,
): Promise<SpotifyTrack[]> {
  const timeRanges = ["short_term", "medium_term", "long_term"];
  const all: SpotifyTrack[] = [];

  for (const timeRange of timeRanges) {
    const payload = await spotifyRequest<SpotifyTopTracksResponse>(
      userId,
      `/me/top/tracks?limit=50&time_range=${timeRange}`,
      undefined,
      { maxRetries: 5, onRateLimit },
    );
    all.push(...payload.items);
  }

  return all;
}

async function fetchTopArtists(
  userId: string,
  onRateLimit: () => Promise<void>,
): Promise<SpotifyTopArtistsResponse["items"]> {
  const payload = await spotifyRequest<SpotifyTopArtistsResponse>(
    userId,
    "/me/top/artists?limit=50&time_range=medium_term",
    undefined,
    { maxRetries: 5, onRateLimit },
  );

  return payload.items;
}

async function upsertTracksAndCoreMetadata(tracks: SpotifyTrack[]): Promise<string[]> {
  const processedTrackIds = new Set<string>();

  for (const track of tracks) {
    processedTrackIds.add(track.id);

    await prisma.album.upsert({
      where: { id: track.album.id },
      update: {
        name: track.album.name,
        releaseDate: track.album.release_date ?? null,
        imageUrl: pickImage(track.album.images),
      },
      create: {
        id: track.album.id,
        name: track.album.name,
        releaseDate: track.album.release_date ?? null,
        imageUrl: pickImage(track.album.images),
      },
    });

    const artistIds = track.artists.map((artist) => artist.id);

    await prisma.track.upsert({
      where: { id: track.id },
      update: {
        name: track.name,
        durationMs: track.duration_ms,
        albumId: track.album.id,
        artistIds,
        popularity: track.popularity ?? null,
        previewUrl: track.preview_url ?? null,
        imageUrl: pickImage(track.album.images),
      },
      create: {
        id: track.id,
        name: track.name,
        durationMs: track.duration_ms,
        albumId: track.album.id,
        artistIds,
        popularity: track.popularity ?? null,
        previewUrl: track.preview_url ?? null,
        imageUrl: pickImage(track.album.images),
      },
    });

    for (const artist of track.artists) {
      await prisma.artist.upsert({
        where: { id: artist.id },
        update: {
          name: artist.name,
          imageUrl: null,
        },
        create: {
          id: artist.id,
          name: artist.name,
          imageUrl: null,
          genres: [],
        },
      });

      await prisma.trackArtist.upsert({
        where: {
          trackId_artistId: {
            trackId: track.id,
            artistId: artist.id,
          },
        },
        update: {},
        create: {
          trackId: track.id,
          artistId: artist.id,
        },
      });
    }
  }

  return [...processedTrackIds];
}

async function enrichArtists(
  userId: string,
  artistIds: string[],
  onRateLimit: () => Promise<void>,
): Promise<void> {
  for (const ids of chunk(artistIds, 50)) {
    if (ids.length === 0) {
      continue;
    }

    const payload = await spotifyRequest<SpotifyArtistsResponse>(
      userId,
      `/artists?ids=${ids.join(",")}`,
      undefined,
      {
        maxRetries: 5,
        onRateLimit,
      },
    );

    for (const artist of payload.artists) {
      await prisma.artist.upsert({
        where: { id: artist.id },
        update: {
          name: artist.name,
          imageUrl: pickImage(artist.images),
          genres: artist.genres ?? [],
        },
        create: {
          id: artist.id,
          name: artist.name,
          imageUrl: pickImage(artist.images),
          genres: artist.genres ?? [],
        },
      });
    }
  }
}

async function enrichAudioFeatures(
  userId: string,
  trackIds: string[],
  onRateLimit: () => Promise<void>,
): Promise<AudioFeatureEnrichmentSummary> {
  const uniqueTrackIds = [...new Set(trackIds)];
  const validTrackIds = uniqueTrackIds.filter((id) => SPOTIFY_ID_REGEX.test(id));

  let updatedCount = 0;
  let skippedCount = uniqueTrackIds.length - validTrackIds.length;

  for (const ids of chunk(validTrackIds, 50)) {
    if (ids.length === 0) {
      continue;
    }

    try {
      const payload = await spotifyRequest<SpotifyAudioFeaturesResponse>(
        userId,
        `/audio-features?ids=${ids.join(",")}`,
        undefined,
        {
          maxRetries: 5,
          onRateLimit,
        },
      );

      for (const feature of payload.audio_features) {
        if (!feature) {
          skippedCount += 1;
          continue;
        }

        const updated = await prisma.track.updateMany({
          where: { id: feature.id },
          data: {
            danceability: feature.danceability,
            energy: feature.energy,
            valence: feature.valence,
            tempo: feature.tempo,
          },
        });

        if (updated.count > 0) {
          updatedCount += 1;
        } else {
          skippedCount += 1;
        }
      }
    } catch (error) {
      // Some IDs in a batch can fail audio-features lookup. Fallback to single-track lookups
      // so one invalid/non-track ID does not fail the entire import.
      for (const trackId of ids) {
        try {
          const singlePayload = await spotifyRequest<SpotifyAudioFeaturesResponse>(
            userId,
            `/audio-features?ids=${trackId}`,
            undefined,
            {
              maxRetries: 2,
              onRateLimit,
            },
          );

          const feature = singlePayload.audio_features[0];
          if (!feature) {
            skippedCount += 1;
            continue;
          }

          const updated = await prisma.track.updateMany({
            where: { id: feature.id },
            data: {
              danceability: feature.danceability,
              energy: feature.energy,
              valence: feature.valence,
              tempo: feature.tempo,
            },
          });

          if (updated.count > 0) {
            updatedCount += 1;
          } else {
            skippedCount += 1;
          }
        } catch (singleError) {
          if (singleError instanceof SpotifyApiError) {
            console.warn(
              `[Import] Skipping audio features for track ${trackId} (status ${singleError.status})`,
            );
          } else {
            console.warn(`[Import] Skipping audio features for track ${trackId}`);
          }
          skippedCount += 1;
        }
      }

      if (error instanceof SpotifyApiError) {
        console.warn(
          `[Import] Audio feature batch failed with status ${error.status}; continued with fallback`,
        );
      } else {
        console.warn("[Import] Audio feature batch failed; continued with fallback");
      }
    }
  }

  return { updatedCount, skippedCount };
}

async function storePlayEvents(userId: string, items: SpotifyRecentlyPlayedItem[]): Promise<number> {
  if (items.length === 0) {
    return 0;
  }

  const rows: Prisma.PlayEventCreateManyInput[] = items
    .filter((item) => item.track?.id && item.played_at)
    .map((item) => ({
      userId,
      trackId: item.track.id,
      playedAt: new Date(item.played_at),
      importSource: "recently_played",
    }));

  if (rows.length === 0) {
    return 0;
  }

  const result = await prisma.playEvent.createMany({
    data: rows,
    skipDuplicates: true,
  });

  return result.count;
}

export async function runSpotifyImport(userId: string, importRunId: string): Promise<ImportSummary> {
  let rateLimitedHits = 0;

  const onRateLimit = async () => {
    rateLimitedHits += 1;
    await prisma.importRun.update({
      where: { id: importRunId },
      data: {
        rateLimitedHits,
        message: "Spotify rate limit reached. Retrying with backoff...",
      },
    });
  };

  try {
    await prisma.importRun.update({
      where: { id: importRunId },
      data: { status: "running", message: "Fetching recently played tracks..." },
    });

    const recentlyPlayed = await fetchRecentlyPlayed(userId, onRateLimit);
    const topTracks = await fetchTopTracks(userId, onRateLimit);
    const topArtists = await fetchTopArtists(userId, onRateLimit);

    const mergedTracksMap = new Map<string, SpotifyTrack>();

    for (const item of recentlyPlayed) {
      mergedTracksMap.set(item.track.id, item.track);
    }

    for (const track of topTracks) {
      mergedTracksMap.set(track.id, track);
    }

    const mergedTracks = [...mergedTracksMap.values()];

    await prisma.importRun.update({
      where: { id: importRunId },
      data: {
        message: `Upserting ${mergedTracks.length} tracks and metadata...`,
      },
    });

    const importedTrackIds = await upsertTracksAndCoreMetadata(mergedTracks);

    const artistIdSet = new Set<string>();
    for (const track of mergedTracks) {
      track.artists.forEach((artist) => artistIdSet.add(artist.id));
    }
    topArtists.forEach((artist) => artistIdSet.add(artist.id));

    await prisma.importRun.update({
      where: { id: importRunId },
      data: {
        message: `Enriching ${artistIdSet.size} artists and audio features...`,
      },
    });

    await enrichArtists(userId, [...artistIdSet], onRateLimit);
    const audioFeatureSummary = await enrichAudioFeatures(userId, importedTrackIds, onRateLimit);

    const importedPlays = await storePlayEvents(userId, recentlyPlayed);

    const audioFeaturesNote =
      audioFeatureSummary.skippedCount > 0
        ? ` (audio features updated: ${audioFeatureSummary.updatedCount}, skipped: ${audioFeatureSummary.skippedCount})`
        : "";

    const completionMessage = `Import completed${audioFeaturesNote}`;

    await prisma.user.update({
      where: { id: userId },
      data: {
        lastImportAt: new Date(),
        lastImportStatus:
          rateLimitedHits > 0
            ? `${completionMessage} with ${rateLimitedHits} rate-limit retries`
            : completionMessage,
      },
    });

    await prisma.importRun.update({
      where: { id: importRunId },
      data: {
        status: "completed",
        importedPlays,
        importedTracks: importedTrackIds.length,
        rateLimitedHits,
        message: completionMessage,
        finishedAt: new Date(),
      },
    });

    return {
      importRunId,
      importedPlays,
      importedTracks: importedTrackIds.length,
      rateLimitedHits,
      message: completionMessage,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Spotify import failed for an unknown reason";

    await prisma.user.update({
      where: { id: userId },
      data: {
        lastImportStatus: `Import failed: ${message}`,
      },
    });

    await prisma.importRun.update({
      where: { id: importRunId },
      data: {
        status: "failed",
        message,
        finishedAt: new Date(),
        rateLimitedHits,
      },
    });

    throw error;
  }
}
