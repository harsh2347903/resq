import express from 'express';
import { optionalAuth } from '../middleware/auth.js';
import { db } from '../config/db.js';
import {
  broadcastCrisisActivation,
  broadcastCrisisStanddown,
  CRISIS_SCENARIOS,
  getIO
} from '../socket/socketHandler.js';

const router = express.Router();
const OFFICER_PASSKEY = process.env.OFFICER_PASSKEY || 'RESQ07';

// GET /api/crisis/status
router.get('/status', (req, res) => {
  const status = db.getCrisisState();
  res.json({
    success: true,
    crisis: status
  });
});

// GET /api/crisis/scenarios
router.get('/scenarios', (req, res) => {
  res.json({
    success: true,
    scenarios: CRISIS_SCENARIOS
  });
});

// POST /api/crisis/activate
router.post('/activate', optionalAuth, (req, res) => {
  const { commanderName, role, reason, passkey, scenarioId } = req.body;

  // Determine authorized role
  const userRole = req.user?.role || role;
  const userName = req.user?.name || commanderName || 'Incident Commander';

  // Security gate: must have role or passkey
  if (userRole !== 'government' && userRole !== 'admin' && passkey !== OFFICER_PASSKEY) {
    db.addAudit(`Unauthorized attempt to activate CRISIS MODE by ${userName}`, userName, 'critical');
    return res.status(403).json({
      error: 'Unauthorized. Only Government Incident Commanders or Admins with valid clearance may activate crisis mode.'
    });
  }

  let selectedScenario = CRISIS_SCENARIOS[0];
  if (scenarioId) {
    const found = CRISIS_SCENARIOS.find(s => s.id === scenarioId || s.code === scenarioId);
    if (found) selectedScenario = found;
  }

  const crisisData = broadcastCrisisActivation({
    activatedBy: userName,
    role: userRole || 'government',
    reason: reason || 'State-level Emergency Crisis Protocol Triggered',
    currentScenario: selectedScenario
  });

  res.json({
    success: true,
    message: '🚨 Code Red Crisis activated. Multi-client siren broadcast dispatched.',
    crisis: crisisData
  });
});

// POST /api/crisis/deactivate
router.post('/deactivate', optionalAuth, (req, res) => {
  const { commanderName, role, passkey } = req.body;

  const userRole = req.user?.role || role;
  const userName = req.user?.name || commanderName || 'Incident Commander';

  if (userRole !== 'government' && userRole !== 'admin' && passkey !== OFFICER_PASSKEY) {
    return res.status(403).json({
      error: 'Unauthorized. Only Government Incident Commanders or Admins can stand down crisis mode.'
    });
  }

  const standdownData = broadcastCrisisStanddown({
    stoodDownBy: userName,
    role: userRole || 'government'
  });

  res.json({
    success: true,
    message: '🟢 Emergency crisis stood down. Siren silenced, posture normalized.',
    crisis: standdownData
  });
});

// POST /api/crisis/trigger-alert
router.post('/trigger-alert', optionalAuth, (req, res) => {
  const { title, message, category, area, severity = 'critical' } = req.body;

  const io = getIO();
  const alertPayload = {
    id: `alert-${Date.now()}`,
    title: title || 'Immediate Life Safety Warning',
    message: message || 'Follow official instructions immediately.',
    category: category || 'CIVIL EMERGENCY',
    area: area || 'State Emergency Zone',
    severity,
    timestamp: Date.now(),
    isoTime: new Date().toISOString()
  };

  if (io) {
    io.emit('crisis:alert-tick', alertPayload);
  }

  res.json({
    success: true,
    alert: alertPayload
  });
});

export default router;
