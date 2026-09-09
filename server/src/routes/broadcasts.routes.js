import express from 'express';
import { db } from '../config/db.js';
import { optionalAuth } from '../middleware/auth.js';
import { broadcastNewAlert } from '../socket/socketHandler.js';
import {
  DEMO_VAPID_PUBLIC_KEY,
  registerSubscription,
  broadcastPushNotification,
  getSubscriberCount
} from '../services/pushService.js';

const router = express.Router();

// GET /api/broadcasts/vapid-key
router.get('/vapid-key', (req, res) => {
  res.json({
    publicKey: DEMO_VAPID_PUBLIC_KEY,
    subscribersActive: getSubscriberCount()
  });
});

// POST /api/broadcasts/push-subscribe
router.post('/push-subscribe', (req, res) => {
  const { subscription } = req.body;
  const registered = registerSubscription(subscription);
  res.json({
    success: true,
    registered,
    totalSubscribers: getSubscriberCount()
  });
});

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

  // Trigger Web Push Notification broadcast
  const pushDelivery = broadcastPushNotification({
    title: `🚨 EMERGENCY ADVISORY: ${title}`,
    body: `${region} — ${body}`,
    level
  });

  res.status(201).json({
    success: true,
    alert: newAlert,
    pushDelivery
  });
});

export default router;
