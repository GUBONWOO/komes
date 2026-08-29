import { Router, Request, Response } from 'express';
import passport from 'passport';
import jwt from 'jsonwebtoken';
import type { UserProfile } from '../types';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-in-prod';
const COOKIE_OPTS = {
  httpOnly: true,
  secure:   process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge:   12 * 60 * 60 * 1000,
};

router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'], session: false }));

router.get(
  '/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/?error=auth_failed' }),
  (req: Request, res: Response) => {
    const token = jwt.sign(req.user as UserProfile, JWT_SECRET, { expiresIn: '12h' });
    res.cookie('token', token, COOKIE_OPTS);
    res.redirect('/');
  }
);

router.get('/me', (req: Request, res: Response) => {
  if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return; }
  res.json(req.user);
});

router.post('/logout', (_req: Request, res: Response) => {
  res.clearCookie('token');
  res.json({ ok: true });
});

export default router;
