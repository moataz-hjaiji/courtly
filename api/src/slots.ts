import { z } from 'zod';
import { AppError } from './errors.js';
import { dayParam } from './time.js';
import type { Court } from './routes/courts.js';

/** Body for booking a slot or joining its waitlist. */
export const slotBody = z.object({
  courtId: z.number().int().positive(),
  date: dayParam,
  startHour: z.number().int().min(0).max(23),
  hours: z.union([z.literal(1), z.literal(2)]),
});

/** Rules shared by booking and joining the waitlist. Throws a 422 AppError when a rule is broken. */
export function checkSlotRules(court: Court, startHour: number, hours: number, startAt: Date): void {
  if (startHour < court.openHour || startHour + hours > court.closeHour) {
    throw new AppError(
      422,
      'OUTSIDE_OPENING_HOURS',
      `${court.name} is open ${court.openHour}:00–${court.closeHour}:00; a ${hours}h booking at ${startHour}:00 does not fit`,
    );
  }
  if (startAt.getTime() <= Date.now()) throw new AppError(422, 'BOOKING_IN_PAST', 'Cannot book a slot that has already started');
}
