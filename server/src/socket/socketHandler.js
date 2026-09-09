import { db } from '../config/db.js';

let ioInstance = null;
let crisisIntervalId = null;
let scenarioIndex = 0;

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

export function initSocket(io) {
  ioInstance = io;

  io.on('connection', (socket) => {
    console.log(`🔌 Client connected: ${socket.id}`);

    // Send current crisis state to newly connected client
    const currentCrisis = db.getCrisisState();
    socket.emit('crisis:sync', currentCrisis);

    // Identify user role and register in room
    socket.on('resq:join', (userProfile) => {
      if (userProfile?.role) {
        socket.join(`role:${userProfile.role}`);
        socket.data.user = userProfile;
        console.log(`👤 Client ${socket.id} joined room role:${userProfile.role}`);
      }
    });

    // Handle crisis activation over socket
    socket.on('crisis:activate', (data) => {
      const role = data?.role || socket.data?.user?.role;
      if (role !== 'government' && role !== 'admin') {
        socket.emit('crisis:error', { error: 'Unauthorized: Only Government Officer or Admin can trigger emergency crisis' });
        return;
      }
      broadcastCrisisActivation(data);
    });

    // Handle crisis stand-down over socket
    socket.on('crisis:standdown', (data) => {
      const role = data?.role || socket.data?.user?.role;
      if (role !== 'government' && role !== 'admin') {
        socket.emit('crisis:error', { error: 'Unauthorized: Only Government Officer or Admin can stand down crisis' });
        return;
      }
      broadcastCrisisStanddown(data);
    });

    // Handle SOS alert submission
    socket.on('request:sos', (sosData) => {
      const record = db.insert('requests', {
        ...sosData,
        status: 'Open',
        priority: 'Critical'
      });
      db.addAudit(`SOS emergency request received from ${record.citizen || 'Citizen'} (${record.location})`, 'Citizen SOS', 'high');
      io.emit('request:new', record);
    });

    socket.on('disconnect', () => {
      console.log(`🔌 Client disconnected: ${socket.id}`);
    });
  });

  // Check if crisis was already active in DB on server restart
  const existingCrisis = db.getCrisisState();
  if (existingCrisis && existingCrisis.active) {
    startCrisisTicker();
  }
}

export function startCrisisTicker() {
  if (crisisIntervalId) clearInterval(crisisIntervalId);

  // 10 alerts per minute = 1 alert every 6,000 milliseconds (6 seconds)
  crisisIntervalId = setInterval(() => {
    if (!ioInstance) return;

    const crisisState = db.getCrisisState();
    if (!crisisState.active) {
      clearInterval(crisisIntervalId);
      crisisIntervalId = null;
      return;
    }

    const scenario = CRISIS_SCENARIOS[scenarioIndex % CRISIS_SCENARIOS.length];
    scenarioIndex++;

    const alertPayload = {
      ...scenario,
      timestamp: Date.now(),
      isoTime: new Date().toISOString(),
      sequence: scenarioIndex
    };

    ioInstance.emit('crisis:alert-tick', alertPayload);
  }, 6000);
}

export function stopCrisisTicker() {
  if (crisisIntervalId) {
    clearInterval(crisisIntervalId);
    crisisIntervalId = null;
  }
}

export function broadcastCrisisActivation(meta) {
  const crisisPayload = {
    active: true,
    activatedAt: meta?.activatedAt || Date.now(),
    activatedBy: meta?.activatedBy || 'Authorized Incident Commander',
    role: meta?.role || 'government',
    defcon: 'DEFCON 1 · MAXIMUM READINESS',
    reason: meta?.reason || 'State-level Emergency Crisis Protocol Triggered',
    currentScenario: meta?.currentScenario || CRISIS_SCENARIOS[0]
  };

  db.setCrisisState(crisisPayload);
  db.addAudit(
    `🚨 CODE RED CRISIS TRIGGERED by ${crisisPayload.activatedBy} (${crisisPayload.role.toUpperCase()})`,
    crisisPayload.activatedBy,
    'critical'
  );

  startCrisisTicker();

  if (ioInstance) {
    ioInstance.emit('crisis:activated', crisisPayload);
  }

  return crisisPayload;
}

export function broadcastCrisisStanddown(meta) {
  const standdownPayload = {
    active: false,
    stoodDownAt: Date.now(),
    stoodDownBy: meta?.stoodDownBy || meta?.activatedBy || 'Authorized Incident Commander',
    role: meta?.role || 'government',
    defcon: 'DEFCON 5 · NORMAL MONITORING'
  };

  db.setCrisisState(standdownPayload);
  db.addAudit(
    `🟢 EMERGENCY CRISIS STOOD DOWN by ${standdownPayload.stoodDownBy} (${standdownPayload.role.toUpperCase()})`,
    standdownPayload.stoodDownBy,
    'info'
  );

  stopCrisisTicker();

  if (ioInstance) {
    ioInstance.emit('crisis:standdown', standdownPayload);
  }

  return standdownPayload;
}

export function broadcastNewIncident(incident) {
  if (ioInstance) {
    ioInstance.emit('incident:new', incident);
  }
}

export function broadcastNewRequest(request) {
  if (ioInstance) {
    ioInstance.emit('request:new', request);
  }
}

export function broadcastNewAlert(alert) {
  if (ioInstance) {
    ioInstance.emit('alert:new', alert);
  }
}

export function getIO() {
  return ioInstance;
}
