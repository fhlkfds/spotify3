import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";

export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  return NextResponse.json({
    authenticated: true,
    user: {
      id: user.id,
      spotifyId: user.spotifyId,
      displayName: user.displayName,
      image: user.image,
      email: user.email,
    },
  });
}
