"use client";

import { type ChangeEvent, useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";

type ImportStatusResponse = {
  latestImport: {
    id: string;
    status: string;
    message: string | null;
    importedPlays: number;
    importedTracks: number;
    rateLimitedHits: number;
    startedAt: string;
    finishedAt: string | null;
  } | null;
  lastImportAt: string | null;
  lastImportStatus: string | null;
};

const MAX_JSON_IMPORT_BYTES = 200 * 1024 * 1024;

export function ImportExportClient() {
  const [status, setStatus] = useState<ImportStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const refreshStatus = useCallback(async () => {
    const response = await fetch("/api/import/status", { cache: "no-store" });
    if (!response.ok) {
      setLoading(false);
      return;
    }

    const json = (await response.json()) as ImportStatusResponse;
    setStatus(json);
    setLoading(false);

    if (json.latestImport?.status === "running") {
      setImporting(true);
    } else {
      setImporting(false);
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    if (!importing) {
      return;
    }

    const interval = setInterval(() => {
      void refreshStatus();
    }, 2500);

    return () => clearInterval(interval);
  }, [importing, refreshStatus]);

  const startImport = async () => {
    const response = await fetch("/api/import/run", {
      method: "POST",
    });

    if (!response.ok) {
      toast({
        title: "Import failed to start",
        description: "Make sure you are signed in with Spotify.",
        variant: "destructive",
      });
      return;
    }

    setImporting(true);
    toast({ title: "Import started", description: "Fetching Spotify history now." });
    await refreshStatus();
  };

  const onRestoreFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (file.size > MAX_JSON_IMPORT_BYTES) {
      toast({
        title: "File too large",
        description: "JSON import file must be 200MB or smaller.",
        variant: "destructive",
      });
      event.target.value = "";
      return;
    }

    setRestoring(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/import/json", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const error = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(error?.error ?? "Restore failed");
      }

      toast({
        title: "JSON restore complete",
        description: "Database restored from export payload.",
      });

      await refreshStatus();
    } catch (error) {
      toast({
        title: "JSON restore failed",
        description: error instanceof Error ? error.message : "Invalid file",
        variant: "destructive",
      });
    } finally {
      setRestoring(false);
      event.target.value = "";
    }
  };

  const exportQuery = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    return `year=${year}&preset=month`;
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="h-40 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Spotify Import</CardTitle>
          <CardDescription>Pull recently played tracks, tops, metadata, and audio features.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button onClick={startImport} disabled={importing}>
            {importing ? "Importing..." : "Import now"}
          </Button>

          <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 text-sm text-zinc-300">
            <p>Status: {status?.latestImport?.status ?? "never run"}</p>
            <p>Message: {status?.latestImport?.message ?? "-"}</p>
            <p>Last import: {status?.lastImportAt ? new Date(status.lastImportAt).toLocaleString() : "N/A"}</p>
            <p>Rate limit retries: {status?.latestImport?.rateLimitedHits ?? 0}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Export Reports</CardTitle>
          <CardDescription>Download dashboard + top lists + wrapped summary.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button asChild variant="secondary">
            <a href={`/api/export/csv?${exportQuery}`}>Download CSV</a>
          </Button>
          <Button asChild variant="secondary">
            <a href={`/api/export/json?${exportQuery}`}>Download JSON</a>
          </Button>
          <Button asChild>
            <a href={`/api/export/pdf?${exportQuery}`}>Download PDF</a>
          </Button>
        </CardContent>
      </Card>

      <Card className="xl:col-span-2">
        <CardHeader>
          <CardTitle>Restore from JSON</CardTitle>
          <CardDescription>
            Import a previously exported JSON payload into your local DB (max 200MB).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input type="file" accept="application/json" onChange={onRestoreFile} disabled={restoring} />
          <p className="text-xs text-zinc-500">
            Expected format: output from <code>/api/export/json</code>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
