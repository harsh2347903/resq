import express from 'express';
import { createRoleEnvelope, requireAuth, ROLES } from '../middleware/auth.js';
import { db } from '../config/db.js';

const router = express.Router();
const OFFICER_PASSKEY = process.env.OFFICER_PASSKEY || 'RESQ07';

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { role = 'citizen', name, email, phone, state, district, city, pincode, code } = req.body;

  if (!ROLES[role]) {
    return res.status(400).json({ error: `Invalid role '${role}'. Valid roles: ${Object.keys(ROLES).join(', ')}` });
  }

  // Official clearance passkey check for restricted roles
  if ((role === 'government' || role === 'admin') && code !== OFFICER_PASSKEY) {
    db.addAudit(`Unauthorized login attempt to ${role.toUpperCase()} role`, name || 'Unknown', 'warning');
    return res.status(403).json({ error: 'Official restricted clearance code is incorrect.' });
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
