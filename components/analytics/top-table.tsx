import Image from "next/image";

import type { TopEntry } from "@/lib/analytics/types";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function TopTable({ rows }: { rows: TopEntry[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6 text-sm text-zinc-400">
        No results found for this range/filter.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/70">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">Rank</TableHead>
            <TableHead>Name</TableHead>
            <TableHead className="text-right">Plays</TableHead>
            <TableHead className="text-right">Minutes</TableHead>
            <TableHead className="text-right">Last Listened</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="font-medium">#{row.rank}</TableCell>
              <TableCell>
                <div className="flex items-center gap-3">
                  {row.imageUrl ? (
                    <Image
                      src={row.imageUrl}
                      alt={`${row.name} cover`}
                      width={44}
                      height={44}
                      className="h-11 w-11 rounded-md object-cover"
                    />
                  ) : (
                    <div className="h-11 w-11 rounded-md bg-zinc-800" />
                  )}
                  <span className="line-clamp-1">{row.name}</span>
                </div>
              </TableCell>
              <TableCell className="text-right">{row.playCount}</TableCell>
              <TableCell className="text-right">{row.totalMinutes.toFixed(1)}</TableCell>
              <TableCell className="text-right text-zinc-400">
                {row.lastListened ? new Date(row.lastListened).toLocaleDateString() : "-"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
