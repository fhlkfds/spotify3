import { NextResponse } from "next/server";

import { getEnv } from "@/lib/env";
import {
  generateCodeChallenge,
  generateCodeVerifier,
  generateOAuthState,
} from "@/lib/spotify/pkce";

const OAUTH_STATE_COOKIE = "spotify_oauth_state";
const OAUTH_VERIFIER_COOKIE = "spotify_oauth_verifier";

export async function GET(): Promise<NextResponse> {
  const env = getEnv();
  const state = generateOAuthState();
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: env.SPOTIFY_CLIENT_ID,
    scope: env.SPOTIFY_SCOPES,
    redirect_uri: env.SPOTIFY_REDIRECT_URI,
    state,
    code_challenge_method: "S256",
    code_challenge: codeChallenge,
    show_dialog: "false",
  });

  const response = NextResponse.redirect(`https://accounts.spotify.com/authorize?${params}`);

  response.cookies.set({
    name: OAUTH_STATE_COOKIE,
    value: state,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  response.cookies.set({
    name: OAUTH_VERIFIER_COOKIE,
    value: codeVerifier,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  return response;
}
