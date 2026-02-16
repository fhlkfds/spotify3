"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { NAV_ITEMS } from "@/components/layout/nav-items";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden h-screen w-72 shrink-0 border-r border-zinc-800 bg-gradient-to-b from-[#0a0f0c] via-[#0b0f0b] to-black px-4 py-6 lg:flex lg:flex-col">
      <div className="mb-8 px-2">
        <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Spotify Tracker</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">Daily Recs</h1>
      </div>

      <nav className="space-y-1">
        {NAV_ITEMS.map((item) => {
          const active = !item.external && pathname === item.href;
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              target={item.external ? "_blank" : undefined}
              rel={item.external ? "noreferrer" : undefined}
              className={cn(
                "group flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-zinc-400 transition-colors",
                active ? "bg-[#1DB954]/20 text-[#1ed760]" : "hover:bg-zinc-900 hover:text-zinc-100",
              )}
            >
              <Icon size={16} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
        <p className="text-xs text-zinc-400">Tip</p>
        <p className="mt-1 text-sm text-zinc-200">
          Use the global range filter on analytics pages to sync all cards, charts, and lists.
        </p>
      </div>
    </aside>
  );
}
