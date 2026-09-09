import { playEmergencyTone, playCrisisSiren, stopContinuousSiren, triggerHaptic } from './soundUtils';
import { getSocket, api } from './apiClient';

export const CRISIS_STORAGE_KEY = 'resq_emergency_crisis_active';
export const CRISIS_META_KEY = 'resq_emergency_crisis_meta';

export const CRISIS_SCENARIOS = [
  {
    id: 'scen-1',
    code: 'EVAC-01',
    category: 'MANDATORY EVACUATION',
    title: 'Zone 4 Flash Flood Surge Breach',
    severity: 'critical',
    area: 'Mula-Mutha River Basin · Sector 4',
    message: 'Water levels crossed critical danger threshold (+4.2m). Severe flooding inundating ground floors. Immediate evacuation ordered to Kothrud Central Relief Hub.',
    actionLabel: 'View Safe Shelters',
    actionRoute: '/shelters'
  },
  {
    id: 'scen-2',
    code: 'SEIS-02',
    category: 'SEISMIC AFTERSHOCK ALERT',
    title: 'Magnitude 5.4 Tremor Recorded',
    severity: 'critical',
    area: 'Sinhagad Lowland Fault Zone',
    message: 'High-energy crustal displacement detected 14km SW. Secondary structural collapses reported. Move away from multi-story facades into designated open assembly zones.',
    actionLabel: 'Live Incidents',
    actionRoute: '/incidents'
  },
  {
    id: 'scen-3',
    code: 'GRID-03',
    category: 'CRITICAL INFRASTRUCTURE FAILURE',
    title: 'District High-Voltage Substation Submergence',
    severity: 'critical',
    area: 'Kothrud Substation Node 02',
    message: 'Submerged transformer units triggered emergency grid trip. 42,000 households without primary power. Hospital triage generators operating on reserve diesel.',
    actionLabel: 'Emergency Requests',
    actionRoute: '/requests'
  },
  {
    id: 'scen-4',
    code: 'DAM-04',
    category: 'SPILLWAY DISCHARGE SURGE',
    title: 'Khadakwasla Dam Emergency Floodgate Release',
    severity: 'critical',
    area: 'Mutha Downstream Channel',
    message: 'Spillway release rate escalated to 48,500 cusecs due to continuous catchment downpours. Riverbank civilian clearance mandatory within 30 minutes.',
    actionLabel: 'View Broadcasts',
    actionRoute: '/alerts'
  },
  {
    id: 'scen-5',
    code: 'SAR-05',
    category: 'SEARCH & RESCUE DISPATCH',
    title: 'NDRF Battalion 04 Watercraft Deployment',
    severity: 'critical',
    area: 'Warje Sector Lowlands',
    message: '12 inflatable motorized zodiac boats deployed to extract 84 stranded families trapped on rooftop terraces. Lifelines established along Sector Main Road.',
    actionLabel: 'Request SOS Help',
    actionRoute: '/help'
  },
  {
    id: 'scen-6',
    code: 'MED-06',
    category: 'MASS CASUALTY PROTOCOL',
    title: 'Shivaji Nagar Mobile Trauma Triage Overflow',
    severity: 'critical',
    area: 'Central District Medical Zone',
    message: 'Field hospital casualty intake reached 94% surgical capacity. Diverting high-priority ambulances to auxiliary field triage posts at Camp 03.',
    actionLabel: 'Shelter Network',
    actionRoute: '/shelters'
  },
  {
    id: 'scen-7',
    code: 'LAND-07',
    category: 'CORRIDOR COLLAPSE',
    title: 'Sinhagad Mountain Pass Mudslide Blockade',
    severity: 'critical',
    area: 'Ghat Route Km 14',
    message: 'Massive mudslide sheared outer retaining wall, stranding 190 evacuation buses and ambulances. Heavy hydraulic excavators dispatched with police escort.',
    actionLabel: 'Incident Board',
    actionRoute: '/incidents'
  },
  {
    id: 'scen-8',
    code: 'AIR-08',
    category: 'TACTICAL AIR RELIEF',
    title: 'IAF Helicopter Ration & Medical Pod Airdrop',
    severity: 'high',
    area: 'Isolated Sinhagad Plateau Sector',
    message: '2 x Mi-17 heavy-lift helicopters completing low-altitude drops of 3,200 packaged ration kits, ORS packets, and satellite comms relays.',
    actionLabel: 'Campaign Support',
    actionRoute: '/campaigns'
  },
  {
    id: 'scen-9',
    code: 'HAZ-09',
    category: 'HAZMAT AIR QUALITY HAZARD',
    title: 'Industrial Ammonia Vapor Containment',
    severity: 'critical',
    area: 'Hadapsar Logistics Corridor',
    message: 'Submerged storage tank valve compromised. Hazmat decontamination crews establishing 1.5km exclusion cordon. Shelter-in-place with wet face coverings.',
    actionLabel: 'View Advisories',
    actionRoute: '/alerts'
  },
  {
    id: 'scen-10',
    code: 'COM-10',
    category: 'EMERGENCY COMMUNICATIONS',
    title: 'Cellular Tower Failure · VHF Mesh Activated',
    severity: 'critical',
    area: 'District Wide Disaster Mesh',
    message: 'Commercial cell networks experiencing severe congestion. Tune handheld radios to VHF Channel 16 (156.800 MHz) for life-safety instructions.',
    actionLabel: 'Help & SOS',
    actionRoute: '/help'
  }
];

