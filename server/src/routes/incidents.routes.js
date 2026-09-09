import express from 'express';
import { db } from '../config/db.js';
import { optionalAuth } from '../middleware/auth.js';
import { broadcastNewIncident } from '../socket/socketHandler.js';

const router = express.Router();

// GET /api/incidents
router.get('/', (req, res) => {
  const { status, severity } = req.query;
  let list = db.getCollection('incidents');

  if (status) {
    list = list.filter(i => i.status.toLowerCase() === status.toLowerCase());
  }
  if (severity) {
    list = list.filter(i => i.severity.toLowerCase() === severity.toLowerCase());
  }

  res.json({
    success: true,
    count: list.length,
    incidents: list
  });
});

// GET /api/incidents/:id
router.get('/:id', (req, res) => {
  const item = db.findById('incidents', req.params.id);
  if (!item) {
    return res.status(404).json({ error: 'Incident not found' });
  }
  res.json({ success: true, incident: item });
});

// POST /api/incidents
router.post('/', optionalAuth, (req, res) => {
  const { type, location, severity = 'Medium', details, affected = '1+' } = req.body;

  if (!type || !location) {
    return res.status(400).json({ error: 'Type and location are required' });
  }

  const reporter = req.user?.name || req.body.reporter || 'Anonymous Citizen';

  const newIncident = db.insert('incidents', {
    type,
    location,
    severity,
    affected,
    reports: 1,
    status: 'Active',
    details: details || '',
    reporter,
    reportedAt: new Date().toISOString()
  });

  db.addAudit(`New incident reported: ${type} at ${location}`, reporter, severity === 'Critical' ? 'high' : 'info');
  broadcastNewIncident(newIncident);

  res.status(201).json({
    success: true,
    incident: newIncident
  });
});

// PATCH /api/incidents/:id
router.patch('/:id', optionalAuth, (req, res) => {
  const { status, severity, affected, reports } = req.body;
  const updates = {};
  if (status) updates.status = status;
  if (severity) updates.severity = severity;
  if (affected) updates.affected = affected;
  if (reports) updates.reports = reports;

  const actor = req.user?.name || 'Officer';
  const updated = db.update('incidents', req.params.id, updates);

  if (!updated) {
    return res.status(404).json({ error: 'Incident not found' });
  }

  db.addAudit(`Incident ${req.params.id} updated: status=${status || 'unchanged'}`, actor, 'info');

  res.json({
    success: true,
    incident: updated
  });
});

export default router;
