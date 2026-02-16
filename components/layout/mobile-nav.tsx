"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { NAV_ITEMS } from "@/components/layout/nav-items";
import { cn } from "@/lib/utils";

const MOBILE_ITEMS = NAV_ITEMS.slice(0, 5);

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-zinc-800 bg-black/95 px-2 py-2 backdrop-blur lg:hidden">
      <ul className="grid grid-cols-5 gap-1">
        {MOBILE_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-lg px-2 py-1 text-[11px]",
                  active ? "text-[#1ed760]" : "text-zinc-400",
                )}
              >
                <Icon size={16} />
                <span>{item.label.replace("Top ", "")}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
