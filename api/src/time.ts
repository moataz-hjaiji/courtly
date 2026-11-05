import { z } from 'zod';

// shortcut: the facility runs on UTC only; per-facility time zones would need a tz column + a tz library.
export const HOUR_MS = 60 * 60 * 1000;

/** "YYYY-MM-DD" -> Date at 00:00 UTC of that day. Round-trip check rejects impossible dates like 2026-02-30. */
export const dayParam = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD')
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s);
  }, 'Invalid date')
  .transform((s) => new Date(`${s}T00:00:00Z`));

export const atHour = (day: Date, hour: number) => new Date(day.getTime() + hour * HOUR_MS);
