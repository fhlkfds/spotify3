import { NextRequest, NextResponse } from "next/server";

import { getAnalyticsExportPayload } from "@/lib/analytics/service";
import { getCurrentUser } from "@/lib/auth/session";
import { parseTimeRangeFromSearchParams } from "@/lib/date-range";
import { buildPdfReport } from "@/lib/export/report";

export const runtime = "nodejs";

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
  const pdf = await buildPdfReport(payload);
  const pdfBytes = new Uint8Array(pdf);

  return new NextResponse(pdfBytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="spotify-report-${Date.now()}.pdf"`,
    },
  });
}
