import express from 'express';
import { db } from '../config/db.js';
import { optionalAuth } from '../middleware/auth.js';
import { findNearby } from '../services/geoService.js';

const router = express.Router();

// GET /api/shelters/nearby - Geospatial radius search
router.get('/nearby', (req, res) => {
  const { lat, lng, radius = 25 } = req.query;

  if (!lat || !lng) {
    return res.status(400).json({ error: 'Latitude (lat) and longitude (lng) query parameters are required.' });
  }

  const shelters = db.getCollection('shelters');
  const nearby = findNearby(shelters, Number(lat), Number(lng), Number(radius));

  const enriched = nearby.map(s => ({
    ...s,
    availableBeds: Math.max(0, s.capacity - s.occupied),
    occupancyPercent: Math.round((s.occupied / s.capacity) * 100)
  }));

  res.json({
    success: true,
    origin: { lat: Number(lat), lng: Number(lng) },
    radiusKm: Number(radius),
    count: enriched.length,
    shelters: enriched
  });
});

// GET /api/shelters
router.get('/', (req, res) => {
  const shelters = db.getCollection('shelters');
  res.json({
    success: true,
    count: shelters.length,
    shelters
  });
});

// PATCH /api/shelters/:id
router.patch('/:id', optionalAuth, (req, res) => {
  const { occupied, capacity, open, services, coordinates } = req.body;
  const updates = {};
  if (occupied !== undefined) updates.occupied = Number(occupied);
  if (capacity !== undefined) updates.capacity = Number(capacity);
  if (open !== undefined) updates.open = Boolean(open);
  if (services !== undefined) updates.services = services;
  if (coordinates !== undefined) updates.coordinates = coordinates;

  const actor = req.user?.name || 'Officer';
  const updated = db.update('shelters', req.params.id, updates);

  if (!updated) {
    return res.status(404).json({ error: 'Shelter not found' });
  }

  db.addAudit(`Shelter ${updated.name} updated: occupied=${updated.occupied}/${updated.capacity}`, actor, 'info');

  res.json({
    success: true,
    shelter: updated
  });
});

export default router;
