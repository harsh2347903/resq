import express from 'express';
import { db } from '../config/db.js';
import { optionalAuth } from '../middleware/auth.js';
import { broadcastNewIncident } from '../socket/socketHandler.js';
import { findNearby } from '../services/geoService.js';

const router = express.Router();

const REGION_COORDINATES = {
  pune: { lat: 18.5204, lng: 73.8567 },
  lonavala: { lat: 18.7546, lng: 73.4062 },
  nashik: { lat: 19.9975, lng: 73.7898 },
  nagpur: { lat: 21.1458, lng: 79.0882 },
  satara: { lat: 17.6805, lng: 74.0183 },
  mumbai: { lat: 19.0760, lng: 72.8777 }
};

function inferCoordinates(locationStr = '') {
  const norm = locationStr.toLowerCase();
  for (const [key, coords] of Object.entries(REGION_COORDINATES)) {
    if (norm.includes(key)) return coords;
  }
  return { lat: 18.5204, lng: 73.8567 };
}

// GET /api/incidents/nearby - Geospatial radius search
router.get('/nearby', (req, res) => {
  const { lat, lng, radius = 50 } = req.query;

  if (!lat || !lng) {
    return res.status(400).json({ error: 'Latitude (lat) and longitude (lng) query parameters are required.' });
  }

  const incidents = db.getCollection('incidents');
  const nearby = findNearby(incidents, Number(lat), Number(lng), Number(radius));

  res.json({
    success: true,
    origin: { lat: Number(lat), lng: Number(lng) },
    radiusKm: Number(radius),
    count: nearby.length,
    incidents: nearby
  });
});

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
  const { type, location, severity = 'Medium', details, affected = '1+', coordinates } = req.body;

  if (!type || !location) {
    return res.status(400).json({ error: 'Type and location are required' });
  }

  const reporter = req.user?.name || req.body.reporter || 'Anonymous Citizen';
  const coords = coordinates || inferCoordinates(location);

  const newIncident = db.insert('incidents', {
    type,
    location,
    coordinates: coords,
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
  const { status, severity, affected, reports, coordinates } = req.body;
  const updates = {};
  if (status) updates.status = status;
  if (severity) updates.severity = severity;
  if (affected) updates.affected = affected;
  if (reports) updates.reports = reports;
  if (coordinates) updates.coordinates = coordinates;

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
