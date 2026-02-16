import { MobileNav } from "@/components/layout/mobile-nav";
import { Sidebar } from "@/components/layout/sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#102015,_transparent_45%),linear-gradient(180deg,#080a09_0%,#050606_100%)] text-zinc-100">
      <div className="mx-auto flex max-w-[1700px]">
        <Sidebar />
        <main className="w-full px-4 pb-24 pt-6 sm:px-6 lg:px-10 lg:pb-10">{children}</main>
      </div>
      <MobileNav />
    </div>
  );
}
