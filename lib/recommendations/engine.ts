import { aggregateForRange } from "@/lib/analytics/service";
import type { TimeRange } from "@/lib/date-range";
import { prisma } from "@/lib/prisma";
import { SpotifyApiError, spotifyRequest } from "@/lib/spotify/client";
import type {
  SpotifyArtistsResponse,
  SpotifyAudioFeaturesResponse,
  SpotifyRecommendationGenreSeedsResponse,
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

const REGENERATE_COOLDOWN_MS = 60 * 60 * 1000;
const MAX_SEEDS_PER_REQUEST = 5;

type ListenedSeedRow = {
  trackId: string;
  track: {
    albumId: string | null;
    artistIds: string[];
  };
};

type SeedRequest = {
  seedTracks: string[];
  seedArtists: string[];
  seedGenres: string[];
  label: string;
};

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
    from: new Date(0),
    to: new Date(),
    preset: "all",
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

function dedupeStrings(values: string[]): string[] {
  const deduped: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    deduped.push(normalized);
  }

  return deduped;
}

function sanitizeGenreToken(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}\s-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toGenreSeedCandidates(input: string): string[] {
  const normalized = sanitizeGenreToken(input);
  if (!normalized) {
    return [];
  }

  const collapsed = normalized.replace(/\s+/g, "-");
  const aliasCandidates: Record<string, string> = {
    "hip hop": "hip-hop",
    "hip-hop": "hip-hop",
    "r and b": "r-n-b",
    "rnb": "r-n-b",
    "drum and bass": "drum-and-bass",
    "k pop": "k-pop",
  };

  return dedupeStrings([normalized, collapsed, aliasCandidates[normalized] ?? ""]);
}

function clampSeedsToSpotifyLimit(seedRequest: SeedRequest): SeedRequest {
  const tracks = seedRequest.seedTracks.slice(0, 2);
  const artists = seedRequest.seedArtists.slice(0, 2);
  const remaining = MAX_SEEDS_PER_REQUEST - tracks.length - artists.length;
  const genres = remaining > 0 ? seedRequest.seedGenres.slice(0, remaining) : [];

  return {
    seedTracks: tracks,
    seedArtists: artists,
    seedGenres: genres,
    label: seedRequest.label,
  };
}

function hasAtLeastOneSeed(seedRequest: SeedRequest): boolean {
  return seedRequest.seedTracks.length + seedRequest.seedArtists.length + seedRequest.seedGenres.length > 0;
}

function buildSeedStrategyKey(seedRequest: SeedRequest): string {
  return [
    seedRequest.seedTracks.join(","),
    seedRequest.seedArtists.join(","),
    seedRequest.seedGenres.join(","),
  ].join("|");
}

function buildRecommendationRequestParams(profile: TasteProfile, seedRequest: SeedRequest): URLSearchParams {
  const params = new URLSearchParams({
    limit: "100",
    target_energy: String(profile.energy),
    target_danceability: String(profile.danceability),
    target_valence: String(profile.valence),
    target_tempo: String(profile.tempo),
  });

  if (seedRequest.seedTracks.length > 0) {
    params.set("seed_tracks", seedRequest.seedTracks.join(","));
  }

  if (seedRequest.seedArtists.length > 0) {
    params.set("seed_artists", seedRequest.seedArtists.join(","));
  }

  if (seedRequest.seedGenres.length > 0) {
    params.set("seed_genres", seedRequest.seedGenres.join(","));
  }

  return params;
}

async function getAvailableGenreSeeds(userId: string): Promise<Set<string>> {
  const response = await spotifyRequest<SpotifyRecommendationGenreSeedsResponse>(
    userId,
    "/recommendations/available-genre-seeds",
    undefined,
    { maxRetries: 3 },
  );

  return new Set(response.genres.map((genre) => genre.toLowerCase()));
}

function filterSupportedGenres(candidateGenres: string[], availableGenres: Set<string>): string[] {
  const accepted: string[] = [];
  const seen = new Set<string>();

  for (const genre of candidateGenres) {
    const alternatives = toGenreSeedCandidates(genre);
    const match = alternatives.find((candidate) => availableGenres.has(candidate));
    if (!match || seen.has(match)) {
      continue;
    }

    seen.add(match);
    accepted.push(match);
  }

  return accepted;
}

function topValuesByFrequency(values: string[], maxSize: number): string[] {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxSize)
    .map(([value]) => value);
}

function buildFallbackSeedsFromListening(rows: ListenedSeedRow[]): {
  seedTrackIds: string[];
  seedArtistIds: string[];
} {
  return {
    seedTrackIds: topValuesByFrequency(rows.map((row) => row.trackId), 5),
    seedArtistIds: topValuesByFrequency(rows.flatMap((row) => row.track.artistIds), 5),
  };
}

async function getFallbackGenresFromArtists(artistIds: string[]): Promise<string[]> {
  const dedupedArtistIds = dedupeStrings(artistIds);
  if (dedupedArtistIds.length === 0) {
    return [];
  }

  const artists = await prisma.artist.findMany({
    where: { id: { in: dedupedArtistIds } },
    select: {
      genres: true,
    },
  });

  return topValuesByFrequency(
    artists.flatMap((artist) => artist.genres).filter((genre) => genre !== "Unknown"),
    5,
  );
}

