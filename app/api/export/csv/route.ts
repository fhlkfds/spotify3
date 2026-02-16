import { NextRequest, NextResponse } from "next/server";

import { getAnalyticsExportPayload } from "@/lib/analytics/service";
import { getCurrentUser } from "@/lib/auth/session";
import { parseTimeRangeFromSearchParams } from "@/lib/date-range";
import { buildCsvReport } from "@/lib/export/report";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const range = parseTimeRangeFromSearchParams(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );
  const wrappedYear = Number(request.nextUrl.searchParams.get("year") ?? new Date().getFullYear());

  const payload = await getAnalyticsExportPayload(user.id, range, wrappedYear);
  const csv = buildCsvReport(payload);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="spotify-report-${Date.now()}.csv"`,
    },
  });
}
