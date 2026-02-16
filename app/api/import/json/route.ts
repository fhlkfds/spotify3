import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

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

export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json();
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
