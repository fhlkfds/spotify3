export type SpotifyImage = {
  url: string;
  height?: number;
  width?: number;
};

export type SpotifyArtist = {
  id: string;
  name: string;
  genres?: string[];
  images?: SpotifyImage[];
};

export type SpotifyAlbum = {
  id: string;
  name: string;
  release_date?: string;
  images?: SpotifyImage[];
  artists?: SpotifyArtist[];
};

export type SpotifyTrack = {
  id: string;
  name: string;
  duration_ms: number;
  popularity?: number;
  preview_url?: string | null;
  album: SpotifyAlbum;
  artists: SpotifyArtist[];
};

export type SpotifyRecentlyPlayedItem = {
  track: SpotifyTrack;
  played_at: string;
};

export type SpotifyRecentlyPlayedResponse = {
  items: SpotifyRecentlyPlayedItem[];
  next: string | null;
};

export type SpotifyTopTracksResponse = {
  items: SpotifyTrack[];
};

export type SpotifyTopArtistsResponse = {
  items: SpotifyArtist[];
};

export type SpotifyArtistsResponse = {
  artists: SpotifyArtist[];
};

export type SpotifyAudioFeaturesResponse = {
  audio_features: Array<{
    id: string;
    danceability: number;
    energy: number;
    valence: number;
    tempo: number;
  } | null>;
};

export type SpotifyRecommendationsResponse = {
  tracks: SpotifyTrack[];
};