async function fetchRecommendationCandidates(
  userId: string,
  profile: TasteProfile,
  seedTracks: string[],
  seedArtists: string[],
  seedGenres: string[],
): Promise<SpotifyTrack[]> {
  const seedTrackIds = dedupeStrings(seedTracks).slice(0, MAX_SEEDS_PER_REQUEST);
  const seedArtistIds = dedupeStrings(seedArtists).slice(0, MAX_SEEDS_PER_REQUEST);

  if (seedTrackIds.length + seedArtistIds.length === 0 && seedGenres.length === 0) {
    throw new Error("Not enough listening data to generate recommendations yet.");
  }

  let availableGenres = new Set<string>();
  try {
    availableGenres = await getAvailableGenreSeeds(userId);
  } catch (error) {
    if (!(error instanceof SpotifyApiError)) {
      throw error;
    }

    if (error.status === 401 || error.status >= 500) {
      throw error;
    }
  }

  const supportedSeedGenres = filterSupportedGenres(seedGenres, availableGenres).slice(
    0,
    MAX_SEEDS_PER_REQUEST,
  );

  const requestedStrategies: SeedRequest[] = [
    {
      seedTracks: seedTrackIds,
      seedArtists: seedArtistIds,
      seedGenres: supportedSeedGenres,
      label: "tracks+artists+genres",
    },
    {
      seedTracks: seedTrackIds,
      seedArtists: seedArtistIds,
      seedGenres: [],
      label: "tracks+artists",
    },
    {
      seedTracks: seedTrackIds,
      seedArtists: [],
      seedGenres: [],
      label: "tracks-only",
    },
    {
      seedTracks: [],
      seedArtists: seedArtistIds,
      seedGenres: [],
      label: "artists-only",
    },
  ];

  const strategies: SeedRequest[] = [];
  const strategyKeys = new Set<string>();
  for (const strategy of requestedStrategies) {
    const constrained = clampSeedsToSpotifyLimit(strategy);
    if (!hasAtLeastOneSeed(constrained)) {
      continue;
    }

    const key = buildSeedStrategyKey(constrained);
    if (strategyKeys.has(key)) {
      continue;
    }

    strategyKeys.add(key);
    strategies.push(constrained);
  }

  if (strategies.length === 0) {
    throw new Error("Not enough listening data to generate recommendations yet.");
  }

  let lastClientError: SpotifyApiError | null = null;

  for (const strategy of strategies) {
    const params = buildRecommendationRequestParams(profile, strategy);

    try {
      const response = await spotifyRequest<SpotifyRecommendationsResponse>(
        userId,
        `/recommendations?${params.toString()}`,
        undefined,
        { maxRetries: 5 },
      );

      if (response.tracks.length > 0) {
        return response.tracks;
      }
    } catch (error) {
      if (error instanceof SpotifyApiError && error.status >= 400 && error.status < 500) {
        lastClientError = error;
        continue;
      }

      throw error;
    }
  }

  if (lastClientError) {
    throw new Error("Spotify could not generate recommendations from available seed combinations.");
  }

  throw new Error("Spotify returned no recommendation candidates for your profile.");
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
            artistIds: true,
          },
        },
      },
    }),
  ]);

  if (listenedRows.length === 0) {
    throw new Error("No listening history found. Import Spotify data first.");
  }

  const listenedTrackIds = new Set(listenedRows.map((row) => row.trackId));
  const listenedAlbumIds = new Set(listenedRows.map((row) => row.track.albumId).filter(Boolean) as string[]);
  const fallbackSeeds = buildFallbackSeedsFromListening(listenedRows);

  const seedTrackIds = dedupeStrings([...taste.seedTrackIds, ...fallbackSeeds.seedTrackIds]).slice(0, 5);
  const seedArtistIds = dedupeStrings([...taste.seedArtistIds, ...fallbackSeeds.seedArtistIds]).slice(0, 5);
  const seedGenres = taste.seedGenres.length ? taste.seedGenres : await getFallbackGenresFromArtists(seedArtistIds);

  const candidates = await fetchRecommendationCandidates(
    userId,
    taste.profile,
    seedTrackIds,
    seedArtistIds,
    seedGenres,
  );

  const unseenTracks = filterNewToMeTracks(candidates, listenedTrackIds);

  if (unseenTracks.length === 0) {
    throw new Error("No new tracks available right now. Try regenerating later.");
  }

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

  const knownArtistIds = new Set(seedArtistIds);
  const knownGenres = new Set(seedGenres);

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
    reason: reasonForTrack(row.track, knownArtistIds, seedGenres, candidateArtistGenres),
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
      reason: reasonForTrack(row.track, knownArtistIds, seedGenres, candidateArtistGenres),
    });

    if (albumMap.size >= 3) {
      break;
    }
  }

  const albumRecs = [...albumMap.values()].slice(0, 3);

  const rationale = {
    seeds: {
      tracks: seedTrackIds,
      artists: seedArtistIds,
      genres: seedGenres,
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
