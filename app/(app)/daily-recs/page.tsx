import { DailyRecsClient } from "@/components/daily-recs-client";

export default function DailyRecsPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Daily Recommendations</h1>
        <p className="text-sm text-zinc-400">
          New-to-you picks generated from your listening profile: 10 songs and 3 albums.
        </p>
      </div>
      <DailyRecsClient />
    </div>
  );
}
