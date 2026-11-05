import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db.js';
import { AppError, pgCode } from '../errors.js';
import { currentUser, requireAdmin, requireAuth } from '../auth.js';

export const courtsRouter = Router();
courtsRouter.use(requireAuth);

export const COURT_COLUMNS = `id, name, sport, hourly_price_cents AS "hourlyPriceCents",
  open_hour AS "openHour", close_hour AS "closeHour", is_active AS "isActive"`;

export interface Court {
  id: number;
  name: string;
  sport: string;
  hourlyPriceCents: number;
  openHour: number;
  closeHour: number;
  isActive: boolean;
}

const hour = z.number().int().min(0).max(24);
const courtFields = z.object({
  name: z.string().trim().min(1).max(100),
  sport: z.string().trim().min(1).max(50),
  hourlyPriceCents: z.number().int().positive(),
  openHour: hour,
  closeHour: hour,
  isActive: z.boolean(),
});
const createBody = courtFields.partial({ isActive: true });
const updateBody = courtFields.partial();
const idParam = z.object({ id: z.coerce.number().int().positive() });

/** Users only see active courts; admins see all (to reactivate/edit them). */
export async function findCourt(id: number, includeInactive: boolean): Promise<Court> {
  const { rows } = await pool.query<Court>(`SELECT ${COURT_COLUMNS} FROM courts WHERE id = $1`, [id]);
  const court = rows[0];
  if (!court || (!court.isActive && !includeInactive)) throw new AppError(404, 'COURT_NOT_FOUND', 'Court not found');
  return court;
}

function mapWriteError(err: unknown): never {
  if (pgCode(err) === '23505') throw new AppError(409, 'COURT_NAME_TAKEN', 'A court with this name already exists');
  if (pgCode(err) === '23514') throw new AppError(400, 'INVALID_OPENING_HOURS', 'Opening hour must be before closing hour (0–24)');
  throw err;
}

courtsRouter.get('/', async (req, res) => {
  const all = currentUser(req).role === 'admin';
  const { rows } = await pool.query(`SELECT ${COURT_COLUMNS} FROM courts ${all ? '' : 'WHERE is_active'} ORDER BY name`);
  res.json(rows);
});

courtsRouter.get('/:id', async (req, res) => {
  const { id } = idParam.parse(req.params);
  res.json(await findCourt(id, currentUser(req).role === 'admin'));
});

courtsRouter.post('/', requireAdmin, async (req, res) => {
  const c = createBody.parse(req.body);
  const { rows } = await pool
    .query(
      `INSERT INTO courts (name, sport, hourly_price_cents, open_hour, close_hour, is_active)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${COURT_COLUMNS}`,
      [c.name, c.sport, c.hourlyPriceCents, c.openHour, c.closeHour, c.isActive ?? true],
    )
    .catch(mapWriteError);
  res.status(201).json(rows[0]);
});

// Deactivation is PATCH { isActive: false }: there is no DELETE, so booking history is never lost.
courtsRouter.patch('/:id', requireAdmin, async (req, res) => {
  const { id } = idParam.parse(req.params);
  const c = updateBody.parse(req.body);
  const { rows } = await pool
    .query(
      `UPDATE courts SET
         name = COALESCE($2, name), sport = COALESCE($3, sport),
         hourly_price_cents = COALESCE($4, hourly_price_cents),
         open_hour = COALESCE($5, open_hour), close_hour = COALESCE($6, close_hour),
         is_active = COALESCE($7, is_active)
       WHERE id = $1 RETURNING ${COURT_COLUMNS}`,
      [id, c.name, c.sport, c.hourlyPriceCents, c.openHour, c.closeHour, c.isActive],
    )
    .catch(mapWriteError);
  if (!rows[0]) throw new AppError(404, 'COURT_NOT_FOUND', 'Court not found');
  res.json(rows[0]);
});