export function isCrisisActive() {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(CRISIS_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function getCrisisMeta() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(CRISIS_META_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function applyCrisisTheme(active) {
  if (typeof document === 'undefined') return;
  
  if (active) {
    document.documentElement.dataset.theme = 'crisis';
    document.documentElement.setAttribute('data-theme', 'crisis');
    document.documentElement.dataset.crisis = 'active';
    document.documentElement.classList.add('crisis-mode-active');
    if (document.body) {
      document.body.classList.add('crisis-mode-active');
    }
  } else {
    document.documentElement.dataset.crisis = 'off';
    document.documentElement.classList.remove('crisis-mode-active');
    if (document.body) {
      document.body.classList.remove('crisis-mode-active');
    }
    // Restore preferred theme
    try {
      const prefs = JSON.parse(localStorage.getItem('resq_interface_preferences_v1') || '{}');
      const theme = prefs.theme || 'dark';
      document.documentElement.dataset.theme = theme;
      document.documentElement.setAttribute('data-theme', theme);
    } catch {}
  }
}

export function activateCrisisMode(commanderName = 'Authorized Incident Commander', role = 'government', skipServer = false) {
  if (typeof window === 'undefined') return null;
  try {
    const meta = {
      active: true,
      activatedAt: Date.now(),
      activatedBy: commanderName,
      role: role,
      defcon: 'DEFCON 1 · MAXIMUM READINESS',
      reason: 'State-level Emergency Crisis Protocol Triggered'
    };
    
    localStorage.setItem(CRISIS_STORAGE_KEY, 'true');
    localStorage.setItem(CRISIS_META_KEY, JSON.stringify(meta));
    
    applyCrisisTheme(true);
    
    // Play authentic disaster siren & trigger emergency haptic
    playCrisisSiren(3.2);
    triggerHaptic([400, 200, 400, 200, 600]);

    // Dispatch global sync events
    window.dispatchEvent(new CustomEvent('resq:crisis-mode', { detail: { active: true, meta } }));
    window.dispatchEvent(new CustomEvent('resq:preferences', { detail: { theme: 'crisis' } }));
    
    // Record into official audit activity
    try {
      const actKey = 'resq_system_activity_v3';
      const existing = JSON.parse(localStorage.getItem(actKey) || '[]');
      const event = {
        id: 'crisis-decl-' + Date.now(),
        kind: 'broadcast',
        severity: 'critical',
        message: `🚨 CODE RED EMERGENCY CRISIS ACTIVATED BY ${commanderName.toUpperCase()} (${role.toUpperCase()})`,
        actor: commanderName,
        time: 'just now',
        createdAt: Date.now()
      };
      existing.unshift(event);
      localStorage.setItem(actKey, JSON.stringify(existing.slice(0, 80)));
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('resq:activity', { detail: event }));
      }, 0);
    } catch {}

    // Dispatch to backend API and Socket.IO for cross-device broadcast
    if (!skipServer) {
      api.crisis.activate({ commanderName, role, reason: meta.reason }).catch(() => {});
      try {
        const socket = getSocket();
        if (socket && socket.connected) {
          socket.emit('crisis:activate', { activatedBy: commanderName, role, reason: meta.reason });
        }
      } catch {}
    }

    return meta;
  } catch (err) {
    console.error('Failed to activate crisis mode:', err);
    return null;
  }
}

