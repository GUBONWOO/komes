const { Router } = require('express');
const passport = require('passport');
const jwt = require('jsonwebtoken');

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-prod';
const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 12 * 60 * 60 * 1000, // 12시간
};

router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'], session: false }));

router.get('/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/?error=auth_failed' }),
  (req, res) => {
    const token = jwt.sign(req.user, JWT_SECRET, { expiresIn: '12h' });
    res.cookie('token', token, COOKIE_OPTS);
    res.redirect('/');
  }
);

router.get('/me', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  res.json(req.user);
});

router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ ok: true });
});

module.exports = router;
