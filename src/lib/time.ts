/**
 * Utility functions for parsing and formatting incident timestamps.
 *
 * System Convention:
 * All stored timestamps in AgiesAI Sentinel represent UTC time, whether stored
 * as BSON Date / timezone-naive datetimes or ISO strings.
 *
 * When transmitting to the frontend, timestamps are ISO 8601 strings with an explicit
 * timezone indicator ('Z').
 *
 * When displaying to the user, timestamps are converted exactly once to the user's
 * browser-local timezone using `toLocaleDateString()` / `toLocaleString()`,
 * preserving the existing date/time display style and seconds.
 *
 * For backward compatibility with legacy API responses or database records that
 * might be timezone-naive (e.g. "2026-10-17T11:09:16" or "2026-10-17 11:09:16"),
 * `parseUtcTimestamp` safely establishes the legacy convention and treats naive
 * timestamps as UTC rather than letting the browser parse them as local time.
 */

export function parseUtcTimestamp(timestamp: string | Date | null | undefined): Date | null {
  if (!timestamp) return null;
  if (timestamp instanceof Date) {
    return Number.isNaN(timestamp.getTime()) ? null : timestamp;
  }
  if (typeof timestamp !== 'string') return null;

  const trimmed = timestamp.trim();
  if (!trimmed) return null;

  // Check if an explicit timezone indicator exists at the end:
  // 1. 'Z' or 'z'
  // 2. Numeric offset like '+00:00', '-05:00', '+0530', '+00'
  const hasTimezone = /[Zz]$|[+-]\d{2}(:?\d{2})?$/.test(trimmed);

  // Normalize legacy space-separated format (e.g. "2026-10-17 11:09:16" -> "2026-10-17T11:09:16")
  let normalized = trimmed;
  if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/.test(normalized)) {
    normalized = normalized.replace(/\s+/, 'T');
  }

  // If there is no explicit timezone indicator and it contains time components,
  // append 'Z' so it is parsed as UTC per the system's legacy convention.
  if (!hasTimezone && /T\d{2}:\d{2}/.test(normalized)) {
    normalized = `${normalized}Z`;
  }

  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    // Fallback attempt on raw string
    const fallback = new Date(trimmed);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }

  return date;
}

export function formatTimestamp(timestamp: string | Date | null | undefined): string {
  if (!timestamp) return '';
  const date = parseUtcTimestamp(timestamp);
  if (!date) {
    return typeof timestamp === 'string' ? timestamp : '';
  }
  return date.toLocaleString();
}
