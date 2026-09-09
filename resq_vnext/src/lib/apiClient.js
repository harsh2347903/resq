import { io } from 'socket.io-client';

const API_BASE = '/api';
let socketInstance = null;

// Retrieve stored token or session envelope
function getAuthHeaders() {
  const headers = {
    'Content-Type': 'application/json'
  };
  try {
    const raw = localStorage.getItem('resq_permission_envelope_v2');
    if (raw) {
      const envelope = JSON.parse(raw);
      if (envelope.token) {
        headers['Authorization'] = `Bearer ${envelope.token}`;
        headers['x-resq-token'] = envelope.token;
      }
      headers['x-resq-envelope'] = raw;
    }
  } catch {}
  return headers;
}

// Universal fetch wrapper with fallback
async function request(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const config = {
    ...options,
    headers: {
      ...getAuthHeaders(),
      ...(options.headers || {})
    }
  };

  try {
    const res = await fetch(url, config);
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(errorData.error || `HTTP error ${res.status}`);
    }
    return await res.json();
  } catch (err) {
    // If proxied /api fails, try direct :5000 fallback
    if (!url.startsWith('http')) {
      try {
        const directUrl = `http://localhost:5000${url}`;
        const directRes = await fetch(directUrl, config);
        if (directRes.ok) return await directRes.json();
      } catch {}
    }
    console.warn(`[RESQ API] Network request to ${endpoint} failed, falling back to offline handler:`, err.message);
    throw err;
  }
}

// Socket.IO real-time singleton
export function getSocket() {
  if (!socketInstance) {
    // Connect through proxy or direct port
    const socketUrl = window.location.origin.includes('5173')
      ? 'http://localhost:5000'
      : window.location.origin;

    socketInstance = io(socketUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000
    });

    socketInstance.on('connect', () => {
      console.log('⚡ Socket.IO connected to RESQ Coordination Server');
      // Announce current user
      try {
        const envelope = JSON.parse(localStorage.getItem('resq_permission_envelope_v2') || '{}');
        if (envelope.role) {
          socketInstance.emit('resq:join', envelope);
        }
      } catch {}
    });

    socketInstance.on('crisis:activated', (crisisData) => {
      console.log('🚨 Received CRISIS:ACTIVATED broadcast from server:', crisisData);
      window.dispatchEvent(new CustomEvent('resq:socket-crisis-activated', { detail: crisisData }));
    });

    socketInstance.on('crisis:standdown', (crisisData) => {
      console.log('🟢 Received CRISIS:STANDDOWN broadcast from server:', crisisData);
      window.dispatchEvent(new CustomEvent('resq:socket-crisis-standdown', { detail: crisisData }));
    });

    socketInstance.on('crisis:alert-tick', (alertData) => {
      window.dispatchEvent(new CustomEvent('resq:socket-alert-tick', { detail: alertData }));
    });

    socketInstance.on('incident:new', (incident) => {
      window.dispatchEvent(new CustomEvent('resq:socket-new-incident', { detail: incident }));
    });

    socketInstance.on('request:new', (request) => {
      window.dispatchEvent(new CustomEvent('resq:socket-new-request', { detail: request }));
    });

    socketInstance.on('disconnect', () => {
      console.log('🔌 Socket.IO disconnected from server');
    });
  }
  return socketInstance;
}

