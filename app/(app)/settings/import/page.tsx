import Link from "next/link";

import { ImportExportClient } from "@/components/import-export-client";
import { Button } from "@/components/ui/button";

export default function SettingsImportPage() {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Settings / Import</h1>
          <p className="text-sm text-zinc-400">
            Import previous Spotify JSON history, run Spotify sync, and export data.
          </p>
        </div>
        <Button asChild variant="secondary">
          <Link href="/settings">Back to Settings</Link>
        </Button>
      </div>

      <ImportExportClient />
    </div>
  );
}
