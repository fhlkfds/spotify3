"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import type { DailyRecommendations } from "@/lib/recommendations/engine";

export function DailyRecsClient() {
  const [data, setData] = useState<DailyRecommendations | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const run = async () => {
      const response = await fetch("/api/recommendations/daily", {
        cache: "no-store",
      });

      if (!active) {
        return;
      }

      if (!response.ok) {
        const error = (await response.json().catch(() => null)) as { error?: string } | null;
        const message = error?.error ?? "Failed to load recommendations.";
        toast({
          title: "Failed to load recommendations",
          description: message,
          variant: "destructive",
        });
        setLoadError(message);
        setLoading(false);
        return;
      }

      const json = (await response.json()) as DailyRecommendations;
      if (!active) {
        return;
      }

      setData(json);
      setLoadError(null);
      setLoading(false);
    };

    void run();

    return () => {
      active = false;
    };
  }, []);

  const regenerate = async () => {
    setRegenerating(true);
    const response = await fetch("/api/recommendations/daily?force=1", {
      method: "POST",
    });

    if (!response.ok) {
      const error = (await response.json().catch(() => null)) as { error?: string } | null;
      toast({
        title: "Regenerate failed",
        description: error?.error ?? "Try again later.",
        variant: "destructive",
      });
      setRegenerating(false);
      return;
    }

    const json = (await response.json()) as DailyRecommendations;
    setData(json);
    setRegenerating(false);

    toast({
      title: "Recommendations refreshed",
      description: "A new daily set is ready.",
    });
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-14 w-40" />
        <Skeleton className="h-60 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-zinc-400">
          {loadError ?? "No recommendation data yet. Run an import first and return here."}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-zinc-400">
          {data.fromCache ? "Using cached run" : "Generated"} at {new Date(data.generatedAt).toLocaleString()}
        </p>
        <Button onClick={regenerate} variant="secondary" disabled={regenerating}>
          {regenerating ? "Regenerating..." : "Regenerate"}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>10 Song Picks</CardTitle>
          <CardDescription>Filtered to tracks you have not listened to before.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {data.tracks.map((track) => (
            <div key={track.id} className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
              <p className="font-medium text-white">{track.name}</p>
              <p className="text-xs text-zinc-400">{track.artistNames.join(", ")}</p>
              <p className="mt-1 text-xs text-zinc-500">{track.reason}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>3 Album Picks</CardTitle>
          <CardDescription>Albums you have not explored yet.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          {data.albums.map((album) => (
            <div key={album.id} className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
              <p className="font-medium text-white">{album.name}</p>
              <p className="text-xs text-zinc-400">{album.artistNames.join(", ")}</p>
              <p className="mt-1 text-xs text-zinc-500">{album.reason}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
