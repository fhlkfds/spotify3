import { Parser } from "json2csv";
import PDFDocument from "pdfkit";

import type { AnalyticsExportPayload, TopEntry } from "@/lib/analytics/types";

function csvForSection(title: string, rows: object[]): string {
  if (rows.length === 0) {
    return `${title}\nNo data\n`;
  }

  const parser = new Parser({ fields: Object.keys(rows[0]) });
  return `${title}\n${parser.parse(rows)}\n`;
}

function topRows(rows: TopEntry[]) {
  return rows.map((row) => ({
    rank: row.rank,
    name: row.name,
    playCount: row.playCount,
    totalMinutes: row.totalMinutes,
    lastListened: row.lastListened,
  }));
}

export function buildCsvReport(payload: AnalyticsExportPayload): string {
  const dashboardRows = [
    {
      totalListeningHours: payload.dashboard.totalListeningHours,
      totalUniqueSongs: payload.dashboard.totalUniqueSongs,
      totalUniqueArtists: payload.dashboard.totalUniqueArtists,
      totalUniqueAlbums: payload.dashboard.totalUniqueAlbums,
      rangeFrom: payload.dashboard.range.from.toISOString(),
      rangeTo: payload.dashboard.range.to.toISOString(),
    },
  ];

  return [
    csvForSection("Dashboard", dashboardRows),
    csvForSection("Top Songs", topRows(payload.topSongs)),
    csvForSection("Top Artists", topRows(payload.topArtists)),
    csvForSection("Top Albums", topRows(payload.topAlbums)),
    csvForSection("Top Genres", topRows(payload.topGenres)),
    csvForSection("Wrapped", [
      {
        year: payload.wrapped.year,
        totalMinutes: payload.wrapped.totalMinutes,
        topSong: payload.wrapped.topSong?.name ?? "N/A",
        topArtist: payload.wrapped.topArtist?.name ?? "N/A",
        topAlbum: payload.wrapped.topAlbum?.name ?? "N/A",
        personality: payload.wrapped.personality.label,
      },
    ]),
  ].join("\n");
}

function writeTopList(doc: PDFKit.PDFDocument, title: string, rows: TopEntry[]): void {
  doc.fontSize(14).fillColor("#1DB954").text(title, { continued: false });
  doc.moveDown(0.3);

  if (rows.length === 0) {
    doc.fontSize(10).fillColor("#999999").text("No data available");
    doc.moveDown();
    return;
  }

  rows.slice(0, 10).forEach((row) => {
    doc
      .fontSize(10)
      .fillColor("#EDEDED")
      .text(`${row.rank}. ${row.name}  |  ${row.playCount} plays  |  ${row.totalMinutes} min`);
  });

  doc.moveDown();
}

export async function buildPdfReport(payload: AnalyticsExportPayload): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 40 });
  const chunks: Buffer[] = [];

  doc.on("data", (chunk) => chunks.push(chunk));

  doc.rect(0, 0, doc.page.width, doc.page.height).fill("#0B0F0C");
  doc.fillColor("#1DB954").fontSize(24).text("Spotify Tracker Report", 40, 40);
  doc.fillColor("#D4D4D4").fontSize(10).text(`Generated: ${payload.generatedAt}`);

  doc.moveDown(2);
  doc.fillColor("#FFFFFF").fontSize(16).text("Dashboard Snapshot");
  doc.moveDown(0.5);
  doc
    .fontSize(11)
    .fillColor("#D4D4D4")
    .text(`Listening Hours: ${payload.dashboard.totalListeningHours}`)
    .text(`Unique Songs: ${payload.dashboard.totalUniqueSongs}`)
    .text(`Unique Artists: ${payload.dashboard.totalUniqueArtists}`)
    .text(`Unique Albums: ${payload.dashboard.totalUniqueAlbums}`);

  doc.moveDown(1.2);
  doc.fontSize(16).fillColor("#FFFFFF").text(`Wrapped ${payload.wrapped.year}`);
  doc
    .moveDown(0.4)
    .fontSize(11)
    .fillColor("#D4D4D4")
    .text(`Total Minutes: ${payload.wrapped.totalMinutes}`)
    .text(`Top Song: ${payload.wrapped.topSong?.name ?? "N/A"}`)
    .text(`Top Artist: ${payload.wrapped.topArtist?.name ?? "N/A"}`)
    .text(`Top Album: ${payload.wrapped.topAlbum?.name ?? "N/A"}`)
    .text(`Personality: ${payload.wrapped.personality.label}`)
    .text(payload.wrapped.personality.description);

  doc.addPage();
  doc.rect(0, 0, doc.page.width, doc.page.height).fill("#0B0F0C");
  doc.fillColor("#FFFFFF").fontSize(18).text("Top Lists", 40, 40);
  doc.moveDown();

  writeTopList(doc, "Top Songs", payload.topSongs);
  writeTopList(doc, "Top Artists", payload.topArtists);
  writeTopList(doc, "Top Albums", payload.topAlbums);
  writeTopList(doc, "Top Genres", payload.topGenres);

  doc.end();

  return new Promise((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });
}
