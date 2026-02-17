import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import type { DailyRecommendations } from "@/lib/recommendations/engine";
import { generateDailyRecommendations } from "@/lib/recommendations/engine";
import { SpotifyApiError } from "@/lib/spotify/client";

function mapRecommendationError(error: unknown): { status: number; message: string } {
  if (error instanceof SpotifyApiError) {
    if (error.status === 401) {
      return {
        status: 401,
        message: "Spotify connection expired. Sign in with Spotify again, then retry.",
      };
    }

    if (error.status === 429) {
      return {
        status: 429,
        message: "Spotify rate limit reached. Please retry in a minute.",
      };
    }

    if (error.status >= 400 && error.status < 500) {
      return {
        status: 400,
        message: "Spotify could not generate recommendations from the current seeds.",
      };
    }

    return {
      status: 502,
      message: "Spotify API request failed while generating recommendations.",
    };
  }

  const message = error instanceof Error ? error.message : "Failed to load recommendations";
  if (
    message.includes("No listening history") ||
    message.includes("Not enough listening data") ||
    message.includes("No new tracks available") ||
    message.includes("Spotify could not generate recommendations") ||
    message.includes("Spotify returned no recommendation candidates")
  ) {
    return { status: 400, message };
  }

  if (message.includes("Regenerate limit")) {
    return { status: 429, message };
  }

  return { status: 500, message };
}

function getDemoRecommendations(): DailyRecommendations {
  const generatedAt = new Date().toISOString();

  return {
    date: new Date().toISOString(),
    generatedAt,
    fromCache: false,
    tracks: [
      {
        id: "demo-track-1",
        name: "Neon Skyline",
        artistNames: ["Static Avenue"],
        albumId: "demo-album-1",
        albumName: "Night Transit",
        imageUrl: null,
        previewUrl: null,
        score: 0.91,
        reason: "Because you like energetic pop with bright synths",
      },
      {
        id: "demo-track-2",
        name: "Ocean Delay",
        artistNames: ["Luma Coast"],
        albumId: "demo-album-2",
        albumName: "Blue Frames",
        imageUrl: null,
        previewUrl: null,
        score: 0.9,
        reason: "Because you listen to melodic electronic vibes",
      },
      {
        id: "demo-track-3",
        name: "Pulse Theory",
        artistNames: ["Nova Drift"],
        albumId: "demo-album-3",
        albumName: "Frequency Lines",
        imageUrl: null,
        previewUrl: null,
        score: 0.89,
        reason: "Because it matches your danceability profile",
      },
      {
        id: "demo-track-4",
        name: "Afterlight",
        artistNames: ["Metric Echo"],
        albumId: "demo-album-4",
        albumName: "Urban Static",
        imageUrl: null,
        previewUrl: null,
        score: 0.88,
        reason: "Because you like moody late-night tracks",
      },
      {
        id: "demo-track-5",
        name: "Soft Voltage",
        artistNames: ["Amber Relay"],
        albumId: "demo-album-5",
        albumName: "Current Dreams",
        imageUrl: null,
        previewUrl: null,
        score: 0.87,
        reason: "Because you listen to modern alt-electro",
      },
      {
        id: "demo-track-6",
        name: "City Sleep",
        artistNames: ["Velvet Grid"],
        albumId: "demo-album-6",
        albumName: "Sleepless Maps",
        imageUrl: null,
        previewUrl: null,
        score: 0.86,
        reason: "Because you like downtempo with clean vocals",
      },
      {
        id: "demo-track-7",
        name: "Orbit Room",
        artistNames: ["Signal Bloom"],
        albumId: "demo-album-7",
        albumName: "Parallax",
        imageUrl: null,
        previewUrl: null,
        score: 0.85,
        reason: "Because you enjoy upbeat electronic rhythms",
      },
      {
        id: "demo-track-8",
        name: "Glare",
        artistNames: ["North Coast Club"],
        albumId: "demo-album-8",
        albumName: "Open Lanes",
        imageUrl: null,
        previewUrl: null,
        score: 0.84,
        reason: "Because it is similar to your top synth-pop picks",
      },
      {
        id: "demo-track-9",
        name: "Echo Harbor",
        artistNames: ["Prism Talk"],
        albumId: "demo-album-9",
        albumName: "Mirror Tide",
        imageUrl: null,
        previewUrl: null,
        score: 0.83,
        reason: "Because you like smooth tempo and positive valence",
      },
      {
        id: "demo-track-10",
        name: "Parallel Motion",
        artistNames: ["Chrome Quiet"],
        albumId: "demo-album-10",
        albumName: "Transit Tape",
        imageUrl: null,
        previewUrl: null,
        score: 0.82,
        reason: "Because it aligns with your all-time taste profile",
      },
    ],
    albums: [
      {
        id: "demo-rec-album-1",
        name: "Night Transit",
        artistNames: ["Static Avenue"],
        imageUrl: null,
        score: 0.9,
        reason: "Because you often replay energetic synth tracks",
      },
      {
        id: "demo-rec-album-2",
        name: "Blue Frames",
        artistNames: ["Luma Coast"],
        imageUrl: null,
        score: 0.88,
        reason: "Because you like melodic chill-electronic records",
      },
      {
        id: "demo-rec-album-3",
        name: "Frequency Lines",
        artistNames: ["Nova Drift"],
        imageUrl: null,
        score: 0.87,
        reason: "Because it matches your tempo and valence averages",
      },
    ],
  };
}

function isDemoMode(request: NextRequest): boolean {
  return request.nextUrl.searchParams.get("demo") === "1";
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (isDemoMode(request)) {
    return NextResponse.json(getDemoRecommendations());
  }

  try {
    const data = await generateDailyRecommendations(user.id, false);
    return NextResponse.json(data);
  } catch (error) {
    console.error("Failed to load daily recommendations", error);
    const mapped = mapRecommendationError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (isDemoMode(request)) {
    return NextResponse.json(getDemoRecommendations());
  }

  const force = request.nextUrl.searchParams.get("force") === "1";

  try {
    const data = await generateDailyRecommendations(user.id, force);
    return NextResponse.json(data);
  } catch (error) {
    const mapped = mapRecommendationError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
