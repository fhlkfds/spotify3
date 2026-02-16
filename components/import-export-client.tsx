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
  const [restoreFiles, setRestoreFiles] = useState<File[]>([]);

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

  const onRestoreFileSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) {
      setRestoreFiles([]);
      return;
    }

    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
    if (totalBytes > MAX_JSON_IMPORT_BYTES) {
      toast({
        title: "File too large",
        description: "Total JSON import size must be 200MB or smaller.",
        variant: "destructive",
      });
      event.target.value = "";
      setRestoreFiles([]);
      return;
    }

    setRestoreFiles(files);
  };

  const startRestoreFromFile = async () => {
    if (restoreFiles.length === 0) {
      toast({
        title: "No file selected",
        description: "Choose one or more JSON files to import.",
        variant: "destructive",
      });
      return;
    }

    setRestoring(true);

    try {
      const formData = new FormData();
      restoreFiles.forEach((file) => {
        formData.append("files", file);
      });

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
        description:
          restoreFiles.length === 1
            ? `Imported ${restoreFiles[0]?.name ?? "file"} successfully.`
            : `Imported ${restoreFiles.length} files successfully.`,
      });

      await refreshStatus();
      setRestoreFiles([]);
    } catch (error) {
      toast({
        title: "JSON restore failed",
        description: error instanceof Error ? error.message : "Invalid file",
        variant: "destructive",
      });
    } finally {
      setRestoring(false);
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
          <CardTitle>Import from File</CardTitle>
          <CardDescription>
            File import options: JSON backup restore (max 200MB).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            type="file"
            accept="application/json"
            multiple
            onChange={onRestoreFileSelected}
            disabled={restoring}
          />
          {restoreFiles.length > 0 ? (
            <p className="text-xs text-zinc-400">
              Selected {restoreFiles.length} file{restoreFiles.length > 1 ? "s" : ""} (
              {(
                restoreFiles.reduce((sum, file) => sum + file.size, 0) /
                (1024 * 1024)
              ).toFixed(2)}{" "}
              MB)
            </p>
          ) : null}
          <Button onClick={startRestoreFromFile} disabled={restoreFiles.length === 0 || restoring}>
            {restoring ? "Importing file..." : "Import File"}
          </Button>
          <p className="text-xs text-zinc-500">
            Accepted formats: this app&apos;s export JSON, plus <code>your_spotify</code> privacy and
            full-privacy JSON files.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
