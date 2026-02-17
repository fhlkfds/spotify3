import Link from "next/link";

import { getDashboardStats } from "@/lib/analytics/service";
import { parseTimeRangeFromSearchParams } from "@/lib/date-range";
import { requireUser } from "@/lib/auth/session";
import { StatCard } from "@/components/analytics/stat-card";
import { TimeRangeFilter } from "@/components/analytics/time-range-filter";
import { TopPreview } from "@/components/analytics/top-preview";
import { ListeningOverTimeChart } from "@/components/charts/listening-over-time-chart";
import { TopBreakdownChart } from "@/components/charts/top-breakdown-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function buildRangeQuery(params: Record<string, string | string[] | undefined>): string {
  const query = new URLSearchParams();

  const preset = typeof params.preset === "string" ? params.preset : undefined;
  const from = typeof params.from === "string" ? params.from : undefined;
  const to = typeof params.to === "string" ? params.to : undefined;

  if (preset) {
    query.set("preset", preset);
  }

  if (from && to) {
    query.set("from", from);
    query.set("to", to);
  }

  const output = query.toString();
  return output ? `?${output}` : "";
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const range = parseTimeRangeFromSearchParams(params);
  const stats = await getDashboardStats(user.id, range);
  const rangeQuery = buildRangeQuery(params);
  const isAllTime = range.preset === "all";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Dashboard</h1>
          <p className="text-sm text-zinc-400">
            {isAllTime
              ? "Listening summary for all time"
              : `Listening summary from ${range.from.toLocaleDateString()} to ${range.to.toLocaleDateString()}`}
          </p>
        </div>
        <Link href={`/api/export/pdf${rangeQuery}`} className="text-sm text-[#1ed760] hover:underline">
          Export PDF snapshot
        </Link>
      </div>

      <TimeRangeFilter />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Total Listening (Hours)" value={stats.totalListeningHours} />
        <StatCard title="Total Unique Songs" value={stats.totalUniqueSongs} />
        <StatCard title="Total Unique Artists" value={stats.totalUniqueArtists} />
        <StatCard title="Total Unique Albums" value={stats.totalUniqueAlbums} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Listening Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            <ListeningOverTimeChart data={stats.listeningOverTime} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top Songs Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <TopBreakdownChart
              data={stats.topSongsPreview.map((item) => ({
                name: item.name,
                playCount: item.playCount,
              }))}
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <TopPreview title="Top Songs" items={stats.topSongsPreview} viewAllHref={`/top-songs${rangeQuery}`} />
        <TopPreview
          title="Top Artists"
          items={stats.topArtistsPreview}
          viewAllHref={`/top-artists${rangeQuery}`}
        />
        <TopPreview
          title="Top Albums"
          items={stats.topAlbumsPreview}
          viewAllHref={`/top-albums${rangeQuery}`}
        />
      </div>
    </div>
  );
}
