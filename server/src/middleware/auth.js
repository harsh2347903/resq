import crypto from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET || 'resq_emergency_secret_key_secure_2026';

export const ROLES = {
  citizen: {
    label: 'Citizen',
    accent: 'aqua',
    permissions: ['view_alerts', 'request_help', 'track_request', 'view_campaigns', 'view_shelters', 'report_incident', 'family_safety', 'interface_preferences']
  },
  ngo: {
    label: 'NGO / Volunteer',
    accent: 'amber',
    permissions: ['view_alerts', 'view_campaigns', 'offer_help', 'manage_tasks', 'view_shelters', 'view_assigned_help', 'update_missions', 'interface_preferences']
  },
  government: {
    label: 'Government Officer',
    accent: 'emerald',
    permissions: ['view_alerts', 'broadcast_alert', 'verify_requests', 'view_shelters', 'manage_shelters', 'view_campaigns', 'manage_campaigns', 'view_reports', 'manage_incidents', 'view_live_map', 'manage_ngos', 'interface_preferences', 'emergency_crisis_control']
  },
  admin: {
    label: 'System Admin',
    accent: 'violet',
    permissions: ['view_alerts', 'broadcast_alert', 'verify_requests', 'view_shelters', 'manage_shelters', 'view_campaigns', 'manage_campaigns', 'manage_users', 'view_reports', 'system_settings', 'audit_logs', 'manage_roles', 'interface_preferences', 'emergency_crisis_control']
  }
};

export function createToken(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + 7 * 24 * 3600 * 1000 })).toString('base64url');
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

export function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, signature] = parts;
  const expectedSignature = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  if (signature !== expectedSignature) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export function createRoleEnvelope(role, profile = {}) {
  const roleConfig = ROLES[role] || ROLES.citizen;
  const permissions = roleConfig.permissions;
  const payload = {
    role,
    name: profile.name || `Authorized ${roleConfig.label}`,
    email: profile.email || '',
    phone: profile.phone || '',
    state: profile.state || 'Maharashtra',
    district: profile.district || 'Pune',
    taluka: profile.taluka || 'Haveli',
    city: profile.city || 'Pune City (Shivaji Nagar)',
    pincode: profile.pincode || '411005',
    coordinates: profile.coordinates || { lat: 18.5314, lng: 73.8446 },
    permissions,
    issuedAt: Date.now(),
    version: 'v4'
  };
  const token = createToken(payload);
  return { ...payload, token };
}

export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : (req.headers['x-resq-token'] || null);

  if (!token) {
    // If no token, check for raw client envelope header for backwards compatibility
    const clientEnvelopeRaw = req.headers['x-resq-envelope'];
    if (clientEnvelopeRaw) {
      try {
        const envelope = JSON.parse(clientEnvelopeRaw);
        if (envelope && envelope.role && ROLES[envelope.role]) {
          req.user = envelope;
          return next();
        }
      } catch {}
    }
    return res.status(401).json({ error: 'Authentication required. Please provide a valid token or session.' });
  }

  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: 'Invalid or expired session token.' });
  }

  req.user = payload;
  next();
}

export function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : (req.headers['x-resq-token'] || null);
  if (token) {
    const payload = verifyToken(token);
    if (payload) {
      req.user = payload;
    }
  } else {
    const clientEnvelopeRaw = req.headers['x-resq-envelope'];
    if (clientEnvelopeRaw) {
      try {
        const envelope = JSON.parse(clientEnvelopeRaw);
        if (envelope && envelope.role && ROLES[envelope.role]) {
          req.user = envelope;
        }
      } catch {}
    }
  }
  next();
}

export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Access denied. Requires one of [${allowedRoles.join(', ')}], current role is '${req.user.role}'`
      });
    }
    next();
  };
}
