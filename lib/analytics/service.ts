import { endOfYear, startOfYear } from "date-fns";

import type { TimeRange } from "@/lib/date-range";
import { prisma } from "@/lib/prisma";

import type {
  AnalyticsExportPayload,
  DashboardStats,
  TopEntityType,
  TopEntry,
  WrappedSummary,
} from "@/lib/analytics/types";

type AggregateAccumulator = {
  id: string;
  name: string;
  imageUrl: string | null;
  playCount: number;
  totalMinutes: number;
  lastListened: Date | null;
};

type AggregationResult = {
  totalListeningHours: number;
  totalUniqueSongs: number;
  totalUniqueArtists: number;
  totalUniqueAlbums: number;
  listeningOverTime: DashboardStats["listeningOverTime"];
  songs: TopEntry[];
  artists: TopEntry[];
  albums: TopEntry[];
  genres: TopEntry[];
  featureAverages: {
    energy: number;
    danceability: number;
    valence: number;
    tempo: number;
  };
};

function sortEntries(input: TopEntry[], sortBy: "plays" | "minutes" | "recent"): TopEntry[] {
  const sorted = [...input];

  if (sortBy === "minutes") {
    sorted.sort((a, b) => b.totalMinutes - a.totalMinutes);
  } else if (sortBy === "recent") {
    sorted.sort((a, b) => {
      if (!a.lastListened) return 1;
      if (!b.lastListened) return -1;
      return new Date(b.lastListened).getTime() - new Date(a.lastListened).getTime();
    });
  } else {
    sorted.sort((a, b) => b.playCount - a.playCount);
  }

  return sorted.map((entry, index) => ({ ...entry, rank: index + 1 }));
}

function toTopEntries(map: Map<string, AggregateAccumulator>): TopEntry[] {
  return [...map.values()].map((value) => ({
    rank: 0,
    id: value.id,
    name: value.name,
    imageUrl: value.imageUrl,
    playCount: value.playCount,
    totalMinutes: Number(value.totalMinutes.toFixed(1)),
    lastListened: value.lastListened ? value.lastListened.toISOString() : null,
  }));
}

