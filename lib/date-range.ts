import {
  endOfDay,
  endOfMonth,
  endOfToday,
  endOfWeek,
  endOfYear,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfToday,
  startOfWeek,
  startOfYear,
} from "date-fns";

export type TimePreset = "today" | "week" | "month" | "year";

export type TimeRange = {
  from: Date;
  to: Date;
  preset?: TimePreset | "custom";
};

export function getPresetRange(preset: TimePreset): TimeRange {
  const now = new Date();

  switch (preset) {
    case "today":
      return { from: startOfToday(), to: endOfToday(), preset };
    case "week":
      return {
        from: startOfWeek(now, { weekStartsOn: 1 }),
        to: endOfWeek(now, { weekStartsOn: 1 }),
        preset,
      };
    case "month":
      return { from: startOfMonth(now), to: endOfMonth(now), preset };
    case "year":
      return { from: startOfYear(now), to: endOfYear(now), preset };
    default:
      return { from: startOfMonth(now), to: endOfMonth(now), preset: "month" };
  }
}

export function parseTimeRangeFromSearchParams(
  input: Record<string, string | string[] | undefined>,
): TimeRange {
  const preset = firstValue(input.preset);
  const from = firstValue(input.from);
  const to = firstValue(input.to);

  if (preset && ["today", "week", "month", "year"].includes(preset)) {
    return getPresetRange(preset as TimePreset);
  }

  if (from && to) {
    const parsedFrom = parseISO(from);
    const parsedTo = parseISO(to);

    if (!Number.isNaN(parsedFrom.getTime()) && !Number.isNaN(parsedTo.getTime())) {
      return {
        from: startOfDay(parsedFrom),
        to: endOfDay(parsedTo),
        preset: "custom",
      };
    }
  }

  return getPresetRange("month");
}

export function formatDateInput(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function firstValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}
