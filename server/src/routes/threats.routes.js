import express from 'express';
import { db } from '../config/db.js';
import { optionalAuth } from '../middleware/auth.js';
import { getLiveThreats, syncThreatToIncident } from '../services/threatFeedService.js';
import { broadcastNewIncident } from '../socket/socketHandler.js';

const router = express.Router();

// GET /api/threats/live - Real-time disaster threat telemetry
router.get('/live', (req, res) => {
  const threats = getLiveThreats();
  res.json({
    success: true,
    count: threats.length,
    timestamp: new Date().toISOString(),
    threats
  });
});

// POST /api/threats/sync - Ingest threat into official incident ledger
router.post('/sync', optionalAuth, (req, res) => {
  const { feedId } = req.body;

  if (!feedId) {
    return res.status(400).json({ error: 'feedId parameter is required' });
  }

  const incident = syncThreatToIncident(feedId, db, broadcastNewIncident);

  if (!incident) {
    return res.status(404).json({ error: `Threat feed '${feedId}' not found.` });
  }

  res.status(201).json({
    success: true,
    message: `Threat feed ${feedId} synchronized to incident #${incident.id}`,
    incident
  });
});

export default router;
