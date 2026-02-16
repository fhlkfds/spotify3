import {
  BarChart3,
  Compass,
  Disc3,
  Download,
  Home,
  Import,
  Mic2,
  Music2,
  Settings,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  external?: boolean;
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/top-songs", label: "Top Songs", icon: Music2 },
  { href: "/top-artists", label: "Top Artists", icon: Mic2 },
  { href: "/top-albums", label: "Top Albums", icon: Disc3 },
  { href: "/top-genres", label: "Top Genres", icon: BarChart3 },
  { href: "/wrapped", label: "Wrapped", icon: Sparkles },
  { href: "/daily-recs", label: "Daily Recs", icon: Compass },
  { href: "/import-export", label: "Import / Export", icon: Import },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/api/export/pdf", label: "Quick PDF", icon: Download, external: true },
] as const;
