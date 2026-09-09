import express from 'express';
import { db } from '../config/db.js';
import { optionalAuth } from '../middleware/auth.js';

const router = express.Router();

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
  const { occupied, capacity, open, services } = req.body;
  const updates = {};
  if (occupied !== undefined) updates.occupied = Number(occupied);
  if (capacity !== undefined) updates.capacity = Number(capacity);
  if (open !== undefined) updates.open = Boolean(open);
  if (services !== undefined) updates.services = services;

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
