import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, '../../data');
const DB_FILE = path.join(DATA_DIR, 'resq_store.json');

// Initial seed data with GPS coordinates and disaster response metadata
const INITIAL_SEEDS = {
  crisisState: {
    active: false,
    defcon: 'DEFCON 5 · NORMAL MONITORING',
    activatedAt: null,
    activatedBy: null,
    role: null,
    reason: null,
    currentScenario: null
  },
  incidents: [
    {
      id: 'INC-077',
      type: 'Flood',
      district: 'Pune',
      taluka: 'Haveli',
      location: 'Pune • Mula-Mutha basin',
      coordinates: { lat: 18.5312, lng: 73.8553 },
      severity: 'Critical',
      affected: '2,482',
      reports: 46,
      status: 'Active',
      reportedAt: new Date(Date.now() - 3600000).toISOString()
    },
    {
      id: 'INC-076',
      type: 'Landslide',
      district: 'Pune',
      taluka: 'Maval',
      location: 'Lonavala • Old Mumbai Rd',
      coordinates: { lat: 18.7546, lng: 73.4062 },
      severity: 'High',
      affected: '218',
      reports: 18,
      status: 'Response',
      reportedAt: new Date(Date.now() - 7200000).toISOString()
    },
    {
      id: 'INC-080',
      type: 'Coastal Surge',
      district: 'Mumbai City',
      taluka: 'Worli',
      location: 'Worli Seaface • Marine Inundation',
      coordinates: { lat: 19.0166, lng: 72.8169 },
      severity: 'Critical',
      affected: '3,120',
      reports: 58,
      status: 'Active',
      reportedAt: new Date(Date.now() - 1800000).toISOString()
    },
    {
      id: 'INC-081',
      type: 'Waterlogging',
      district: 'Mumbai Suburban',
      taluka: 'Kurla',
      location: 'Kurla • Mithi River Overflow',
      coordinates: { lat: 19.0726, lng: 72.8845 },
      severity: 'High',
      affected: '1,450',
      reports: 34,
      status: 'Response',
      reportedAt: new Date(Date.now() - 5400000).toISOString()
    },
    {
      id: 'INC-075',
      type: 'Fire',
      district: 'Nashik',
      taluka: 'Nashik',
      location: 'Nashik • MIDC Industrial Zone',
      coordinates: { lat: 19.9975, lng: 73.7898 },
      severity: 'High',
      affected: '624',
      reports: 11,
      status: 'Containment',
      reportedAt: new Date(Date.now() - 14400000).toISOString()
    },
    {
      id: 'INC-074',
      type: 'Heatwave',
      district: 'Nagpur',
      taluka: 'Nagpur Urban',
      location: 'Nagpur • Central zone',
      coordinates: { lat: 21.1458, lng: 79.0882 },
      severity: 'Medium',
      affected: '5,870',
      reports: 92,
      status: 'Monitoring',
      reportedAt: new Date(Date.now() - 28800000).toISOString()
    },
    {
      id: 'INC-079',
      type: 'Landslide',
      district: 'Satara',
      taluka: 'Wai',
      location: 'Wai-Pasarni Ghat Corridor',
      coordinates: { lat: 17.9480, lng: 73.8920 },
      severity: 'Critical',
      affected: '340',
      reports: 14,
      status: 'Active',
      reportedAt: new Date(Date.now() - 900000).toISOString()
    }
  ],
  requests: [
    {
      id: 'RQ-1048',
      citizen: 'Asha K.',
      type: 'Medical',
      location: 'Kothrud',
      coordinates: { lat: 18.5074, lng: 73.8077 },
      priority: 'Critical',
      status: 'Assigned',
      team: 'Red Cross Unit 03',
      time: '09:41',
      phone: '+91 98220 11223',
      triage: { urgency: 'Critical', tags: ['Cardiac-Risk', 'Oxygen-Required'], estimatedPersons: 1 },
      createdAt: new Date(Date.now() - 1800000).toISOString()
    },
    {
      id: 'RQ-1047',
      citizen: 'Rohit M.',
      type: 'Food',
      location: 'Warje',
      coordinates: { lat: 18.4795, lng: 73.8005 },
      priority: 'High',
      status: 'In transit',
      team: 'Seva Volunteers',
      time: '09:36',
      phone: '+91 98220 44556',
      triage: { urgency: 'High', tags: ['Ration-Kit', 'Children-4'], estimatedPersons: 5 },
      createdAt: new Date(Date.now() - 2400000).toISOString()
    },
    {
      id: 'RQ-1046',
      citizen: 'Nikita P.',
      type: 'Evacuation',
      location: 'Dhayari',
      coordinates: { lat: 18.4485, lng: 73.8062 },
      priority: 'High',
      status: 'Verified',
      team: 'Fire Response 2',
      time: '09:29',
      phone: '+91 98220 77889',
      triage: { urgency: 'High', tags: ['Flood-Rooftop', 'Boat-Needed'], estimatedPersons: 3 },
      createdAt: new Date(Date.now() - 3600000).toISOString()
    },
    {
      id: 'RQ-1045',
      citizen: 'Aman S.',
      type: 'Missing family',
      location: 'Sinhagad Rd',
      coordinates: { lat: 18.4900, lng: 73.8200 },
      priority: 'Medium',
      status: 'Open',
      team: '—',
      time: '09:23',
      phone: '+91 98220 99001',
      triage: { urgency: 'Medium', tags: ['Reunification'], estimatedPersons: 2 },
      createdAt: new Date(Date.now() - 4800000).toISOString()
    },
    {
      id: 'RQ-1044',
      citizen: 'Rhea T.',
      type: 'Water',
      location: 'Pashan',
      coordinates: { lat: 18.5412, lng: 73.7929 },
      priority: 'Medium',
      status: 'Open',
      team: '—',
      time: '09:16',
      phone: '+91 98220 33445',
      triage: { urgency: 'Medium', tags: ['Potable-Water'], estimatedPersons: 4 },
      createdAt: new Date(Date.now() - 6000000).toISOString()
    }
  ],
  alerts: [
    { id: 1, level: 'critical', title: 'Flash Flood Warning', region: 'Pune • Mula-Mutha basin', time: '2 min ago', body: 'Move to elevated ground and avoid river crossings. Emergency teams are on standby.', timestamp: new Date(Date.now() - 120000).toISOString() },
    { id: 2, level: 'warning', title: 'Heatwave Advisory', region: 'Vidarbha • Nagpur', time: '16 min ago', body: 'Stay hydrated and use designated cooling centres between 11:00 and 16:00.', timestamp: new Date(Date.now() - 960000).toISOString() },
    { id: 3, level: 'info', title: 'Community Kitchen Active', region: 'Satara • Camp 04', time: '28 min ago', body: 'Free meals available for displaced families. Bring your household token.', timestamp: new Date(Date.now() - 1680000).toISOString() },
    { id: 4, level: 'warning', title: 'Road Diversion', region: 'Kothrud • Karve Road', time: '42 min ago', body: 'Emergency lane reserved. Use alternate routes to keep rescue traffic moving.', timestamp: new Date(Date.now() - 2520000).toISOString() }
  ],
  shelters: [
    // Pune District Shelters
    { id: 1, name: 'Shivaji Sports Complex', district: 'Pune', taluka: 'Haveli', city: 'Pune City (Shivaji Nagar)', address: 'Shivaji Nagar, Pune', coordinates: { lat: 18.5314, lng: 73.8446 }, capacity: 850, occupied: 642, services: ['Food', 'Medical', 'Childcare', 'Bedding'], eta: '4 min', open: true },
    { id: 2, name: 'Bharati Vidyapeeth Hall', district: 'Pune', taluka: 'Haveli', city: 'Katraj', address: 'Katraj, Pune', coordinates: { lat: 18.4575, lng: 73.8508 }, capacity: 520, occupied: 301, services: ['Food', 'Power', 'Wi-Fi', 'First Aid'], eta: '14 min', open: true },
    { id: 5, name: 'Aundh Community Hall', district: 'Pune', taluka: 'Haveli', city: 'Aundh', address: 'Aundh, Pune', coordinates: { lat: 18.5590, lng: 73.8070 }, capacity: 430, occupied: 176, services: ['Water', 'Childcare', 'Charging'], eta: '13 min', open: true },
    { id: 7, name: 'Kothrud Sub-District Center', district: 'Pune', taluka: 'Haveli', city: 'Kothrud', address: 'Paud Road, Kothrud', coordinates: { lat: 18.5074, lng: 73.8077 }, capacity: 600, occupied: 290, services: ['Food', 'Medical', 'Power'], eta: '6 min', open: true },
    { id: 8, name: 'Lonavala Municipal Relief Camp', district: 'Pune', taluka: 'Maval', city: 'Lonavala', address: 'Old Mumbai-Pune Rd, Lonavala', coordinates: { lat: 18.7546, lng: 73.4062 }, capacity: 450, occupied: 190, services: ['Food', 'Blankets', 'Rescue Ops'], eta: '28 min', open: true },

    // Mumbai City & Suburban Shelters
    { id: 10, name: 'NSCI Dome Evacuation Center', district: 'Mumbai City', taluka: 'Worli', city: 'Worli', address: 'Worli Seaface, Mumbai', coordinates: { lat: 19.0166, lng: 72.8169 }, capacity: 1200, occupied: 480, services: ['Food', 'Medical', 'ICU Beds', 'Wi-Fi'], eta: '8 min', open: true },
    { id: 11, name: 'Andheri Sports Complex Relief Hub', district: 'Mumbai Suburban', taluka: 'Andheri', city: 'Andheri West', address: 'Veera Desai Rd, Andheri W', coordinates: { lat: 19.1136, lng: 72.8697 }, capacity: 950, occupied: 510, services: ['Food', 'Charging', 'Childcare'], eta: '11 min', open: true },
    { id: 12, name: 'Dadar Swatantryaveer Relief Hall', district: 'Mumbai City', taluka: 'Dadar', city: 'Dadar', address: 'Dadar West, Mumbai', coordinates: { lat: 19.0178, lng: 72.8478 }, capacity: 580, occupied: 320, services: ['Food', 'First Aid', 'Water'], eta: '14 min', open: true },
    { id: 13, name: 'BKC Relief Pavilion', district: 'Mumbai Suburban', taluka: 'Andheri', city: 'Bandra / BKC', address: 'Bandra Kurla Complex, Mumbai', coordinates: { lat: 19.0596, lng: 72.8295 }, capacity: 1400, occupied: 630, services: ['Food', 'Medical', 'Childcare'], eta: '12 min', open: true },

    // Thane District Shelters
    { id: 14, name: 'Dadoji Kondadev Stadium Relief Camp', district: 'Thane', taluka: 'Thane', city: 'Thane City', address: 'Thane West', coordinates: { lat: 19.2183, lng: 72.9781 }, capacity: 800, occupied: 410, services: ['Food', 'Water', 'Medical'], eta: '10 min', open: true },
    { id: 15, name: 'Vashi Sports Relief Arena', district: 'Thane', taluka: 'Thane', city: 'Navi Mumbai (Vashi)', address: 'Sector 9, Vashi, Navi Mumbai', coordinates: { lat: 19.0771, lng: 72.9986 }, capacity: 750, occupied: 290, services: ['Food', 'Charging', 'Sanitation'], eta: '15 min', open: true },

    // Nagpur District Shelters
    { id: 4, name: 'Nehru Stadium Transit Camp', district: 'Nagpur', taluka: 'Nagpur Urban', city: 'Nagpur City (Civil Lines)', address: 'Civil Lines, Nagpur', coordinates: { lat: 21.1458, lng: 79.0882 }, capacity: 1100, occupied: 620, services: ['Food', 'Medical', 'Charging', 'Cooling Rooms'], eta: '12 min', open: true },
    { id: 16, name: 'Mankapur Sports Relief Hub', district: 'Nagpur', taluka: 'Nagpur Urban', city: 'Nagpur City', address: 'Koradi Rd, Mankapur, Nagpur', coordinates: { lat: 21.1850, lng: 79.0750 }, capacity: 900, occupied: 340, services: ['Food', 'First Aid', 'Cooling System'], eta: '16 min', open: true },

    // Nashik District Shelters
    { id: 17, name: 'Golf Club Ground Emergency Center', district: 'Nashik', taluka: 'Nashik', city: 'Nashik City (CIDCO)', address: 'Old Agra Rd, Nashik', coordinates: { lat: 19.9975, lng: 73.7898 }, capacity: 700, occupied: 310, services: ['Food', 'Water', 'Power'], eta: '9 min', open: true },
    { id: 18, name: 'Igatpuri Ghat Safety Center', district: 'Nashik', taluka: 'Igatpuri', city: 'Igatpuri', address: 'Highway Corridor, Igatpuri', coordinates: { lat: 19.6967, lng: 73.5639 }, capacity: 480, occupied: 180, services: ['Food', 'Warm Blankets', 'Triage'], eta: '24 min', open: true },

    // Satara District Shelters
    { id: 3, name: 'ZP School Relief Centre', district: 'Satara', taluka: 'Satara', city: 'Satara City', address: 'Satara Main Road, Satara', coordinates: { lat: 17.6805, lng: 74.0183 }, capacity: 340, occupied: 210, services: ['Food', 'Water', 'First Aid'], eta: '15 min', open: true },
    { id: 19, name: 'Karad Municipal Hall Relief Camp', district: 'Satara', taluka: 'Karad', city: 'Karad', address: 'Karad City, Satara', coordinates: { lat: 17.2889, lng: 74.1833 }, capacity: 520, occupied: 280, services: ['Food', 'Medical', 'Bedding'], eta: '20 min', open: true },
    { id: 20, name: 'Mahabaleshwar Emergency Staging Base', district: 'Satara', taluka: 'Mahabaleshwar', city: 'Mahabaleshwar', address: 'Panchgani Road, Mahabaleshwar', coordinates: { lat: 17.9237, lng: 73.6586 }, capacity: 380, occupied: 140, services: ['Food', 'Triage', 'Rescue Team Staging'], eta: '22 min', open: true }
  ],
  campaigns: [
    // Pune Campaigns
    { id: 1, name: 'Monsoon Ready Maharashtra', org: 'State Disaster Management Authority', tag: 'Preparedness', reach: '2.4M', status: 'Live', district: 'Pune', taluka: 'Haveli', location: 'Pune District', copy: 'Know your nearest shelter, pack a go-bag, save 112.' },
    { id: 2, name: 'Safe Roads, Safe Rescue', org: 'Pune Municipal Response Cell', tag: 'Traffic', reach: '760K', status: 'Live', district: 'Pune', taluka: 'Haveli', location: 'Pune City', copy: 'Leave rescue lanes clear for ambulances and fire response.' },
    { id: 3, name: 'Every Hand Helps', org: 'Seva Collective NGO Network', tag: 'Volunteering', reach: '390K', status: 'Recruiting', district: 'Pune', taluka: 'Haveli', location: 'Pune • Satara', copy: 'Register skills for logistics, first aid, food distribution and translation.' },
    { id: 5, name: 'First Aid Fast Track', org: 'Red Cross Unit', tag: 'Medical', reach: '210K', status: 'Recruiting', district: 'Pune', taluka: 'Haveli', location: 'Pune • Pimpri-Chinchwad', copy: 'Learn bleeding control, CPR basics and emergency triage.' },

    // Mumbai Campaigns
    { id: 7, name: 'Mumbai Coastal Surge Preparedness', org: 'MCGM Disaster Cell', tag: 'Preparedness', reach: '3.8M', status: 'Live', district: 'Mumbai City', taluka: 'Colaba', location: 'Mumbai Coast', copy: 'High-tide evacuation procedures, seawall alerts and emergency shelter maps.' },
    { id: 8, name: 'Monsoon Metro Lifeline Protocol', org: 'Mumbai Urban Transport Authority', tag: 'Transit', reach: '1.9M', status: 'Live', district: 'Mumbai Suburban', taluka: 'Andheri', location: 'Mumbai Suburban', copy: 'Alternate dry transit lanes and pumping station status.' },

    // Nagpur Campaigns
    { id: 6, name: 'Heatwave Community Cooling', org: 'Nagpur Smart Response', tag: 'Health', reach: '580K', status: 'Live', district: 'Nagpur', taluka: 'Nagpur Urban', location: 'Nagpur', copy: 'Open cooling rooms and hydration points for at-risk residents.' },

    // Satara Campaigns
    { id: 9, name: 'Western Ghats Landslide Watch', org: 'Satara DDMA Relief Cell', tag: 'Warning', reach: '180K', status: 'Live', district: 'Satara', taluka: 'Wai', location: 'Satara • Mahabaleshwar', copy: 'Continuous geological monitoring of hillside villages and ghat roads.' },

    // National Campaign
    { id: 4, name: 'Family Reunification Drive', org: 'District Relief Office', tag: 'Relief', reach: '120K', status: 'Live', district: 'All', taluka: 'All', location: 'Maharashtra & National', copy: 'Use verified helplines and shelter desks to reconnect separated families.' }
  ],
  volunteers: [
    { id: 'VOL-331', name: 'Meera P.', skill: 'First Aid', area: 'Pune', coordinates: { lat: 18.5204, lng: 73.8567 }, status: 'Available', missions: 18 },
    { id: 'VOL-284', name: 'Arjun S.', skill: 'Logistics', area: 'Satara', coordinates: { lat: 17.6805, lng: 74.0183 }, status: 'On mission', missions: 31 },
    { id: 'VOL-198', name: 'Sara K.', skill: 'Translation', area: 'Pune', coordinates: { lat: 18.5314, lng: 73.8446 }, status: 'Available', missions: 11 },
    { id: 'VOL-412', name: 'Kabir R.', skill: 'Boat / Driving', area: 'Pune', coordinates: { lat: 18.5074, lng: 73.8077 }, status: 'Available', missions: 24 }
  ],
  audits: [],
  idempotencyKeys: {},
  users: []
};

