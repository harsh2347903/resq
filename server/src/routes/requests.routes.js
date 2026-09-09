import express from 'express';
import { db } from '../config/db.js';
import { optionalAuth } from '../middleware/auth.js';
import { broadcastNewRequest } from '../socket/socketHandler.js';

const router = express.Router();

// GET /api/requests
router.get('/', (req, res) => {
  const { status, priority, type } = req.query;
  let list = db.getCollection('requests');

  if (status) {
    list = list.filter(r => r.status.toLowerCase() === status.toLowerCase());
  }
  if (priority) {
    list = list.filter(r => r.priority.toLowerCase() === priority.toLowerCase());
  }
  if (type) {
    list = list.filter(r => r.type.toLowerCase() === type.toLowerCase());
  }

  res.json({
    success: true,
    count: list.length,
    requests: list
  });
});

// GET /api/requests/:id
router.get('/:id', (req, res) => {
  const item = db.findById('requests', req.params.id);
  if (!item) {
    return res.status(404).json({ error: 'Request not found' });
  }
  res.json({ success: true, request: item });
});

// POST /api/requests (SOS help submission)
router.post('/', optionalAuth, (req, res) => {
  const { type, location, priority = 'High', details, phone, citizen } = req.body;

  if (!type || !location) {
    return res.status(400).json({ error: 'Assistance type and location are required' });
  }

  const requester = citizen || req.user?.name || 'Citizen';
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });

  const newRequest = db.insert('requests', {
    citizen: requester,
    type,
    location,
    priority,
    status: 'Open',
    team: '—',
    time: timeStr,
    phone: phone || req.user?.phone || '',
    details: details || '',
    createdAt: now.toISOString()
  });

  db.addAudit(
    `🚨 SOS Request created: ${type} assistance needed at ${location} by ${requester}`,
    requester,
    priority === 'Critical' ? 'high' : 'medium'
  );

  broadcastNewRequest(newRequest);

  res.status(201).json({
    success: true,
    request: newRequest
  });
});

// PATCH /api/requests/:id/assign
router.patch('/:id/assign', optionalAuth, (req, res) => {
  const { team } = req.body;
  const assignedTeam = team || req.user?.name || 'Volunteer Unit';

  const updated = db.update('requests', req.params.id, {
    team: assignedTeam,
    status: 'Assigned'
  });

  if (!updated) {
    return res.status(404).json({ error: 'Request not found' });
  }

  db.addAudit(`Request ${req.params.id} assigned to ${assignedTeam}`, assignedTeam, 'info');

  res.json({
    success: true,
    request: updated
  });
});

// PATCH /api/requests/:id/status
router.patch('/:id/status', optionalAuth, (req, res) => {
  const { status, team } = req.body;
  const updates = {};
  if (status) updates.status = status;
  if (team) updates.team = team;

  const actor = req.user?.name || 'Responder';
  const updated = db.update('requests', req.params.id, updates);

  if (!updated) {
    return res.status(404).json({ error: 'Request not found' });
  }

  db.addAudit(`Request ${req.params.id} marked as ${status}`, actor, 'info');

  res.json({
    success: true,
    request: updated
  });
});

export default router;