export async function aggregateForRange(userId: string, range: TimeRange): Promise<AggregationResult> {
  const playEvents = await prisma.playEvent.findMany({
    where: {
      userId,
      playedAt: {
        gte: range.from,
        lte: range.to,
      },
    },
    orderBy: {
      playedAt: "desc",
    },
    include: {
      track: true,
    },
  });

  if (playEvents.length === 0) {
    return {
      totalListeningHours: 0,
      totalUniqueSongs: 0,
      totalUniqueArtists: 0,
      totalUniqueAlbums: 0,
      listeningOverTime: [],
      songs: [],
      artists: [],
      albums: [],
      genres: [],
      featureAverages: {
        energy: 0,
        danceability: 0,
        valence: 0,
        tempo: 0,
      },
    };
  }

  const trackIds = [...new Set(playEvents.map((event) => event.trackId))];
  const tracks = await prisma.track.findMany({
    where: {
      id: {
        in: trackIds,
      },
    },
  });

  const trackMap = new Map(tracks.map((track) => [track.id, track]));

  const artistIds = new Set<string>();
  const albumIds = new Set<string>();

  tracks.forEach((track) => {
    track.artistIds.forEach((artistId) => artistIds.add(artistId));
    if (track.albumId) {
      albumIds.add(track.albumId);
    }
  });

  const [artists, albums] = await Promise.all([
    prisma.artist.findMany({ where: { id: { in: [...artistIds] } } }),
    prisma.album.findMany({ where: { id: { in: [...albumIds] } } }),
  ]);

  const artistMap = new Map(artists.map((artist) => [artist.id, artist]));
  const albumMap = new Map(albums.map((album) => [album.id, album]));

  const songAgg = new Map<string, AggregateAccumulator>();
  const artistAgg = new Map<string, AggregateAccumulator>();
  const albumAgg = new Map<string, AggregateAccumulator>();
  const genreAgg = new Map<string, AggregateAccumulator>();
  const dailyAgg = new Map<string, { plays: number; minutes: number }>();

  const uniqueTrackIds = new Set<string>();
  const uniqueArtistIds = new Set<string>();
  const uniqueAlbumIds = new Set<string>();

  let totalListeningMs = 0;
  let featureWeight = 0;
  let featureEnergy = 0;
  let featureDanceability = 0;
  let featureValence = 0;
  let featureTempo = 0;

  for (const event of playEvents) {
    const track = trackMap.get(event.trackId);
    if (!track) {
      continue;
    }

    const minutes = track.durationMs / 1000 / 60;
    totalListeningMs += track.durationMs;

    uniqueTrackIds.add(track.id);
    if (track.albumId) {
      uniqueAlbumIds.add(track.albumId);
    }

    if (
      track.energy !== null &&
      track.danceability !== null &&
      track.valence !== null &&
      track.tempo !== null
    ) {
      featureEnergy += track.energy;
      featureDanceability += track.danceability;
      featureValence += track.valence;
      featureTempo += track.tempo;
      featureWeight += 1;
    }

    const dateKey = event.playedAt.toISOString().slice(0, 10);
    const daily = dailyAgg.get(dateKey) ?? { plays: 0, minutes: 0 };
    daily.plays += 1;
    daily.minutes += minutes;
    dailyAgg.set(dateKey, daily);

    const songEntry = songAgg.get(track.id) ?? {
      id: track.id,
      name: track.name,
      imageUrl: track.imageUrl,
      playCount: 0,
      totalMinutes: 0,
      lastListened: null,
    };

    songEntry.playCount += 1;
    songEntry.totalMinutes += minutes;
    songEntry.lastListened =
      !songEntry.lastListened || event.playedAt > songEntry.lastListened
        ? event.playedAt
        : songEntry.lastListened;
    songAgg.set(track.id, songEntry);

    if (track.albumId) {
      const album = albumMap.get(track.albumId);
      const albumEntry = albumAgg.get(track.albumId) ?? {
        id: track.albumId,
        name: album?.name ?? "Unknown Album",
        imageUrl: album?.imageUrl ?? null,
        playCount: 0,
        totalMinutes: 0,
        lastListened: null,
      };

      albumEntry.playCount += 1;
      albumEntry.totalMinutes += minutes;
      albumEntry.lastListened =
        !albumEntry.lastListened || event.playedAt > albumEntry.lastListened
          ? event.playedAt
          : albumEntry.lastListened;
      albumAgg.set(track.albumId, albumEntry);
    }

    for (const artistId of track.artistIds) {
      uniqueArtistIds.add(artistId);

      const artist = artistMap.get(artistId);
      const artistEntry = artistAgg.get(artistId) ?? {
        id: artistId,
        name: artist?.name ?? "Unknown Artist",
        imageUrl: artist?.imageUrl ?? null,
        playCount: 0,
        totalMinutes: 0,
        lastListened: null,
      };

      artistEntry.playCount += 1;
      artistEntry.totalMinutes += minutes;
      artistEntry.lastListened =
        !artistEntry.lastListened || event.playedAt > artistEntry.lastListened
          ? event.playedAt
          : artistEntry.lastListened;
      artistAgg.set(artistId, artistEntry);

      const genres = artist?.genres.length ? artist.genres : ["Unknown"];
      for (const genre of genres) {
        const genreEntry = genreAgg.get(genre) ?? {
          id: genre,
          name: genre,
          imageUrl: null,
          playCount: 0,
          totalMinutes: 0,
          lastListened: null,
        };

        genreEntry.playCount += 1;
        genreEntry.totalMinutes += minutes;
        genreEntry.lastListened =
          !genreEntry.lastListened || event.playedAt > genreEntry.lastListened
            ? event.playedAt
            : genreEntry.lastListened;
        genreAgg.set(genre, genreEntry);
      }
    }
  }

  const songs = sortEntries(toTopEntries(songAgg), "plays");
  const artistsSorted = sortEntries(toTopEntries(artistAgg), "plays");
  const albumsSorted = sortEntries(toTopEntries(albumAgg), "plays");
  const genresSorted = sortEntries(toTopEntries(genreAgg), "plays");

  return {
    totalListeningHours: Number((totalListeningMs / 1000 / 60 / 60).toFixed(2)),
    totalUniqueSongs: uniqueTrackIds.size,
    totalUniqueArtists: uniqueArtistIds.size,
    totalUniqueAlbums: uniqueAlbumIds.size,
    listeningOverTime: [...dailyAgg.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, value]) => ({
        date,
        plays: value.plays,
        minutes: Number(value.minutes.toFixed(1)),
      })),
    songs,
    artists: artistsSorted,
    albums: albumsSorted,
    genres: genresSorted,
    featureAverages: {
      energy: featureWeight > 0 ? Number((featureEnergy / featureWeight).toFixed(3)) : 0,
      danceability:
        featureWeight > 0 ? Number((featureDanceability / featureWeight).toFixed(3)) : 0,
      valence: featureWeight > 0 ? Number((featureValence / featureWeight).toFixed(3)) : 0,
      tempo: featureWeight > 0 ? Number((featureTempo / featureWeight).toFixed(1)) : 0,
    },
  };
}

