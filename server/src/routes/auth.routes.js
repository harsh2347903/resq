import express from 'express';
import { createRoleEnvelope, requireAuth, ROLES } from '../middleware/auth.js';
import { db } from '../config/db.js';

const router = express.Router();
const VALID_PASSKEYS = ['RAKSHAK07', 'RESQ07', (process.env.OFFICER_PASSKEY || '')].filter(Boolean).map(s => s.toUpperCase());

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { role = 'citizen', name, email, phone, state, district, city, pincode, code } = req.body;

  if (!ROLES[role]) {
    return res.status(400).json({ error: `Invalid role '${role}'. Valid roles: ${Object.keys(ROLES).join(', ')}` });
  }

  const incomingCode = (code || '').trim().toUpperCase();

  // Official clearance passkey check for restricted roles
  if ((role === 'government' || role === 'admin') && !VALID_PASSKEYS.includes(incomingCode)) {
    db.addAudit(`Unauthorized login attempt to ${role.toUpperCase()} role`, name || 'Unknown', 'warning');
    return res.status(403).json({ error: 'Official restricted clearance code is incorrect. Use RAKSHAK07' });
  }

  const envelope = createRoleEnvelope(role, { name, email, phone, state, district, city, pincode });

  db.addAudit(
    `${envelope.name} signed in as ${ROLES[role].label} (${envelope.city}, ${envelope.district})`,
    envelope.name,
    'info'
  );

  return res.json({
    success: true,
    user: envelope,
    token: envelope.token
  });
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  return res.json({
    success: true,
    user: req.user
  });
});

// GET /api/auth/roles
router.get('/roles', (req, res) => {
  return res.json(ROLES);
});

export default router;
