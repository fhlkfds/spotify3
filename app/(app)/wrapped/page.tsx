import { endOfYear, startOfYear } from "date-fns";

import { getWrappedSummary } from "@/lib/analytics/service";
import { requireUser } from "@/lib/auth/session";
import { ShareWrappedButton } from "@/components/analytics/share-wrapped-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function WrappedPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const params = await searchParams;

  const yearParam = typeof params.year === "string" ? Number(params.year) : new Date().getFullYear();
  const year = Number.isFinite(yearParam) ? yearParam : new Date().getFullYear();

  const wrapped = await getWrappedSummary(user.id, year);

  const from = startOfYear(new Date(year, 0, 1)).toISOString().slice(0, 10);
  const to = endOfYear(new Date(year, 11, 31)).toISOString().slice(0, 10);
  const shareSummary = `My Spotify Wrapped ${year}: ${wrapped.totalMinutes} minutes, top song ${wrapped.topSong?.name ?? "N/A"}, top artist ${wrapped.topArtist?.name ?? "N/A"}, personality ${wrapped.personality.label}.`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Spotify Wrapped</h1>
          <p className="text-sm text-zinc-400">Yearly summary with shareable insights.</p>
        </div>
        <form className="flex items-center gap-2" method="GET">
          <input
            name="year"
            defaultValue={year}
            className="h-10 w-28 rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm"
            aria-label="Wrapped year"
          />
          <Button type="submit" variant="secondary">
            Load
          </Button>
        </form>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="animate-fade-in">
          <CardHeader>
            <CardTitle>Total Minutes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{wrapped.totalMinutes.toFixed(1)}</p>
          </CardContent>
        </Card>

        <Card className="animate-fade-in">
          <CardHeader>
            <CardTitle>Top Song</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg">{wrapped.topSong?.name ?? "No data"}</p>
          </CardContent>
        </Card>

        <Card className="animate-fade-in">
          <CardHeader>
            <CardTitle>Top Artist</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg">{wrapped.topArtist?.name ?? "No data"}</p>
          </CardContent>
        </Card>

        <Card className="animate-fade-in">
          <CardHeader>
            <CardTitle>Top Album</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg">{wrapped.topAlbum?.name ?? "No data"}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="animate-fade-in">
        <CardHeader>
          <CardTitle>Top Genres</CardTitle>
          <CardDescription>Generated from artist genre tags weighted by plays.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {wrapped.topGenres.length ? (
            wrapped.topGenres.map((genre) => (
              <Badge key={genre.id} variant="secondary">
                {genre.rank}. {genre.name} ({genre.playCount} plays)
              </Badge>
            ))
          ) : (
            <p className="text-sm text-zinc-400">No genres available for this year.</p>
          )}
        </CardContent>
      </Card>

      <Card className="animate-fade-in">
        <CardHeader>
          <CardTitle>Listening Personality: {wrapped.personality.label}</CardTitle>
          <CardDescription>{wrapped.personality.description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <p className="text-sm text-zinc-300">Energy: {wrapped.personality.traits.energy}</p>
            <p className="text-sm text-zinc-300">
              Danceability: {wrapped.personality.traits.danceability}
            </p>
            <p className="text-sm text-zinc-300">Valence: {wrapped.personality.traits.valence}</p>
            <p className="text-sm text-zinc-300">Tempo: {wrapped.personality.traits.tempo}</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <a href={`/api/export/pdf?year=${year}&from=${from}&to=${to}`}>Export Wrapped PDF</a>
            </Button>
            <ShareWrappedButton summary={shareSummary} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
