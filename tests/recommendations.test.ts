import { describe, expect, it } from "vitest";

import {
  filterNewToMeTracks,
  rankRecommendationCandidates,
} from "@/lib/recommendations/engine";
import type { SpotifyTrack } from "@/lib/spotify/types";

function makeTrack(partial: Partial<SpotifyTrack> & Pick<SpotifyTrack, "id" | "name">): SpotifyTrack {
  return {
    id: partial.id,
    name: partial.name,
    duration_ms: partial.duration_ms ?? 180000,
    popularity: partial.popularity ?? 50,
    preview_url: partial.preview_url ?? null,
    album: partial.album ?? {
      id: `album-${partial.id}`,
      name: `Album ${partial.id}`,
      images: [],
    },
    artists: partial.artists ?? [],
  };
}

describe("recommendation engine", () => {
  it("filters out tracks the user has already listened to", () => {
    const candidates = [
      makeTrack({
        id: "track-1",
        name: "Known track",
        album: { id: "album-1", name: "A1" },
        artists: [],
      }),
      makeTrack({
        id: "track-2",
        name: "Fresh track",
        album: { id: "album-2", name: "A2" },
        artists: [],
      }),
    ];

    const unseen = filterNewToMeTracks(candidates, new Set(["track-1"]));

    expect(unseen).toHaveLength(1);
    expect(unseen[0]?.id).toBe("track-2");
  });

  it("ranks similar tracks higher while rewarding novelty", () => {
    const profile = {
      energy: 0.8,
      danceability: 0.75,
      valence: 0.7,
      tempo: 125,
    };

    const ranked = rankRecommendationCandidates(
      [
        {
          track: makeTrack({
            id: "near-match",
            name: "Near Match",
            artists: [{ id: "new-artist", name: "New Artist" }],
            album: { id: "a", name: "A" },
          }),
          features: {
            energy: 0.79,
            danceability: 0.74,
            valence: 0.72,
            tempo: 123,
          },
          candidateGenres: ["electropop"],
        },
        {
          track: makeTrack({
            id: "far-match",
            name: "Far Match",
            artists: [{ id: "known-artist", name: "Known" }],
            album: { id: "b", name: "B" },
          }),
          features: {
            energy: 0.2,
            danceability: 0.2,
            valence: 0.2,
            tempo: 80,
          },
          candidateGenres: ["rock"],
        },
      ],
      profile,
      new Set(["known-artist"]),
      new Set(["rock"]),
    );

    expect(ranked[0]?.track.id).toBe("near-match");
    expect(ranked[0]?.score).toBeGreaterThan(ranked[1]?.score ?? 0);
  });
});
