import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { runSpotifyImport } from "@/lib/spotify/importer";

export async function POST(): Promise<NextResponse> {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const existingRun = await prisma.importRun.findFirst({
    where: {
      userId: user.id,
      status: "running",
      startedAt: {
        gte: new Date(Date.now() - 15 * 60 * 1000),
      },
    },
    orderBy: { startedAt: "desc" },
  });

  if (existingRun) {
    return NextResponse.json(
      {
        ok: true,
        alreadyRunning: true,
        importRunId: existingRun.id,
      },
      { status: 202 },
    );
  }

  const importRun = await prisma.importRun.create({
    data: {
      userId: user.id,
      status: "running",
      message: "Import queued",
    },
  });

  void runSpotifyImport(user.id, importRun.id).catch((error) => {
    console.error("Import pipeline failed", error);
  });

  return NextResponse.json({
    ok: true,
    importRunId: importRun.id,
  });
}
