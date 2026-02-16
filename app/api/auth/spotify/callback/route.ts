import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";

import { attachSessionCookie, createSession } from "@/lib/auth/session";
import { getEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";

const OAUTH_STATE_COOKIE = "spotify_oauth_state";
const OAUTH_VERIFIER_COOKIE = "spotify_oauth_verifier";

const callbackSchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
  error: z.string().optional(),
});

type SpotifyMeResponse = {
  id: string;
  display_name: string | null;
  email?: string;
  images?: Array<{ url: string }>;
};

function clearOAuthCookies(response: NextResponse): void {
  response.cookies.set({ name: OAUTH_STATE_COOKIE, value: "", maxAge: 0, path: "/" });
  response.cookies.set({ name: OAUTH_VERIFIER_COOKIE, value: "", maxAge: 0, path: "/" });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const env = getEnv();

  const parsed = callbackSchema.safeParse({
    code: request.nextUrl.searchParams.get("code") ?? undefined,
    state: request.nextUrl.searchParams.get("state") ?? undefined,
    error: request.nextUrl.searchParams.get("error") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.redirect(new URL("/?error=oauth_invalid_callback", env.APP_URL));
  }

  if (parsed.data.error) {
    return NextResponse.redirect(new URL(`/?error=${parsed.data.error}`, env.APP_URL));
  }

  const expectedState = request.cookies.get(OAUTH_STATE_COOKIE)?.value;
  const codeVerifier = request.cookies.get(OAUTH_VERIFIER_COOKIE)?.value;

  if (!expectedState || expectedState !== parsed.data.state || !codeVerifier) {
    return NextResponse.redirect(new URL("/?error=oauth_state_mismatch", env.APP_URL));
  }

  const tokenResponse = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: parsed.data.code,
      redirect_uri: env.SPOTIFY_REDIRECT_URI,
      code_verifier: codeVerifier,
    }),
  });

  if (!tokenResponse.ok) {
    return NextResponse.redirect(new URL("/?error=oauth_token_exchange_failed", env.APP_URL));
  }

  const tokenJson = (await tokenResponse.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope: string;
  };

  if (!tokenJson.refresh_token) {
    return NextResponse.redirect(new URL("/?error=oauth_refresh_missing", env.APP_URL));
  }

  const meResponse = await fetch("https://api.spotify.com/v1/me", {
    headers: {
      Authorization: `Bearer ${tokenJson.access_token}`,
    },
  });

  if (!meResponse.ok) {
    return NextResponse.redirect(new URL("/?error=oauth_profile_failed", env.APP_URL));
  }

  const me = (await meResponse.json()) as SpotifyMeResponse;

  const user = await prisma.user.upsert({
    where: { spotifyId: me.id },
    update: {
      displayName: me.display_name,
      email: me.email,
      image: me.images?.[0]?.url,
    },
    create: {
      spotifyId: me.id,
      displayName: me.display_name,
      email: me.email,
      image: me.images?.[0]?.url,
    },
  });

  await prisma.token.upsert({
    where: { userId: user.id },
    update: {
      accessToken: tokenJson.access_token,
      refreshToken: tokenJson.refresh_token,
      expiresAt: new Date(Date.now() + tokenJson.expires_in * 1000),
      scope: tokenJson.scope,
    },
    create: {
      userId: user.id,
      accessToken: tokenJson.access_token,
      refreshToken: tokenJson.refresh_token,
      expiresAt: new Date(Date.now() + tokenJson.expires_in * 1000),
      scope: tokenJson.scope,
    },
  });

  const rawSession = await createSession(user.id);

  const response = NextResponse.redirect(new URL("/dashboard", env.APP_URL));
  attachSessionCookie(response, rawSession);
  clearOAuthCookies(response);

  return response;
}
