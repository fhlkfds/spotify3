import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { generateDailyRecommendations } from "@/lib/recommendations/engine";

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
    return NextResponse.json({ error: "Failed to load recommendations" }, { status: 500 });
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
    const message = error instanceof Error ? error.message : "Failed to regenerate";
    const status = message.includes("Regenerate limit") ? 429 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
