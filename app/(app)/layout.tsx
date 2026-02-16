import { AppShell } from "@/components/layout/app-shell";
import { LogoutButton } from "@/components/layout/logout-button";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/lib/auth/session";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <AppShell>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-zinc-500">Signed in</p>
          <p className="text-sm text-zinc-100">{user.displayName ?? "Spotify User"}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{user.spotifyId}</Badge>
          <LogoutButton />
        </div>
      </header>
      {children}
    </AppShell>
  );
}
