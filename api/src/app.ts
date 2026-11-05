import express from 'express';
import { errorHandler } from './errors.js';
import { authRouter } from './routes/auth.js';
import { courtsRouter } from './routes/courts.js';
import { bookingsRouter } from './routes/bookings.js';
import { adminRouter } from './routes/admin.js';
import { availabilityEvents } from './events.js';

export function createApp() {
  const app = express();
  app.use(express.json());
  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });
  app.get('/events', availabilityEvents);
  app.use('/auth', authRouter);
  app.use('/courts', courtsRouter);
  app.use('/bookings', bookingsRouter);
  app.use('/admin', adminRouter);
  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });
  app.use(errorHandler);
  return app;
}
