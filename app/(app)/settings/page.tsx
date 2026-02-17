import Link from "next/link";

import { LogoutButton } from "@/components/layout/logout-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function SettingsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>Data Import / Export</CardTitle>
          <CardDescription>
            Open the import page from settings to import Spotify JSON history, run Spotify imports, or
            export reports.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/settings/import">Open Import Page</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/import-export">Open Standalone Import / Export</Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>Manage your current session.</CardDescription>
        </CardHeader>
        <CardContent>
          <LogoutButton />
        </CardContent>
      </Card>
    </div>
  );
}
