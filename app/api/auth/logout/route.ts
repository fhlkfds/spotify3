import { NextRequest, NextResponse } from "next/server";

import { SESSION_COOKIE_NAME, clearSessionCookie, destroySession } from "@/lib/auth/session";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const rawToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  await destroySession(rawToken);

  const response = NextResponse.json({ ok: true });
  clearSessionCookie(response);
  return response;
}
