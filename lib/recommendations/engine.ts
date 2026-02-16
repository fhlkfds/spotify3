import { aggregateForRange } from "@/lib/analytics/service";
import type { TimeRange } from "@/lib/date-range";
import { prisma } from "@/lib/prisma";
import { spotifyRequest } from "@/lib/spotify/client";
import type {
  SpotifyArtistsResponse,
  SpotifyAudioFeaturesResponse,
  SpotifyRecommendationsResponse,
  SpotifyTrack,
} from "@/lib/spotify/types";

export type TasteProfile = {
  energy: number;
  danceability: number;
  valence: number;
  tempo: number;
};

export type DailyTrackRec = {
  id: string;
  name: string;
  artistNames: string[];
  albumId: string;
  albumName: string;
  imageUrl: string | null;
  previewUrl: string | null;
  score: number;
  reason: string;
};

export type DailyAlbumRec = {
  id: string;
  name: string;
  artistNames: string[];
  imageUrl: string | null;
  score: number;
  reason: string;
};

export type DailyRecommendations = {
  date: string;
  tracks: DailyTrackRec[];
  albums: DailyAlbumRec[];
  generatedAt: string;
  fromCache: boolean;
};

type CandidateWithScore = {
  track: SpotifyTrack;
  score: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const REGENERATE_COOLDOWN_MS = 60 * 60 * 1000;

function dateOnlyUtc(input: Date): Date {
  const copy = new Date(input);
  copy.setUTCHours(0, 0, 0, 0);
  return copy;
}

export function filterNewToMeTracks(
  candidates: SpotifyTrack[],
  listenedTrackIds: Set<string>,
): SpotifyTrack[] {
  return candidates.filter((track) => !listenedTrackIds.has(track.id));
}

function distance(a: TasteProfile, b: TasteProfile): number {
  const tempoDelta = Math.abs(a.tempo - b.tempo) / 220;
  return (
    Math.abs(a.energy - b.energy) +
    Math.abs(a.danceability - b.danceability) +
    Math.abs(a.valence - b.valence) +
    tempoDelta
  );
}

export function rankRecommendationCandidates(
  candidates: Array<{
    track: SpotifyTrack;
    features: TasteProfile | null;
    candidateGenres: string[];
  }>,
  profile: TasteProfile,
  knownArtistIds: Set<string>,
  knownGenres: Set<string>,
): CandidateWithScore[] {
  return candidates
    .map((candidate) => {
      const featureVector = candidate.features ?? {
        energy: 0.5,
        danceability: 0.5,
        valence: 0.5,
        tempo: 120,
      };

      const similarity = 1 - distance(profile, featureVector) / 4;
      const hasNewArtist = candidate.track.artists.every((artist) => !knownArtistIds.has(artist.id));
      const hasNewGenre = candidate.candidateGenres.some((genre) => !knownGenres.has(genre));

      const noveltyBoost = (hasNewArtist ? 0.07 : 0) + (hasNewGenre ? 0.04 : 0);

      return {
        track: candidate.track,
        score: Number((similarity + noveltyBoost).toFixed(4)),
      };
    })
    .sort((a, b) => b.score - a.score);
}

async function getTasteSeedData(userId: string): Promise<{
  profile: TasteProfile;
  seedTrackIds: string[];
  seedArtistIds: string[];
  seedGenres: string[];
}> {
  const allTimeRange: TimeRange = {
    from: new Date(Date.now() - 365 * DAY_MS),
    to: new Date(),
    preset: "custom",
  };

  const agg = await aggregateForRange(userId, allTimeRange);

  const profile: TasteProfile = {
    energy: agg.featureAverages.energy || 0.5,
    danceability: agg.featureAverages.danceability || 0.5,
    valence: agg.featureAverages.valence || 0.5,
    tempo: agg.featureAverages.tempo || 120,
  };

  return {
    profile,
    seedTrackIds: agg.songs.slice(0, 3).map((row) => row.id),
    seedArtistIds: agg.artists.slice(0, 3).map((row) => row.id),
    seedGenres: agg.genres
      .slice(0, 5)
      .map((row) => row.name)
      .filter((genre) => genre !== "Unknown"),
  };
}

async function fetchRecommendationCandidates(
  userId: string,
  profile: TasteProfile,
  seedTracks: string[],
  seedArtists: string[],
  seedGenres: string[],
): Promise<SpotifyTrack[]> {
  const seed_track_ids = seedTracks.slice(0, 2);
  const seed_artist_ids = seedArtists.slice(0, 2);
  const seed_genres = seedGenres.slice(0, 1);

  const params = new URLSearchParams({
    limit: "100",
    seed_tracks: seed_track_ids.join(","),
    seed_artists: seed_artist_ids.join(","),
    seed_genres: seed_genres.join(","),
    target_energy: String(profile.energy),
    target_danceability: String(profile.danceability),
    target_valence: String(profile.valence),
    target_tempo: String(profile.tempo),
  });

  const response = await spotifyRequest<SpotifyRecommendationsResponse>(
    userId,
    `/recommendations?${params.toString()}`,
    undefined,
    { maxRetries: 5 },
  );

  return response.tracks;
}

async function getAudioFeatureMap(
  userId: string,
  trackIds: string[],
): Promise<Map<string, TasteProfile>> {
  const featureMap = new Map<string, TasteProfile>();

  if (trackIds.length === 0) {
    return featureMap;
  }

  const payload = await spotifyRequest<SpotifyAudioFeaturesResponse>(
    userId,
    `/audio-features?ids=${trackIds.join(",")}`,
    undefined,
    {
      maxRetries: 5,
    },
  );

  for (const feature of payload.audio_features) {
    if (!feature) {
      continue;
    }

    featureMap.set(feature.id, {
      energy: feature.energy,
      danceability: feature.danceability,
      valence: feature.valence,
      tempo: feature.tempo,
    });
  }

  return featureMap;
}

async function getArtistGenres(
  userId: string,
  artistIds: string[],
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (artistIds.length === 0) {
    return map;
  }

  const chunkSize = 50;
  for (let i = 0; i < artistIds.length; i += chunkSize) {
    const ids = artistIds.slice(i, i + chunkSize);
    const payload = await spotifyRequest<SpotifyArtistsResponse>(
      userId,
      `/artists?ids=${ids.join(",")}`,
      undefined,
      { maxRetries: 5 },
    );

    for (const artist of payload.artists) {
      map.set(artist.id, artist.genres ?? []);
    }
  }

  return map;
}

function reasonForTrack(
  track: SpotifyTrack,
  knownArtistIds: Set<string>,
  seedGenres: string[],
  artistGenres: Map<string, string[]>,
): string {
  const knownArtist = track.artists.find((artist) => knownArtistIds.has(artist.id));
  if (knownArtist) {
    return `Because you like ${knownArtist.name}`;
  }

  for (const artist of track.artists) {
    const genres = artistGenres.get(artist.id) ?? [];
    const matchingGenre = genres.find((genre) => seedGenres.includes(genre));
    if (matchingGenre) {
      return `Because you listen to ${matchingGenre}`;
    }
  }

  return "Because it matches your current taste profile";
}

export async function generateDailyRecommendations(
  userId: string,
  forceRegenerate = false,
): Promise<DailyRecommendations> {
  const today = dateOnlyUtc(new Date());

  const existing = await prisma.dailyRecRun.findUnique({
    where: {
      userId_date: {
        userId,
        date: today,
      },
    },
  });

  if (existing && !forceRegenerate) {
    return {
      date: today.toISOString(),
      tracks: existing.tracks as DailyTrackRec[],
      albums: existing.albums as DailyAlbumRec[],
      generatedAt: existing.createdAt.toISOString(),
      fromCache: true,
    };
  }

  if (existing && forceRegenerate) {
    const now = Date.now();
    const createdAt = new Date(existing.createdAt).getTime();
    if (now - createdAt < REGENERATE_COOLDOWN_MS) {
      throw new Error("Regenerate limit reached. Try again in about an hour.");
    }
  }

  const [taste, listenedRows] = await Promise.all([
    getTasteSeedData(userId),
    prisma.playEvent.findMany({
      where: { userId },
      include: {
        track: {
          select: {
            albumId: true,
          },
        },
      },
    }),
  ]);

  const listenedTrackIds = new Set(listenedRows.map((row) => row.trackId));
  const listenedAlbumIds = new Set(listenedRows.map((row) => row.track.albumId).filter(Boolean) as string[]);

  const candidates = await fetchRecommendationCandidates(
    userId,
    taste.profile,
    taste.seedTrackIds,
    taste.seedArtistIds,
    taste.seedGenres,
  );

  const unseenTracks = filterNewToMeTracks(candidates, listenedTrackIds);

  const candidateArtistIds = [
    ...new Set(unseenTracks.flatMap((track) => track.artists.map((artist) => artist.id))),
  ];

  const [audioFeatureMap, candidateArtistGenres] = await Promise.all([
    getAudioFeatureMap(
      userId,
      unseenTracks.slice(0, 100).map((track) => track.id),
    ),
    getArtistGenres(userId, candidateArtistIds),
  ]);

  const knownArtistIds = new Set(taste.seedArtistIds);
  const knownGenres = new Set(taste.seedGenres);

  const ranked = rankRecommendationCandidates(
    unseenTracks.map((track) => ({
      track,
      features: audioFeatureMap.get(track.id) ?? null,
      candidateGenres: track.artists.flatMap((artist) => candidateArtistGenres.get(artist.id) ?? []),
    })),
    taste.profile,
    knownArtistIds,
    knownGenres,
  );

  const selectedTrackRecs: DailyTrackRec[] = ranked.slice(0, 10).map((row) => ({
    id: row.track.id,
    name: row.track.name,
    artistNames: row.track.artists.map((artist) => artist.name),
    albumId: row.track.album.id,
    albumName: row.track.album.name,
    imageUrl: row.track.album.images?.[0]?.url ?? null,
    previewUrl: row.track.preview_url ?? null,
    score: row.score,
    reason: reasonForTrack(row.track, knownArtistIds, taste.seedGenres, candidateArtistGenres),
  }));

  const albumMap = new Map<string, DailyAlbumRec>();

  for (const row of ranked) {
    const albumId = row.track.album.id;

    if (listenedAlbumIds.has(albumId) || albumMap.has(albumId)) {
      continue;
    }

    albumMap.set(albumId, {
      id: albumId,
      name: row.track.album.name,
      artistNames: row.track.album.artists?.map((artist) => artist.name) ??
        row.track.artists.map((artist) => artist.name),
      imageUrl: row.track.album.images?.[0]?.url ?? null,
      score: row.score,
      reason: reasonForTrack(row.track, knownArtistIds, taste.seedGenres, candidateArtistGenres),
    });

    if (albumMap.size >= 3) {
      break;
    }
  }

  const albumRecs = [...albumMap.values()].slice(0, 3);

  const rationale = {
    seeds: {
      tracks: taste.seedTrackIds,
      artists: taste.seedArtistIds,
      genres: taste.seedGenres,
    },
    profile: taste.profile,
  };

  if (existing) {
    await prisma.dailyRecRun.update({
      where: {
        userId_date: {
          userId,
          date: today,
        },
      },
      data: {
        tracks: selectedTrackRecs,
        albums: albumRecs,
        rationale,
        createdAt: new Date(),
      },
    });
  } else {
    await prisma.dailyRecRun.create({
      data: {
        userId,
        date: today,
        tracks: selectedTrackRecs,
        albums: albumRecs,
        rationale,
      },
    });
  }

  return {
    date: today.toISOString(),
    tracks: selectedTrackRecs,
    albums: albumRecs,
    generatedAt: new Date().toISOString(),
    fromCache: false,
  };
}
