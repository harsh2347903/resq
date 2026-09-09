import express from 'express';
import { db } from '../config/db.js';
import { optionalAuth } from '../middleware/auth.js';

const router = express.Router();

// GET /api/campaigns
router.get('/', (req, res) => {
  const campaigns = db.getCollection('campaigns');
  res.json({
    success: true,
    count: campaigns.length,
    campaigns
  });
});

// POST /api/campaigns
router.post('/', optionalAuth, (req, res) => {
  const { name, org, tag, reach = '0', status = 'Live', location, copy } = req.body;

  if (!name || !org || !copy) {
    return res.status(400).json({ error: 'Campaign name, organization, and message copy are required' });
  }

  const actor = req.user?.name || org;
  const newCampaign = db.insert('campaigns', {
    name,
    org,
    tag: tag || 'Relief',
    reach,
    status,
    location: location || 'All Districts',
    copy
  });

  db.addAudit(`Campaign launched: "${name}" by ${org}`, actor, 'info');

  res.status(201).json({
    success: true,
    campaign: newCampaign
  });
});

export default router;
