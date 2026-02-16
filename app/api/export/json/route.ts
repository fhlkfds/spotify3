import { NextRequest, NextResponse } from "next/server";

import { getAnalyticsExportPayload } from "@/lib/analytics/service";
import { getCurrentUser } from "@/lib/auth/session";
import { parseTimeRangeFromSearchParams } from "@/lib/date-range";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const range = parseTimeRangeFromSearchParams(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );
  const wrappedYear = Number(request.nextUrl.searchParams.get("year") ?? new Date().getFullYear());

  const [payload, importRuns, playEvents] = await Promise.all([
    getAnalyticsExportPayload(user.id, range, wrappedYear),
    prisma.importRun.findMany({ where: { userId: user.id }, orderBy: { startedAt: "desc" } }),
    prisma.playEvent.findMany({ where: { userId: user.id }, orderBy: { playedAt: "desc" } }),
  ]);

  const trackIds = [...new Set(playEvents.map((event) => event.trackId))];
  const tracks = await prisma.track.findMany({ where: { id: { in: trackIds } } });

  const albumIds = [...new Set(tracks.map((track) => track.albumId).filter(Boolean))] as string[];
  const artistIds = [...new Set(tracks.flatMap((track) => track.artistIds))];

  const [albums, artists] = await Promise.all([
    prisma.album.findMany({ where: { id: { in: albumIds } } }),
    prisma.artist.findMany({ where: { id: { in: artistIds } } }),
  ]);

  return NextResponse.json({
    profile: {
      id: user.id,
      spotifyId: user.spotifyId,
      displayName: user.displayName,
      email: user.email,
      image: user.image,
      createdAt: user.createdAt,
    },
    importRuns,
    plays: playEvents,
    tracks,
    albums,
    artists,
    aggregates: payload,
  });
}
