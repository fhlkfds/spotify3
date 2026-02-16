import { getTopEntries } from "@/lib/analytics/service";
import { parseTimeRangeFromSearchParams } from "@/lib/date-range";
import { requireUser } from "@/lib/auth/session";
import { TimeRangeFilter } from "@/components/analytics/time-range-filter";
import { TopTable } from "@/components/analytics/top-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const SORT_OPTIONS = ["plays", "minutes", "recent"] as const;

export default async function TopGenresPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const range = parseTimeRangeFromSearchParams(params);

  const search = typeof params.search === "string" ? params.search : "";
  const sortParam = typeof params.sort === "string" ? params.sort : "plays";
  const sort = SORT_OPTIONS.includes(sortParam as (typeof SORT_OPTIONS)[number])
    ? (sortParam as (typeof SORT_OPTIONS)[number])
    : "plays";

  const rows = await getTopEntries(user.id, range, "genres", { search, sort });

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">Top Genres</h1>
      <TimeRangeFilter />

      <form className="flex flex-wrap gap-2 rounded-xl border border-zinc-800 bg-zinc-950/70 p-3" method="GET">
        <Input name="search" placeholder="Search genres..." defaultValue={search} className="max-w-xs" />
        <select
          name="sort"
          defaultValue={sort}
          className="h-10 rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100"
          aria-label="Sort top genres"
        >
          <option value="plays">Sort: Plays</option>
          <option value="minutes">Sort: Minutes</option>
          <option value="recent">Sort: Recent</option>
        </select>

        {typeof params.preset === "string" ? <input type="hidden" name="preset" value={params.preset} /> : null}
        {typeof params.from === "string" ? <input type="hidden" name="from" value={params.from} /> : null}
        {typeof params.to === "string" ? <input type="hidden" name="to" value={params.to} /> : null}

        <Button variant="secondary" type="submit">
          Apply
        </Button>
      </form>

      <TopTable rows={rows} />
    </div>
  );
}
