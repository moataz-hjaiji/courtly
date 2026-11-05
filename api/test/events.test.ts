import { afterAll, beforeEach, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { app, as, daysFromNow, pool, resetDb, tokens } from './helpers.js';

beforeEach(resetDb);
afterAll(() => pool.end());

it('pushes an availability event to open streams when a slot is booked', async () => {
  const server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  const controller = new AbortController();
  try {
    const res = await fetch(`http://localhost:${port}/events`, { signal: controller.signal });
    const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
    await reader.read(); // ": connected"

    const date = daysFromNow(3);
    await as(tokens.alice).post('/bookings', { courtId: 1, date, startHour: 10, hours: 1 }).expect(201);

    const { value } = await reader.read();
    expect(value).toContain('event: availability');
    expect(value).toContain(JSON.stringify({ courtId: 1, date }));
  } finally {
    controller.abort();
    server.close();
  }
});