class JSONStore {
  constructor() {
    this.memoryCache = null;
    this.isPersisting = false;
    this.persistQueued = false;
    this.latestAuditHash = '0000000000000000000000000000000000000000000000000000000000000000';
    this.ensureDataDir();
    this.init();
  }

  ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  init() {
    if (!fs.existsSync(DB_FILE)) {
      this.memoryCache = JSON.parse(JSON.stringify(INITIAL_SEEDS));
      this.seedInitialAudits();
      this.persistSync();
      console.log('📦 Database initialized with seeds at:', DB_FILE);
    } else {
      try {
        const raw = fs.readFileSync(DB_FILE, 'utf8');
        this.memoryCache = JSON.parse(raw);
        for (const [key, value] of Object.entries(INITIAL_SEEDS)) {
          if (this.memoryCache[key] === undefined) {
            this.memoryCache[key] = JSON.parse(JSON.stringify(value));
          }
        }
        // Upgrade existing seeds if coordinates are missing
        if (this.memoryCache.shelters && (!this.memoryCache.shelters[0] || !this.memoryCache.shelters[0].coordinates)) {
          this.memoryCache.shelters = JSON.parse(JSON.stringify(INITIAL_SEEDS.shelters));
          this.memoryCache.incidents = JSON.parse(JSON.stringify(INITIAL_SEEDS.incidents));
          this.memoryCache.requests = JSON.parse(JSON.stringify(INITIAL_SEEDS.requests));
          this.memoryCache.volunteers = JSON.parse(JSON.stringify(INITIAL_SEEDS.volunteers));
        }
        
        // Ensure all audits in memoryCache are cryptographically chained
        const auditList = this.memoryCache.audits || [];
        if (auditList.length === 0) {
          this.seedInitialAudits();
        } else {
          let prevHash = '0000000000000000000000000000000000000000000000000000000000000000';
          const chronological = [...auditList].reverse();
          for (let i = 0; i < chronological.length; i++) {
            const item = chronological[i];
            item.previousHash = prevHash;
            const raw = `${prevHash}|${item.timestamp}|${item.actor}|${item.action}|${item.severity}`;
            item.hash = crypto.createHash('sha256').update(raw).digest('hex');
            prevHash = item.hash;
          }
          this.latestAuditHash = prevHash;
          this.memoryCache.audits = chronological.reverse();
          this.persistSync();
        }
      } catch (err) {
        console.error('⚠️ Error reading database file, repairing with default seeds:', err);
        this.memoryCache = JSON.parse(JSON.stringify(INITIAL_SEEDS));
        this.seedInitialAudits();
        this.persistSync();
      }
    }
  }