export const api = {
  auth: {
    login: async (credentials) => {
      return await request('/auth/login', {
        method: 'POST',
        body: JSON.stringify(credentials)
      });
    },
    me: async () => {
      return await request('/auth/me');
    }
  },

  crisis: {
    getStatus: async () => {
      return await request('/crisis/status');
    },
    getScenarios: async () => {
      return await request('/crisis/scenarios');
    },
    activate: async (payload) => {
      return await request('/crisis/activate', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    },
    deactivate: async (payload) => {
      return await request('/crisis/deactivate', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    },
    triggerAlert: async (alertPayload) => {
      return await request('/crisis/trigger-alert', {
        method: 'POST',
        body: JSON.stringify(alertPayload)
      });
    }
  },

  incidents: {
    getAll: async (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return await request(`/incidents${q ? '?' + q : ''}`);
    },
    getById: async (id) => {
      return await request(`/incidents/${id}`);
    },
    create: async (incident) => {
      return await request('/incidents', {
        method: 'POST',
        body: JSON.stringify(incident)
      });
    },
    update: async (id, updates) => {
      return await request(`/incidents/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(updates)
      });
    }
  },

  requests: {
    getAll: async (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return await request(`/requests${q ? '?' + q : ''}`);
    },
    create: async (sosRequest) => {
      return await request('/requests', {
        method: 'POST',
        body: JSON.stringify(sosRequest)
      });
    },
    assign: async (id, team) => {
      return await request(`/requests/${id}/assign`, {
        method: 'PATCH',
        body: JSON.stringify({ team })
      });
    },
    updateStatus: async (id, status, team) => {
      return await request(`/requests/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status, team })
      });
    }
  },

  broadcasts: {
    getAll: async () => {
      return await request('/broadcasts');
    },
    create: async (alert) => {
      return await request('/broadcasts', {
        method: 'POST',
        body: JSON.stringify(alert)
      });
    }
  },

  shelters: {
    getAll: async () => {
      return await request('/shelters');
    },
    getNearby: async (lat, lng, radius = 25) => {
      return await request(`/shelters/nearby?lat=${lat}&lng=${lng}&radius=${radius}`);
    },
    update: async (id, updates) => {
      return await request(`/shelters/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(updates)
      });
    }
  },

  requests: {
    getAll: async (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return await request(`/requests${q ? '?' + q : ''}`);
    },
    create: async (sosRequest, idempotencyKey) => {
      return await request('/requests', {
        method: 'POST',
        headers: idempotencyKey ? { 'x-idempotency-key': idempotencyKey } : {},
        body: JSON.stringify(sosRequest)
      });
    },
    triage: async (text, priority) => {
      return await request('/requests/triage', {
        method: 'POST',
        body: JSON.stringify({ text, priority })
      });
    },
    triageChat: async (message, lang = 'en', location = 'Pune') => {
      return await request('/requests/triage/chat', {
        method: 'POST',
        body: JSON.stringify({ message, lang, location })
      });
    },
    smsWebhook: async (sender, body) => {
      return await request('/requests/sms-webhook', {
        method: 'POST',
        body: JSON.stringify({ sender, body })
      });
    },
    getMatches: async (id) => {
      return await request(`/requests/${id}/matches`);
    },
    dispatch: async (id, payload = {}) => {
      return await request(`/requests/${id}/dispatch`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    },
    assign: async (id, team) => {
      return await request(`/requests/${id}/assign`, {
        method: 'PATCH',
        body: JSON.stringify({ team })
      });
    },
    updateStatus: async (id, status, team) => {
      return await request(`/requests/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status, team })
      });
    }
  },

  threats: {
    getLive: async () => {
      return await request('/threats/live');
    },
    sync: async (feedId) => {
      return await request('/threats/sync', {
        method: 'POST',
        body: JSON.stringify({ feedId })
      });
    }
  },

  broadcasts: {
    getAll: async () => {
      return await request('/broadcasts');
    },
    getVapidKey: async () => {
      return await request('/broadcasts/vapid-key');
    },
    pushSubscribe: async (subscription) => {
      return await request('/broadcasts/push-subscribe', {
        method: 'POST',
        body: JSON.stringify({ subscription })
      });
    },
    create: async (alert) => {
      return await request('/broadcasts', {
        method: 'POST',
        body: JSON.stringify(alert)
      });
    }
  },

  audit: {
    getAll: async () => {
      return await request('/audit');
    },
    verify: async () => {
      return await request('/audit/verify');
    },
    log: async (action, severity = 'info') => {
      return await request('/audit', {
        method: 'POST',
        body: JSON.stringify({ action, severity })
      });
    }
  }
};
