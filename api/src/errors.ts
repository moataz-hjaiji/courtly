import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';

/** An expected, client-facing error. `code` is stable for the frontend to switch on. */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
  } else if (err?.type === 'entity.parse.failed') {
    // thrown by express.json() for a body that isn't valid JSON
    res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Request body is not valid JSON' } });
  } else if (err instanceof ZodError) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: err.issues } });
  } else {
    console.error(err);
    res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong' } });
  }
};

/** Postgres SQLSTATE of a driver error, e.g. '23505' unique, '23514' check, '23P01' exclusion. */
export const pgCode = (err: unknown): string | undefined =>
  typeof err === 'object' && err !== null && 'code' in err ? String(err.code) : undefined;