  seedInitialAudits() {
    this.memoryCache.audits = [];
    this.addAudit('System audit ledger initialized with SHA-256 cryptographic chain', 'Genesis Engine', 'info');
    this.addAudit('Officer #024 broadcast Flood Alert (Mula-Mutha Basin)', 'Officer #024', 'high');
    this.addAudit('NGO Seva accepted Request #RQ-1048 for medical dispatch', 'NGO #018', 'info');
    this.addAudit('Admin #001 updated shelter capacity at Shivaji Sports Complex', 'Admin #001', 'info');
  }

  // Non-blocking, debounced, concurrency-safe persistence
  persist() {
    if (this.isPersisting) {
      this.persistQueued = true;
      return;
    }
    this.isPersisting = true;

    setImmediate(() => {
      try {
        const tempPath = `${DB_FILE}.${Date.now()}.${Math.random().toString(36).slice(2, 6)}.tmp`;
        fs.writeFileSync(tempPath, JSON.stringify(this.memoryCache, null, 2), 'utf8');
        fs.renameSync(tempPath, DB_FILE);
      } catch (err) {
        console.error('❌ Failed to persist database:', err);
      } finally {
        this.isPersisting = false;
        if (this.persistQueued) {
          this.persistQueued = false;
          this.persist();
        }
      }
    });
  }

