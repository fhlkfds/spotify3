import type { TimeRange } from "@/lib/date-range";

export type TopEntityType = "songs" | "artists" | "albums" | "genres";

export type TopEntry = {
  rank: number;
  id: string;
  name: string;
  imageUrl: string | null;
  playCount: number;
  totalMinutes: number;
  lastListened: string | null;
};

export type DashboardStats = {
  range: TimeRange;
  totalListeningHours: number;
  totalUniqueSongs: number;
  totalUniqueArtists: number;
  totalUniqueAlbums: number;
  listeningOverTime: Array<{
    date: string;
    plays: number;
    minutes: number;
  }>;
  topSongsPreview: TopEntry[];
  topArtistsPreview: TopEntry[];
  topAlbumsPreview: TopEntry[];
};

export type WrappedSummary = {
  year: number;
  totalMinutes: number;
  topSong: TopEntry | null;
  topArtist: TopEntry | null;
  topAlbum: TopEntry | null;
  topGenres: TopEntry[];
  personality: {
    label: string;
    description: string;
    traits: {
      energy: number;
      danceability: number;
      valence: number;
      tempo: number;
    };
  };
};

export type AnalyticsExportPayload = {
  generatedAt: string;
  dashboard: DashboardStats;
  topSongs: TopEntry[];
  topArtists: TopEntry[];
  topAlbums: TopEntry[];
  topGenres: TopEntry[];
  wrapped: WrappedSummary;
};
