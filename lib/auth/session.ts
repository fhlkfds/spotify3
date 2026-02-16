import { createHmac, randomBytes } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { type User } from "@prisma/client";

import { getEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";

export const SESSION_COOKIE_NAME = "spotify_tracker_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

function hashSessionToken(rawToken: string): string {
  const env = getEnv();
  return createHmac("sha256", env.SESSION_SECRET).update(rawToken).digest("hex");
}

function generateRawSessionToken(): string {
  return randomBytes(48).toString("hex");
}

export function attachSessionCookie(response: NextResponse, rawToken: string): void {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: rawToken,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export async function createSession(userId: string): Promise<string> {
  const rawToken = generateRawSessionToken();
  const sessionToken = hashSessionToken(rawToken);
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);

  await prisma.session.create({
    data: {
      userId,
      sessionToken,
      expiresAt,
    },
  });

  return rawToken;
}

export async function destroySession(rawToken: string | null | undefined): Promise<void> {
  if (!rawToken) {
    return;
  }

  const sessionToken = hashSessionToken(rawToken);
  await prisma.session.deleteMany({ where: { sessionToken } });
}

export async function getCurrentUser(): Promise<User | null> {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!rawToken) {
    return null;
  }

  const sessionToken = hashSessionToken(rawToken);

  const session = await prisma.session.findUnique({
    where: { sessionToken },
    include: { user: true },
  });

  if (!session || session.expiresAt < new Date()) {
    return null;
  }

  return session.user;
}

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/");
  }

  return user;
}