  persistSync() {
    try {
      const tempPath = `${DB_FILE}.${Date.now()}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(this.memoryCache, null, 2), 'utf8');
      fs.renameSync(tempPath, DB_FILE);
    } catch (err) {
      console.error('❌ Failed to persist database synchronously:', err);
    }
  }

  getCollection(name) {
    if (!this.memoryCache[name]) {
      this.memoryCache[name] = [];
      this.persist();
    }
    return this.memoryCache[name];
  }

  find(name, predicate) {
    const list = this.getCollection(name);
    return typeof predicate === 'function' ? list.filter(predicate) : list;
  }

  findById(name, id) {
    const list = this.getCollection(name);
    return list.find(item => String(item.id) === String(id)) || null;
  }

  insert(name, item) {
    const list = this.getCollection(name);
    const id = item.id || `${name.slice(0, 3).toUpperCase()}-${Date.now().toString().slice(-4)}`;
    const record = { ...item, id, createdAt: item.createdAt || new Date().toISOString() };
    list.unshift(record);
    this.persist();
    return record;
  }

  update(name, id, updates) {
    const list = this.getCollection(name);
    const index = list.findIndex(item => String(item.id) === String(id));
    if (index === -1) return null;
    const updated = { ...list[index], ...updates, updatedAt: new Date().toISOString() };
    list[index] = updated;
    this.persist();
    return updated;
  }

  delete(name, id) {
    const list = this.getCollection(name);
    const index = list.findIndex(item => String(item.id) === String(id));
    if (index === -1) return false;
    list.splice(index, 1);
    this.persist();
    return true;
  }

  getCrisisState() {
    return this.memoryCache.crisisState || INITIAL_SEEDS.crisisState;
  }

  setCrisisState(state) {
    this.memoryCache.crisisState = {
      ...this.memoryCache.crisisState,
      ...state,
      updatedAt: new Date().toISOString()
    };
    this.persist();
    return this.memoryCache.crisisState;
  }

  // Idempotency check for offline/intermittent network resubmissions
  hasIdempotencyKey(key) {
    if (!key) return null;
    return this.memoryCache.idempotencyKeys?.[key] || null;
  }

  recordIdempotencyKey(key, responseData) {
    if (!key) return;
    if (!this.memoryCache.idempotencyKeys) {
      this.memoryCache.idempotencyKeys = {};
    }
    this.memoryCache.idempotencyKeys[key] = {
      data: responseData,
      recordedAt: Date.now()
    };
    this.persist();
  }

  // Cryptographic SHA-256 hash-chained audit logging
  addAudit(action, actor = 'System', severity = 'info') {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    const timestamp = now.toISOString();

    const previousHash = this.latestAuditHash;
    const rawPayload = `${previousHash}|${timestamp}|${actor}|${action}|${severity}`;
    const hash = crypto.createHash('sha256').update(rawPayload).digest('hex');

    const record = {
      id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      time: timeStr,
      actor,
      action,
      severity,
      timestamp,
      previousHash,
      hash
    };

    this.latestAuditHash = hash;
    this.getCollection('audits').unshift(record);

    if (this.memoryCache.audits.length > 300) {
      this.memoryCache.audits = this.memoryCache.audits.slice(0, 300);
    }

    this.persist();
    return record;
  }

  // Mathematically verifies the cryptographic integrity of the entire audit chain
  verifyAuditLedger() {
    const audits = [...this.getCollection('audits')].reverse(); // Verify from genesis forward
    if (audits.length === 0) {
      return { valid: true, auditedCount: 0, status: 'EMPTY_LEDGER' };
    }

    for (let i = 0; i < audits.length; i++) {
      const entry = audits[i];
      const prevHash = i === 0 ? '0000000000000000000000000000000000000000000000000000000000000000' : audits[i - 1].hash;

      const expectedRaw = `${prevHash}|${entry.timestamp}|${entry.actor}|${entry.action}|${entry.severity}`;
      const calculatedHash = crypto.createHash('sha256').update(expectedRaw).digest('hex');

      if (entry.hash !== calculatedHash || entry.previousHash !== prevHash) {
        return {
          valid: false,
          corruptedBlockId: entry.id,
          expectedHash: calculatedHash,
          foundHash: entry.hash,
          status: 'TAMPER_DETECTED'
        };
      }
    }

    return {
      valid: true,
      auditedCount: audits.length,
      latestHash: this.latestAuditHash,
      status: 'VERIFIED_CRYPTOGRAPHIC_INTEGRITY'
    };
  }
}

export const db = new JSONStore();
