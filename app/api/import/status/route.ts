import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const latestImport = await prisma.importRun.findFirst({
    where: { userId: user.id },
    orderBy: { startedAt: "desc" },
  });

  return NextResponse.json({
    latestImport,
    lastImportAt: user.lastImportAt,
    lastImportStatus: user.lastImportStatus,
  });
}
