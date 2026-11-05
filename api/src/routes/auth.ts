import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { pool } from '../db.js';
import { AppError } from '../errors.js';
import { requireAuth, currentUser, signToken, type Role } from '../auth.js';

export const authRouter = Router();

const loginBody = z.object({ email: z.string().email(), password: z.string().min(1) });

authRouter.post('/login', async (req, res) => {
  const { email, password } = loginBody.parse(req.body);
  const { rows } = await pool.query<{ id: number; name: string; email: string; role: Role; password_hash: string }>(
    'SELECT id, name, email, role, password_hash FROM users WHERE email = $1',
    [email.toLowerCase()],
  );
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Wrong email or password');
  }
  res.json({ token: signToken(user), user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

authRouter.get('/me', requireAuth, async (req, res) => {
  const { rows } = await pool.query('SELECT id, name, email, role FROM users WHERE id = $1', [currentUser(req).id]);
  if (!rows[0]) throw new AppError(401, 'UNAUTHENTICATED', 'User no longer exists');
  res.json(rows[0]);
});
