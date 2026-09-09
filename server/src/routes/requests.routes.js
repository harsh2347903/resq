import express from 'express';
import { db } from '../config/db.js';
import { optionalAuth } from '../middleware/auth.js';
import { broadcastNewRequest, getIO } from '../socket/socketHandler.js';
import { triageDistressMessage, conversationalTriage } from '../services/triageService.js';
import { matchVolunteersToRequest } from '../services/dispatchService.js';
import { findNearby } from '../services/geoService.js';

const router = express.Router();

// Fallback coordinate dictionary for prominent disaster response zones in Maharashtra
const REGION_COORDINATES = {
  kothrud: { lat: 18.5074, lng: 73.8077 },
  warje: { lat: 18.4795, lng: 73.8005 },
  dhayari: { lat: 18.4485, lng: 73.8062 },
  sinhagad: { lat: 18.4900, lng: 73.8200 },
  pashan: { lat: 18.5412, lng: 73.7929 },
  satara: { lat: 17.6805, lng: 74.0183 },
  nagpur: { lat: 21.1458, lng: 79.0882 },
  pune: { lat: 18.5204, lng: 73.8567 },
  mumbai: { lat: 19.0760, lng: 72.8777 }
};

function inferCoordinates(locationStr = '') {
  const norm = locationStr.toLowerCase();
  for (const [key, coords] of Object.entries(REGION_COORDINATES)) {
    if (norm.includes(key)) return coords;
  }
  return { lat: 18.5204, lng: 73.8567 }; // Default Central Command
}

// GET /api/requests
router.get('/', (req, res) => {
  const { status, priority, type, lat, lng, radius } = req.query;
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

  // Geospatial filtering if coordinates provided
  if (lat && lng) {
    list = findNearby(list, Number(lat), Number(lng), Number(radius || 30));
  }

  res.json({
    success: true,
    count: list.length,
    requests: list
  });
});

// POST /api/requests/triage - Live triage analysis preview
router.post('/triage', (req, res) => {
  const { text, priority = 'High' } = req.body;
  if (!text) {
    return res.status(400).json({ error: 'Distress text required for triage analysis.' });
  }
  const triageResult = triageDistressMessage(text, priority);
  res.json({
    success: true,
    triage: triageResult
  });
});

// POST /api/requests/triage/chat - Conversational AI Triage interaction
router.post('/triage/chat', (req, res) => {
  const { message, lang = 'en', location = 'Pune' } = req.body;
  if (!message) {
    return res.status(400).json({ error: 'Message required for conversational triage.' });
  }
  const result = conversationalTriage(message, lang, location);
  res.json({
    success: true,
    result
  });
});

// POST /api/requests (SOS Help Submission with Idempotency & AI Triage)
router.post('/', optionalAuth, (req, res) => {
  const idempotencyKey = req.headers['x-idempotency-key'] || req.body.idempotencyKey;
  if (idempotencyKey) {
    const existing = db.hasIdempotencyKey(idempotencyKey);
    if (existing) {
      return res.status(200).json({
        ...existing.data,
        isIdempotentReplay: true
      });
    }
  }

  const { type, location, priority = 'High', details, phone, citizen, coordinates, source = 'web', triage: clientTriage, rawQuery } = req.body;

  if (!type || !location) {
    return res.status(400).json({ error: 'Assistance type and location are required' });
  }

  const requester = citizen || req.user?.name || 'Citizen';
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });

  // Run AI & NLP Triage Engine if not provided by client
  const triage = clientTriage || triageDistressMessage(`${type} assistance needed: ${details || ''}`, priority);
  const coords = coordinates || inferCoordinates(location);

  const newRequest = db.insert('requests', {
    citizen: requester,
    type,
    location,
    coordinates: coords,
    priority: triage.urgency || priority,
    status: 'Open',
    team: '—',
    time: timeStr,
    phone: phone || req.user?.phone || '',
    details: details || rawQuery || '',
    source,
    triage,
    createdAt: now.toISOString()
  });

  db.addAudit(
    `🚨 ${source === 'ai_triage' ? 'AI Triage Escalation' : 'SOS Request'}: ${type} at ${location} by ${requester} [Triage: ${triage.urgency}, Units: ${triage.requiredEquipment?.[0] || 'Standard'}]`,
    requester,
    triage.urgency === 'Critical' ? 'critical' : 'high'
  );

  broadcastNewRequest(newRequest);

  const io = getIO();
  if (io) {
    io.emit('triage:escalation', newRequest);
  }

  const responsePayload = {
    success: true,
    request: newRequest
  };

  if (idempotencyKey) {
    db.recordIdempotencyKey(idempotencyKey, responsePayload);
  }

  res.status(201).json(responsePayload);
});

