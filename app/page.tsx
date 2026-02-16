import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function Home() {
  const user = await getCurrentUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center px-6 py-12">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_15%_15%,#1DB95433_0%,transparent_30%),radial-gradient(circle_at_80%_10%,#ffffff10_0%,transparent_28%)]" />

      <div className="grid w-full max-w-6xl gap-8 lg:grid-cols-[1.25fr_1fr]">
        <div className="animate-fade-in rounded-3xl border border-zinc-800 bg-black/55 p-8 shadow-2xl backdrop-blur md:p-12">
          <p className="text-xs uppercase tracking-[0.25em] text-[#1ed760]">Spotify Tracker</p>
          <h1 className="mt-4 max-w-xl text-4xl font-semibold leading-tight text-white md:text-5xl">
            Your listening history, wrapped daily insights, and fresh recommendations.
          </h1>
          <p className="mt-4 max-w-xl text-zinc-300">
            Import data from Spotify, explore top songs/artists/albums/genres with flexible time ranges,
            generate new-to-you daily picks, and export shareable reports.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/api/auth/spotify/login">Sign in with Spotify</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/api/auth/spotify/login">Connect Spotify</Link>
            </Button>
          </div>
        </div>

        <Card className="animate-fade-in">
          <CardHeader>
            <CardTitle>What you get</CardTitle>
            <CardDescription>Built for daily use and exportable reporting.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-zinc-300">
            <p>1. Spotify OAuth with server-side token refresh.</p>
            <p>2. Import pipeline with progress + rate-limit backoff.</p>
            <p>3. Dashboard + top pages + wrapped insights.</p>
            <p>4. Daily 10-track and 3-album recommendations.</p>
            <p>5. CSV / JSON / PDF export + JSON restore.</p>
            <p>6. Dockerized app + Postgres deployment.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
