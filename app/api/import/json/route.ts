import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const MAX_JSON_IMPORT_BYTES = 200 * 1024 * 1024;

const restoreSchema = z.object({
  albums: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        releaseDate: z.string().nullable().optional(),
        imageUrl: z.string().nullable().optional(),
      }),
    )
    .default([]),
  artists: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        imageUrl: z.string().nullable().optional(),
        genres: z.array(z.string()).default([]),
      }),
    )
    .default([]),
  tracks: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        durationMs: z.number(),
        albumId: z.string().nullable().optional(),
        artistIds: z.array(z.string()).default([]),
        popularity: z.number().nullable().optional(),
        previewUrl: z.string().nullable().optional(),
        imageUrl: z.string().nullable().optional(),
        danceability: z.number().nullable().optional(),
        energy: z.number().nullable().optional(),
        valence: z.number().nullable().optional(),
        tempo: z.number().nullable().optional(),
      }),
    )
    .default([]),
  plays: z
    .array(
      z.object({
        trackId: z.string(),
        playedAt: z.string(),
      }),
    )
    .default([]),
});

class RequestTooLargeError extends Error {}

function getContentLength(request: NextRequest): number | null {
  const value = request.headers.get("content-length");
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isMultipartRequest(request: NextRequest): boolean {
  const contentType = request.headers.get("content-type");
  return Boolean(contentType && contentType.includes("multipart/form-data"));
}

async function readImportPayload(request: NextRequest): Promise<unknown> {
  const contentLength = getContentLength(request);
  if (contentLength !== null && contentLength > MAX_JSON_IMPORT_BYTES) {
    throw new RequestTooLargeError("Payload exceeds 200MB");
  }

  if (isMultipartRequest(request)) {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      throw new Error("Missing JSON file");
    }

    if (file.size > MAX_JSON_IMPORT_BYTES) {
      throw new RequestTooLargeError("Payload exceeds 200MB");
    }

    const text = await file.text();
    if (Buffer.byteLength(text, "utf8") > MAX_JSON_IMPORT_BYTES) {
      throw new RequestTooLargeError("Payload exceeds 200MB");
    }

    return JSON.parse(text);
  }

  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > MAX_JSON_IMPORT_BYTES) {
    throw new RequestTooLargeError("Payload exceeds 200MB");
  }

  return JSON.parse(text);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await readImportPayload(request);
  } catch (error) {
    if (error instanceof RequestTooLargeError) {
      return NextResponse.json(
        { error: "Import file too large. Maximum size is 200MB." },
        { status: 413 },
      );
    }

    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid JSON file" }, { status: 400 });
    }

    if (error instanceof Error && error.message === "Missing JSON file") {
      return NextResponse.json({ error: "Missing JSON file upload" }, { status: 400 });
    }

    return NextResponse.json({ error: "Invalid restore payload" }, { status: 400 });
  }

  const parsed = restoreSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid restore payload" }, { status: 400 });
  }

  const data = parsed.data;

  try {
    for (const album of data.albums) {
      await prisma.album.upsert({
        where: { id: album.id },
        update: {
          name: album.name,
          releaseDate: album.releaseDate ?? null,
          imageUrl: album.imageUrl ?? null,
        },
        create: {
          id: album.id,
          name: album.name,
          releaseDate: album.releaseDate ?? null,
          imageUrl: album.imageUrl ?? null,
        },
      });
    }

    for (const artist of data.artists) {
      await prisma.artist.upsert({
        where: { id: artist.id },
        update: {
          name: artist.name,
          imageUrl: artist.imageUrl ?? null,
          genres: artist.genres,
        },
        create: {
          id: artist.id,
          name: artist.name,
          imageUrl: artist.imageUrl ?? null,
          genres: artist.genres,
        },
      });
    }

    for (const track of data.tracks) {
      await prisma.track.upsert({
        where: { id: track.id },
        update: {
          name: track.name,
          durationMs: track.durationMs,
          albumId: track.albumId ?? null,
          artistIds: track.artistIds,
          popularity: track.popularity ?? null,
          previewUrl: track.previewUrl ?? null,
          imageUrl: track.imageUrl ?? null,
          danceability: track.danceability ?? null,
          energy: track.energy ?? null,
          valence: track.valence ?? null,
          tempo: track.tempo ?? null,
        },
        create: {
          id: track.id,
          name: track.name,
          durationMs: track.durationMs,
          albumId: track.albumId ?? null,
          artistIds: track.artistIds,
          popularity: track.popularity ?? null,
          previewUrl: track.previewUrl ?? null,
          imageUrl: track.imageUrl ?? null,
          danceability: track.danceability ?? null,
          energy: track.energy ?? null,
          valence: track.valence ?? null,
          tempo: track.tempo ?? null,
        },
      });

      for (const artistId of track.artistIds) {
        await prisma.trackArtist.upsert({
          where: {
            trackId_artistId: {
              trackId: track.id,
              artistId,
            },
          },
          update: {},
          create: {
            trackId: track.id,
            artistId,
          },
        });
      }
    }

    const playRows: Prisma.PlayEventCreateManyInput[] = data.plays.map((play) => ({
      userId: user.id,
      trackId: play.trackId,
      playedAt: new Date(play.playedAt),
      importSource: "json_restore",
    }));

    const result = await prisma.playEvent.createMany({
      data: playRows,
      skipDuplicates: true,
    });

    await prisma.user.update({
      where: { id: user.id },
      data: {
        lastImportAt: new Date(),
        lastImportStatus: `JSON restore completed (${result.count} play events)`,
      },
    });

    return NextResponse.json({
      ok: true,
      importedPlays: result.count,
      importedTracks: data.tracks.length,
    });
  } catch (error) {
    console.error("JSON restore failed", error);
    return NextResponse.json({ error: "Restore failed" }, { status: 500 });
  }
}
