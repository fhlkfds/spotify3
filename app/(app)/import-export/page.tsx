import { ImportExportClient } from "@/components/import-export-client";

export default function ImportExportPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Import / Export</h1>
        <p className="text-sm text-zinc-400">
          Trigger Spotify import, monitor status, export reports, or restore from JSON.
        </p>
      </div>
      <ImportExportClient />
    </div>
  );
}
