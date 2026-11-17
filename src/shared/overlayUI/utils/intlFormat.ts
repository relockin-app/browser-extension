// Also synced into the phone JS bundle, where there is no `browser` global.
type I18nHost = { i18n?: { getUILanguage?: () => string } };

export function uiLocale(): string {
  const g = globalThis as { browser?: I18nHost; chrome?: I18nHost; __relockInLocale?: string };
  // Set by the phone bundle's i18n `setLocale`, so formatting follows the app language.
  if (g.__relockInLocale) return g.__relockInLocale;
  try {
    const lang = (g.browser ?? g.chrome)?.i18n?.getUILanguage?.();
    if (lang) return lang;
  } catch {
    // fall through
  }
  return (typeof navigator !== "undefined" && navigator.language) || "en";
}

function formatUnit(value: number, unit: string, loc: string): string {
  return new Intl.NumberFormat(loc, {
    style: "unit",
    unit,
    unitDisplay: "narrow",
  }).format(value);
}

// Looked up at runtime: the phone bundle targets ES2020 typings (no
// Intl.ListFormat) and older WebViews may lack it.
type ListFormatCtor = new (
  locale: string,
  options: { type: "conjunction" | "unit"; style: "long" | "narrow" },
) => { format(items: string[]): string };

function listFormat(
  items: string[],
  loc: string,
  type: "conjunction" | "unit",
  style: "long" | "narrow",
): string {
  const ListFormat = (Intl as unknown as { ListFormat?: ListFormatCtor })
    .ListFormat;
  if (ListFormat) return new ListFormat(loc, { type, style }).format(items);
  return items.join(type === "unit" ? " " : ", ");
}

function joinUnits(parts: string[], loc: string): string {
  return listFormat(parts, loc, "unit", "narrow");
}

/** e.g. "1h 5m"; zero parts are dropped, "0m" when both are zero. */
export function formatHoursMinutes(hours: number, minutes: number): string {
  const loc = uiLocale();
  const parts: string[] = [];
  if (hours > 0) parts.push(formatUnit(hours, "hour", loc));
  if (minutes > 0 || parts.length === 0)
    parts.push(formatUnit(minutes, "minute", loc));
  return joinUnits(parts, loc);
}

/** e.g. "2m 30s"; zero parts are dropped, "0s" when both are zero. */
export function formatMinutesSeconds(minutes: number, seconds: number): string {
  const loc = uiLocale();
  const parts: string[] = [];
  if (minutes > 0) parts.push(formatUnit(minutes, "minute", loc));
  if (seconds > 0 || parts.length === 0)
    parts.push(formatUnit(seconds, "second", loc));
  return joinUnits(parts, loc);
}

export function formatList(items: string[]): string {
  return listFormat(items, uiLocale(), "conjunction", "long");
}

/** `value` is a whole percentage (50 → "50%"). */
export function formatPercent(value: number): string {
  return new Intl.NumberFormat(uiLocale(), {
    style: "percent",
    maximumFractionDigits: 0,
  }).format(value / 100);
}

export function formatSignedSeconds(seconds: number): string {
  return new Intl.NumberFormat(uiLocale(), {
    style: "unit",
    unit: "second",
    unitDisplay: "narrow",
    signDisplay: "always",
  }).format(seconds);
}

/** Wall-clock time in the UI language, e.g. "12:00 AM" or "00:00". */
export function formatClockTime(date: Date): string {
  return new Intl.DateTimeFormat(uiLocale(), {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}
