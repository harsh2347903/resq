import express from 'express';
import { db } from '../config/db.js';
import { optionalAuth } from '../middleware/auth.js';
import { broadcastNewAlert } from '../socket/socketHandler.js';

const router = express.Router();

// GET /api/broadcasts
router.get('/', (req, res) => {
  const alerts = db.getCollection('alerts');
  res.json({
    success: true,
    count: alerts.length,
    alerts
  });
});

// POST /api/broadcasts
router.post('/', optionalAuth, (req, res) => {
  const { title, region, body, level = 'warning' } = req.body;

  if (!title || !region || !body) {
    return res.status(400).json({ error: 'Title, region, and advisory body are required' });
  }

  const actor = req.user?.name || 'Incident Command';

  const newAlert = db.insert('alerts', {
    id: Date.now(),
    title,
    region,
    body,
    level,
    time: 'Just now',
    author: actor,
    timestamp: new Date().toISOString()
  });

  db.addAudit(`Official advisory broadcast: ${title} (${region})`, actor, level === 'critical' ? 'high' : 'info');
  broadcastNewAlert(newAlert);

  res.status(201).json({
    success: true,
    alert: newAlert
  });
});

export default router;