// POST /api/requests/sms-webhook - Emergency offline SMS/WhatsApp ingestion
router.post('/sms-webhook', (req, res) => {
  const { sender, body = '', from, text } = req.body;
  const rawText = body || text || '';
  const senderNumber = sender || from || '+91-UNKNOWN';

  if (!rawText.trim()) {
    return res.status(400).json({ error: 'SMS message body cannot be empty.' });
  }

  // Parse SMS text format: e.g. "SOS MEDICAL KOTHRUD 4 TRAPPED"
  const triage = triageDistressMessage(rawText, 'Critical');
  const detectedLocation = rawText.match(/(kothrud|warje|dhayari|sinhagad|pashan|satara|nagpur|pune|mumbai)/i)?.[0] || 'Reported via Emergency SMS';

  const newRequest = db.insert('requests', {
    citizen: `SMS Requester (${senderNumber.slice(-4)})`,
    type: triage.category || 'Emergency',
    location: detectedLocation,
    coordinates: inferCoordinates(detectedLocation),
    priority: triage.urgency,
    status: 'Open',
    team: '—',
    time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
    phone: senderNumber,
    details: `[VIA SMS GATEWAY] ${rawText}`,
    triage,
    createdAt: new Date().toISOString()
  });

  db.addAudit(
    `📱 Ingested SMS SOS from ${senderNumber}: ${rawText.slice(0, 45)}...`,
    'SMS Gateway',
    'critical'
  );

  broadcastNewRequest(newRequest);

  res.status(201).json({
    success: true,
    channel: 'SMS_GATEWAY',
    request: newRequest,
    triage
  });
});

// GET /api/requests/:id/matches - Intelligent Dispatch Matcher
router.get('/:id/matches', optionalAuth, (req, res) => {
  const request = db.findById('requests', req.params.id);
  if (!request) {
    return res.status(404).json({ error: 'Request not found' });
  }

  const volunteers = db.getCollection('volunteers');
  const matches = matchVolunteersToRequest(request, volunteers);

  res.json({
    success: true,
    requestId: request.id,
    requestType: request.type,
    location: request.location,
    totalAvailable: volunteers.filter(v => v.status === 'Available').length,
    matches
  });
});

// POST /api/requests/:id/dispatch - Automatic or Manual Dispatch Assignment
router.post('/:id/dispatch', optionalAuth, (req, res) => {
  const { volunteerId, team, ngoOrg, instructions } = req.body;
  const request = db.findById('requests', req.params.id);
  if (!request) {
    return res.status(404).json({ error: 'Request not found' });
  }

  let assignedUnit = team;
  let volunteerName = null;
  if (volunteerId) {
    const vol = db.findById('volunteers', volunteerId);
    if (vol) {
      volunteerName = vol.name;
      assignedUnit = ngoOrg ? `${ngoOrg} · ${vol.name} (${vol.skill})` : `${vol.name} (${vol.skill})`;
      db.update('volunteers', volunteerId, { status: 'On mission', missions: (vol.missions || 0) + 1 });
    }
  }

  if (!assignedUnit) {
    // Auto-match top available volunteer
    const volunteers = db.getCollection('volunteers');
    const matches = matchVolunteersToRequest(request, volunteers);
    if (matches.length > 0 && matches[0].isOptimal) {
      volunteerName = matches[0].name;
      assignedUnit = ngoOrg ? `${ngoOrg} · ${matches[0].name} (${matches[0].skill})` : `${matches[0].name} (${matches[0].skill})`;
      db.update('volunteers', matches[0].volunteerId, { status: 'On mission' });
    } else {
      assignedUnit = ngoOrg ? `${ngoOrg} · Rapid Response Team 01` : 'Rapid Response Team 01';
    }
  }

  const actor = req.user?.name || 'District Incident Commander';
  const updated = db.update('requests', req.params.id, {
    team: assignedUnit,
    ngoOrg: ngoOrg || 'Disaster Response Partner',
    appointedVolunteer: volunteerName,
    dispatchNotes: instructions || 'Immediate rescue and citizen relief deployment.',
    status: 'Assigned',
    assignedAt: new Date().toISOString(),
    assignedBy: actor
  });

  db.addAudit(`🎯 Dispatched ${assignedUnit} to Request #${request.id} (${request.location}) [Assigned by ${actor}]`, actor, 'high');

  const io = getIO();
  if (io) {
    io.emit('request:updated', updated);
    io.emit('triage:assigned', {
      requestId: request.id,
      team: assignedUnit,
      ngoOrg: ngoOrg || 'Disaster Response Partner',
      appointedVolunteer: volunteerName,
      status: 'Assigned'
    });
  }

  res.json({
    success: true,
    message: `Mission assigned to ${assignedUnit}`,
    request: updated
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
