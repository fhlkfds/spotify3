import Link from "next/link";

import type { TopEntry } from "@/lib/analytics/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function TopPreview({
  title,
  items,
  viewAllHref,
}: {
  title: string;
  items: TopEntry[];
  viewAllHref: string;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        <Link href={viewAllHref} className="text-xs font-medium text-[#1ed760] hover:underline">
          View all
        </Link>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 ? (
          <p className="text-sm text-zinc-400">No data yet for this range.</p>
        ) : (
          items.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-3">
              <p className="line-clamp-1 text-sm text-zinc-100">{item.rank}. {item.name}</p>
              <p className="text-xs text-zinc-400">{item.playCount} plays</p>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
