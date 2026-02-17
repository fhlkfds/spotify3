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
const JSON_IMPORT_TIMEOUT_MS = 12 * 60 * 1000;

function formatImportFailureMessage(
  status: number,
  body: { error?: string } | null,
  rawText: string,
): string {
  if (body?.error) {
    return body.error;
  }

  if (status === 413) {
    return "Import file too large. Maximum size is 200MB.";
  }

  if (status === 502 || status === 504) {
    return `Import failed with HTTP ${status} (gateway timeout). Try splitting the JSON into smaller files and retry.`;
  }

  const compactText = rawText.replace(/\s+/g, " ").trim();
  if (compactText.length > 0) {
    const summary = compactText.slice(0, 180);
    return `Import failed (HTTP ${status}): ${summary}${compactText.length > 180 ? "..." : ""}`;
  }

  return `Import failed (HTTP ${status}).`;
}

export function ImportExportClient() {
  const [status, setStatus] = useState<ImportStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreFiles, setRestoreFiles] = useState<File[]>([]);
  const [restoreProgress, setRestoreProgress] = useState(0);
  const [restoreStatusLabel, setRestoreStatusLabel] = useState("");

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
    setRestoreProgress(0);
    setRestoreStatusLabel("Uploading...");
    let restoreSucceeded = false;

    try {
      const formData = new FormData();
      restoreFiles.forEach((file) => {
        formData.append("files", file);
      });

      const { status, body, rawText } = await uploadImportWithProgress(formData, (progress) => {
        setRestoreProgress(progress);
      });

      if (status < 200 || status >= 300) {
        throw new Error(formatImportFailureMessage(status, body, rawText));
      }

      setRestoreProgress(100);
      setRestoreStatusLabel("Import complete");
      restoreSucceeded = true;

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
      const message = error instanceof Error ? error.message : "Invalid file";
      setRestoreStatusLabel(`Import failed: ${message}`);
      setRestoreProgress(0);
      toast({
        title: "JSON restore failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setRestoring(false);
      if (restoreSucceeded) {
        setTimeout(() => {
          setRestoreProgress(0);
          setRestoreStatusLabel("");
        }, 1200);
      }
    }
  };

  const uploadImportWithProgress = (
    formData: FormData,
    onProgress: (value: number) => void,
  ): Promise<{ status: number; body: { error?: string } | null; rawText: string }> => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/import/json");
      xhr.responseType = "text";
      xhr.timeout = JSON_IMPORT_TIMEOUT_MS;

      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable || event.total <= 0) {
          return;
        }

        const percent = Math.min(95, Math.round((event.loaded / event.total) * 95));
        onProgress(percent);
        setRestoreStatusLabel(`Uploading... ${percent}%`);
      };

      xhr.upload.onloadend = () => {
        onProgress(99);
        setRestoreStatusLabel("Upload complete. Processing imported data...");
      };

      xhr.onerror = () => {
        reject(new Error("Network error while uploading import file."));
      };

      xhr.onabort = () => {
        reject(new Error("Import request was cancelled before completion."));
      };

      xhr.ontimeout = () => {
        reject(
          new Error(
            "Import timed out while the server was processing your file. Try smaller files and retry.",
          ),
        );
      };

      xhr.onload = () => {
        let parsedBody: { error?: string } | null = null;
        const rawText = xhr.responseText ?? "";

        try {
          parsedBody = rawText ? (JSON.parse(rawText) as { error?: string }) : null;
        } catch {
          parsedBody = null;
        }

        resolve({
          status: xhr.status,
          body: parsedBody,
          rawText,
        });
      };

      xhr.send(formData);
    });
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
          {(restoring || restoreProgress > 0) && (
            <div className="space-y-2">
              <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
                <div
                  className="h-full rounded-full bg-[#1DB954] transition-all duration-300"
                  style={{ width: `${restoreProgress}%` }}
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={restoreProgress}
                  aria-label="JSON import progress"
                />
              </div>
              <p className="text-xs text-zinc-400">{restoreStatusLabel || `Uploading... ${restoreProgress}%`}</p>
            </div>
          )}
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
