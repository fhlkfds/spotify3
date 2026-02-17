import { DailyRecsClient } from "@/components/daily-recs-client";

export default async function DailyRecsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const demoMode = typeof params.demo === "string" && params.demo === "1";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Daily Recommendations</h1>
        <p className="text-sm text-zinc-400">
          New-to-you picks generated from your listening profile: 10 songs and 3 albums.
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          Need a UI check? Open <code>/daily-recs?demo=1</code> for demo recommendation data.
        </p>
      </div>
      <DailyRecsClient demoMode={demoMode} />
    </div>
  );
}