export function deactivateCrisisMode(commanderName = 'Incident Commander', role = 'government', skipServer = false) {
  if (typeof window === 'undefined') return false;
  try {
    localStorage.removeItem(CRISIS_STORAGE_KEY);
    localStorage.removeItem(CRISIS_META_KEY);
    
    applyCrisisTheme(false);
    
    stopContinuousSiren();
    playEmergencyTone('chime');
    triggerHaptic([200, 100, 200]);

    window.dispatchEvent(new CustomEvent('resq:crisis-mode', { detail: { active: false } }));
    
    // Record audit event
    try {
      const actKey = 'resq_system_activity_v3';
      const existing = JSON.parse(localStorage.getItem(actKey) || '[]');
      const event = {
        id: 'crisis-end-' + Date.now(),
        kind: 'broadcast',
        severity: 'info',
        message: `🟢 EMERGENCY CRISIS STOOD DOWN by ${commanderName} (${role.toUpperCase()}). Posture normalized.`,
        actor: commanderName,
        time: 'just now',
        createdAt: Date.now()
      };
      existing.unshift(event);
      localStorage.setItem(actKey, JSON.stringify(existing.slice(0, 80)));
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('resq:activity', { detail: event }));
      }, 0);
    } catch {}

    // Dispatch to backend API and Socket.IO
    if (!skipServer) {
      api.crisis.deactivate({ commanderName, role }).catch(() => {});
      try {
        const socket = getSocket();
        if (socket && socket.connected) {
          socket.emit('crisis:standdown', { stoodDownBy: commanderName, role });
        }
      } catch {}
    }

    return true;
  } catch (err) {
    console.error('Failed to deactivate crisis mode:', err);
    return false;
  }
}

// Automatically bind global real-time synchronization between browser tabs and backend
if (typeof window !== 'undefined') {
  // Ensure socket connection
  getSocket();

  // Handle remote crisis activation from server
  window.addEventListener('resq:socket-crisis-activated', (e) => {
    const remoteMeta = e.detail;
    console.log('⚡ Processing remote crisis activation:', remoteMeta);
    if (!isCrisisActive()) {
      activateCrisisMode(remoteMeta?.activatedBy || 'Authorized Incident Commander', remoteMeta?.role || 'government', true);
    }
  });

  // Handle remote crisis standdown from server
  window.addEventListener('resq:socket-crisis-standdown', (e) => {
    const remoteMeta = e.detail;
    console.log('⚡ Processing remote crisis standdown:', remoteMeta);
    if (isCrisisActive()) {
      deactivateCrisisMode(remoteMeta?.stoodDownBy || 'Incident Commander', remoteMeta?.role || 'government', true);
    }
  });

  // Fetch initial server crisis state on app load
  api.crisis.getStatus()
    .then((res) => {
      if (res?.crisis?.active) {
        if (!isCrisisActive()) {
          console.log('🚨 Synchronizing with active server crisis:', res.crisis);
          activateCrisisMode(res.crisis.activatedBy, res.crisis.role, true);
        }
      } else if (!res?.crisis?.active && isCrisisActive()) {
        // Server stands down, clear stale local crisis
        deactivateCrisisMode('Incident Command', 'government', true);
      }
    })
    .catch(() => {
      // Backend not yet reachable, keep local preference
    });
}
