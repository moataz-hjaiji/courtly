import { EventEmitter } from 'node:events';
import type { RequestHandler } from 'express';

// shortcut: in-process bus, so only clients of the same API instance get events.
// With several API instances, switch to Postgres LISTEN/NOTIFY (no new infra).
const bus = new EventEmitter();
bus.setMaxListeners(0);

export interface AvailabilityChange {
  courtId: number;
  date: string; // YYYY-MM-DD (UTC)
}

export const publishAvailabilityChange = (courtId: number, startAt: Date) =>
  bus.emit('availability', { courtId, date: startAt.toISOString().slice(0, 10) } satisfies AvailabilityChange);

/**
 * Server-Sent Events stream of "availability changed" notices. Public on purpose: EventSource can't send
 * an Authorization header, and the payload is only {courtId, date}; clients refetch via the authed API.
 */
export const availabilityEvents: RequestHandler = (req, res) => {
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  });
  res.write(': connected\n\n');
  const send = (change: AvailabilityChange) => res.write(`event: availability\ndata: ${JSON.stringify(change)}\n\n`);
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 25_000); // keeps proxies from closing idle streams
  bus.on('availability', send);
  req.on('close', () => {
    clearInterval(heartbeat);
    bus.off('availability', send);
  });
};
