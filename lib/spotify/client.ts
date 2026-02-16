import { getEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";

const SPOTIFY_API_BASE = "https://api.spotify.com/v1";

type SpotifyRequestOptions = {
  maxRetries?: number;
  onRateLimit?: () => Promise<void> | void;
};

export class SpotifyApiError extends Error {
  status: number;
  details: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "SpotifyApiError";
    this.status = status;
    this.details = details;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getBasicAuthHeader(clientId: string, clientSecret: string): string {
  return Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
}

export async function refreshSpotifyAccessToken(userId: string): Promise<string> {
  const env = getEnv();

  const token = await prisma.token.findUnique({ where: { userId } });
  if (!token) {
    throw new SpotifyApiError("No Spotify token found for user", 401);
  }

  const params = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: token.refreshToken,
  });

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${getBasicAuthHeader(env.SPOTIFY_CLIENT_ID, env.SPOTIFY_CLIENT_SECRET)}`,
    },
    body: params,
  });

  if (!response.ok) {
    const errBody = await safeJson(response);
    throw new SpotifyApiError("Failed to refresh Spotify token", response.status, errBody);
  }

  const json = (await response.json()) as {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
    scope?: string;
  };

  const expiresAt = new Date(Date.now() + json.expires_in * 1000);

  await prisma.token.update({
    where: { userId },
    data: {
      accessToken: json.access_token,
      expiresAt,
      refreshToken: json.refresh_token ?? token.refreshToken,
      scope: json.scope ?? token.scope,
    },
  });

  return json.access_token;
}

export async function getValidSpotifyAccessToken(userId: string): Promise<string> {
  const token = await prisma.token.findUnique({ where: { userId } });
  if (!token) {
    throw new SpotifyApiError("Spotify token missing", 401);
  }

  const refreshThreshold = new Date(Date.now() + 60 * 1000);
  if (token.expiresAt > refreshThreshold) {
    return token.accessToken;
  }

  return refreshSpotifyAccessToken(userId);
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function fetchSpotifyWithToken<T>(
  token: string,
  url: string,
  init?: RequestInit,
): Promise<{ response: Response; data: T | null }> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });

  const data = (await safeJson(response)) as T | null;
  return { response, data };
}

export async function spotifyRequest<T>(
  userId: string,
  pathOrUrl: string,
  init?: RequestInit,
  options?: SpotifyRequestOptions,
): Promise<T> {
  const maxRetries = options?.maxRetries ?? 5;
  let attempt = 0;
  let accessToken = await getValidSpotifyAccessToken(userId);

  const targetUrl = pathOrUrl.startsWith("http")
    ? pathOrUrl
    : `${SPOTIFY_API_BASE}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;

  while (attempt <= maxRetries) {
    const { response, data } = await fetchSpotifyWithToken<T>(accessToken, targetUrl, init);

    if (response.status === 401) {
      accessToken = await refreshSpotifyAccessToken(userId);
      attempt += 1;
      continue;
    }

    if (response.status === 429) {
      const retryAfter = Number(response.headers.get("retry-after") ?? "1");
      await options?.onRateLimit?.();
      await sleep(Math.max(1, retryAfter) * 1000 + Math.floor(Math.random() * 250));
      attempt += 1;
      continue;
    }

    if (!response.ok) {
      throw new SpotifyApiError(
        `Spotify API request failed: ${targetUrl}`,
        response.status,
        data,
      );
    }

    return data as T;
  }

  throw new SpotifyApiError("Spotify API retry limit reached", 429);
}
