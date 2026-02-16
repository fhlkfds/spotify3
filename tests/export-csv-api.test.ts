import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { GET } from "@/app/api/export/csv/route";

const mockGetCurrentUser = vi.fn();
const mockGetAnalyticsExportPayload = vi.fn();

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: () => mockGetCurrentUser(),
}));

vi.mock("@/lib/analytics/service", () => ({
  getAnalyticsExportPayload: (...args: unknown[]) => mockGetAnalyticsExportPayload(...args),
}));

describe("GET /api/export/csv", () => {
  beforeEach(() => {
    mockGetCurrentUser.mockReset();
    mockGetAnalyticsExportPayload.mockReset();
  });

  it("returns csv export for authenticated users", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-1" });
    mockGetAnalyticsExportPayload.mockResolvedValue({
      generatedAt: new Date().toISOString(),
      dashboard: {
        range: {
          from: new Date("2026-01-01T00:00:00.000Z"),
          to: new Date("2026-01-31T23:59:59.999Z"),
        },
        totalListeningHours: 50,
        totalUniqueSongs: 300,
        totalUniqueArtists: 120,
        totalUniqueAlbums: 90,
        listeningOverTime: [],
        topSongsPreview: [],
        topArtistsPreview: [],
        topAlbumsPreview: [],
      },
      topSongs: [{ rank: 1, id: "t1", name: "S1", imageUrl: null, playCount: 10, totalMinutes: 25, lastListened: null }],
      topArtists: [],
      topAlbums: [],
      topGenres: [],
      wrapped: {
        year: 2026,
        totalMinutes: 3000,
        topSong: null,
        topArtist: null,
        topAlbum: null,
        topGenres: [],
        personality: {
          label: "Balanced Explorer",
          description: "Test",
          traits: { energy: 0.5, danceability: 0.5, valence: 0.5, tempo: 120 },
        },
      },
    });

    const request = new NextRequest("http://localhost:3000/api/export/csv?preset=month");
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/csv");

    const text = await response.text();
    expect(text).toContain("Dashboard");
    expect(text).toContain("Top Songs");
    expect(text).toContain("Wrapped");
  });

  it("returns 401 for unauthenticated requests", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const request = new NextRequest("http://localhost:3000/api/export/csv");
    const response = await GET(request);

    expect(response.status).toBe(401);
  });
});
