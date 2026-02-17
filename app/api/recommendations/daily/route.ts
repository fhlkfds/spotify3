import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
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
    message.includes("No new tracks available")
  ) {
    return { status: 400, message };
  }

  if (message.includes("Regenerate limit")) {
    return { status: 429, message };
  }

  return { status: 500, message };
}

export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  const force = request.nextUrl.searchParams.get("force") === "1";

  try {
    const data = await generateDailyRecommendations(user.id, force);
    return NextResponse.json(data);
  } catch (error) {
    const mapped = mapRecommendationError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
