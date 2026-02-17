"use client";

import { useEffect, useMemo, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const PRESETS = [
  { value: "today", label: "Today" },
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
  { value: "year", label: "This Year" },
  { value: "all", label: "All Time" },
] as const;

const STORAGE_KEY = "spotify_tracker_time_range";

export function TimeRangeFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const mountedRef = useRef(false);
  const fromInputRef = useRef<HTMLInputElement>(null);
  const toInputRef = useRef<HTMLInputElement>(null);

  const currentPreset = searchParams.get("preset") ?? "";
  const currentFrom = searchParams.get("from") ?? "";
  const currentTo = searchParams.get("to") ?? "";

  const serializedParams = useMemo(() => searchParams.toString(), [searchParams]);

  useEffect(() => {
    if (mountedRef.current) {
      return;
    }

    mountedRef.current = true;

    const hasRangeInUrl =
      searchParams.has("preset") || (searchParams.has("from") && searchParams.has("to"));

    if (hasRangeInUrl) {
      return;
    }

    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return;
    }

    try {
      const parsed = JSON.parse(stored) as {
        preset?: string;
        from?: string;
        to?: string;
      };

      const next = new URLSearchParams(serializedParams);
      if (parsed.preset) {
        next.set("preset", parsed.preset);
        next.delete("from");
        next.delete("to");
      } else if (parsed.from && parsed.to) {
        next.delete("preset");
        next.set("from", parsed.from);
        next.set("to", parsed.to);
      }

      router.replace(`${pathname}?${next.toString()}`);
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [pathname, router, searchParams, serializedParams]);

  useEffect(() => {
    const payload = currentPreset
      ? { preset: currentPreset }
      : currentFrom && currentTo
        ? { from: currentFrom, to: currentTo }
        : null;

    if (payload) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    }
  }, [currentPreset, currentFrom, currentTo]);

  const setPreset = (preset: string) => {
    const next = new URLSearchParams(serializedParams);
    next.set("preset", preset);
    next.delete("from");
    next.delete("to");
    router.push(`${pathname}?${next.toString()}`);
  };

  const applyCustom = () => {
    const from = fromInputRef.current?.value ?? "";
    const to = toInputRef.current?.value ?? "";

    if (!from || !to) {
      return;
    }

    const next = new URLSearchParams(serializedParams);
    next.delete("preset");
    next.set("from", from);
    next.set("to", to);
    router.push(`${pathname}?${next.toString()}`);
  };

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <Button
              key={preset.value}
              type="button"
              size="sm"
              variant={currentPreset === preset.value ? "default" : "secondary"}
              onClick={() => setPreset(preset.value)}
              aria-label={`Filter by ${preset.label}`}
            >
              {preset.label}
            </Button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Input
            key={`from-${currentFrom}`}
            type="date"
            defaultValue={currentFrom}
            ref={fromInputRef}
            className="w-[150px]"
            aria-label="Custom start date"
          />
          <Input
            key={`to-${currentTo}`}
            type="date"
            defaultValue={currentTo}
            ref={toInputRef}
            className="w-[150px]"
            aria-label="Custom end date"
          />
          <Button type="button" size="sm" variant="outline" onClick={applyCustom}>
            Apply
          </Button>
        </div>
      </div>
    </div>
  );
}
