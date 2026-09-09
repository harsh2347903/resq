import express from 'express';
import { db } from '../config/db.js';
import { optionalAuth } from '../middleware/auth.js';

const router = express.Router();

// GET /api/audit
router.get('/', (req, res) => {
  const audits = db.getCollection('audits');
  res.json({
    success: true,
    count: audits.length,
    audits
  });
});

// POST /api/audit (log custom event)
router.post('/', optionalAuth, (req, res) => {
  const { action, severity = 'info' } = req.body;
  const actor = req.user?.name || req.body.actor || 'System';

  if (!action) {
    return res.status(400).json({ error: 'Action is required' });
  }

  const record = db.addAudit(action, actor, severity);
  res.status(201).json({
    success: true,
    audit: record
  });
});

export default router;