export async function getDashboardStats(userId: string, range: TimeRange): Promise<DashboardStats> {
  const data = await aggregateForRange(userId, range);

  return {
    range,
    totalListeningHours: data.totalListeningHours,
    totalUniqueSongs: data.totalUniqueSongs,
    totalUniqueArtists: data.totalUniqueArtists,
    totalUniqueAlbums: data.totalUniqueAlbums,
    listeningOverTime: data.listeningOverTime,
    topSongsPreview: data.songs.slice(0, 5),
    topArtistsPreview: data.artists.slice(0, 5),
    topAlbumsPreview: data.albums.slice(0, 5),
  };
}

export async function getTopEntries(
  userId: string,
  range: TimeRange,
  type: TopEntityType,
  options?: {
    search?: string;
    sort?: "plays" | "minutes" | "recent";
  },
): Promise<TopEntry[]> {
  const data = await aggregateForRange(userId, range);

  const sortBy = options?.sort ?? "plays";
  const search = options?.search?.toLowerCase().trim();

  const source =
    type === "songs"
      ? data.songs
      : type === "artists"
        ? data.artists
        : type === "albums"
          ? data.albums
          : data.genres;

  const filtered = search
    ? source.filter((row) => row.name.toLowerCase().includes(search))
    : source;

  return sortEntries(filtered, sortBy);
}

function classifyPersonality(features: {
  energy: number;
  danceability: number;
  valence: number;
  tempo: number;
}): WrappedSummary["personality"] {
  if (features.energy > 0.72 && features.danceability > 0.67) {
    return {
      label: "Festival Igniter",
      description: "High-energy and rhythmic picks dominate your listening profile.",
      traits: features,
    };
  }

  if (features.valence > 0.66 && features.energy < 0.55) {
    return {
      label: "Sunlit Wanderer",
      description: "You favor uplifting tracks with a calmer sonic pace.",
      traits: features,
    };
  }

  if (features.valence < 0.45 && features.energy < 0.55) {
    return {
      label: "Midnight Thinker",
      description: "Introspective, low-key tracks shape most of your sessions.",
      traits: features,
    };
  }

  return {
    label: "Balanced Explorer",
    description: "Your taste spans moods and tempos with consistent variety.",
    traits: features,
  };
}

export async function getWrappedSummary(userId: string, year: number): Promise<WrappedSummary> {
  const range: TimeRange = {
    from: startOfYear(new Date(year, 0, 1)),
    to: endOfYear(new Date(year, 11, 31)),
    preset: "custom",
  };

  const data = await aggregateForRange(userId, range);

  return {
    year,
    totalMinutes: Number((data.totalListeningHours * 60).toFixed(1)),
    topSong: data.songs[0] ?? null,
    topArtist: data.artists[0] ?? null,
    topAlbum: data.albums[0] ?? null,
    topGenres: data.genres.slice(0, 5),
    personality: classifyPersonality(data.featureAverages),
  };
}

export async function getAnalyticsExportPayload(
  userId: string,
  range: TimeRange,
  wrappedYear?: number,
): Promise<AnalyticsExportPayload> {
  const [dashboard, topSongs, topArtists, topAlbums, topGenres, wrapped] = await Promise.all([
    getDashboardStats(userId, range),
    getTopEntries(userId, range, "songs"),
    getTopEntries(userId, range, "artists"),
    getTopEntries(userId, range, "albums"),
    getTopEntries(userId, range, "genres"),
    getWrappedSummary(userId, wrappedYear ?? new Date().getFullYear()),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    dashboard,
    topSongs,
    topArtists,
    topAlbums,
    topGenres,
    wrapped,
  };
}
