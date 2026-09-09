import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, '../../data');
const DB_FILE = path.join(DATA_DIR, 'resq_store.json');

// Initial seed data mirroring National Disaster Response prototypes
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
    { id: 'INC-077', type: 'Flood', location: 'Pune • Mula-Mutha basin', severity: 'Critical', affected: '2,482', reports: 46, status: 'Active', reportedAt: new Date(Date.now() - 3600000).toISOString() },
    { id: 'INC-076', type: 'Landslide', location: 'Lonavala • Old Mumbai Rd', severity: 'High', affected: '218', reports: 18, status: 'Response', reportedAt: new Date(Date.now() - 7200000).toISOString() },
    { id: 'INC-075', type: 'Fire', location: 'Nashik • MIDC', severity: 'High', affected: '624', reports: 11, status: 'Containment', reportedAt: new Date(Date.now() - 14400000).toISOString() },
    { id: 'INC-074', type: 'Heatwave', location: 'Nagpur • Central zone', severity: 'Medium', affected: '5,870', reports: 92, status: 'Monitoring', reportedAt: new Date(Date.now() - 28800000).toISOString() }
  ],
  requests: [
    { id: 'RQ-1048', citizen: 'Asha K.', type: 'Medical', location: 'Kothrud', priority: 'Critical', status: 'Assigned', team: 'Red Cross Unit 03', time: '09:41', phone: '+91 98220 11223', createdAt: new Date(Date.now() - 1800000).toISOString() },
    { id: 'RQ-1047', citizen: 'Rohit M.', type: 'Food', location: 'Warje', priority: 'High', status: 'In transit', team: 'Seva Volunteers', time: '09:36', phone: '+91 98220 44556', createdAt: new Date(Date.now() - 2400000).toISOString() },
    { id: 'RQ-1046', citizen: 'Nikita P.', type: 'Evacuation', location: 'Dhayari', priority: 'High', status: 'Verified', team: 'Fire Response 2', time: '09:29', phone: '+91 98220 77889', createdAt: new Date(Date.now() - 3600000).toISOString() },
    { id: 'RQ-1045', citizen: 'Aman S.', type: 'Missing family', location: 'Sinhagad Rd', priority: 'Medium', status: 'Open', team: '—', time: '09:23', phone: '+91 98220 99001', createdAt: new Date(Date.now() - 4800000).toISOString() },
    { id: 'RQ-1044', citizen: 'Rhea T.', type: 'Water', location: 'Pashan', priority: 'Medium', status: 'Open', team: '—', time: '09:16', phone: '+91 98220 33445', createdAt: new Date(Date.now() - 6000000).toISOString() }
  ],
  alerts: [
    { id: 1, level: 'critical', title: 'Flash Flood Warning', region: 'Pune • Mula-Mutha basin', time: '2 min ago', body: 'Move to elevated ground and avoid river crossings. Emergency teams are on standby.', timestamp: new Date(Date.now() - 120000).toISOString() },
    { id: 2, level: 'warning', title: 'Heatwave Advisory', region: 'Vidarbha • Nagpur', time: '16 min ago', body: 'Stay hydrated and use designated cooling centres between 11:00 and 16:00.', timestamp: new Date(Date.now() - 960000).toISOString() },
    { id: 3, level: 'info', title: 'Community Kitchen Active', region: 'Satara • Camp 04', time: '28 min ago', body: 'Free meals available for displaced families. Bring your household token.', timestamp: new Date(Date.now() - 1680000).toISOString() },
    { id: 4, level: 'warning', title: 'Road Diversion', region: 'Kothrud • Karve Road', time: '42 min ago', body: 'Emergency lane reserved. Use alternate routes to keep rescue traffic moving.', timestamp: new Date(Date.now() - 2520000).toISOString() }
  ],
  shelters: [
    { id: 1, name: 'Shivaji Sports Complex', city: 'Pune', address: 'Pune, Maharashtra', capacity: 850, occupied: 642, services: ['Food', 'Medical', 'Childcare'], eta: '12 min', open: true },
    { id: 2, name: 'Bharati Vidyapeeth Hall', city: 'Pune', address: 'Katraj, Pune', capacity: 520, occupied: 301, services: ['Food', 'Power', 'Wi-Fi'], eta: '19 min', open: true },
    { id: 3, name: 'ZP School Relief Centre', city: 'Satara', address: 'Satara, Maharashtra', capacity: 340, occupied: 238, services: ['Food', 'Water', 'First Aid'], eta: '31 min', open: true },
    { id: 4, name: 'Nehru Stadium Transit Camp', city: 'Nagpur', address: 'Nagpur, Maharashtra', capacity: 1100, occupied: 924, services: ['Food', 'Medical', 'Charging'], eta: '44 min', open: true },
    { id: 5, name: 'Aundh Community Hall', city: 'Pune', address: 'Aundh, Pune', capacity: 430, occupied: 176, services: ['Water', 'Childcare', 'Charging'], eta: '23 min', open: true }
  ],
  campaigns: [
    { id: 1, name: 'Monsoon Ready Maharashtra', org: 'State Disaster Management Authority', tag: 'Preparedness', reach: '2.4M', status: 'Live', location: 'Pune District', copy: 'Know your nearest shelter, pack a go-bag, save 112.' },
    { id: 2, name: 'Safe Roads, Safe Rescue', org: 'Pune Municipal Response Cell', tag: 'Traffic', reach: '760K', status: 'Live', location: 'Pune City', copy: 'Leave rescue lanes clear for ambulances and fire response.' },
    { id: 3, name: 'Every Hand Helps', org: 'Seva Collective NGO Network', tag: 'Volunteering', reach: '390K', status: 'Recruiting', location: 'Pune • Satara', copy: 'Register skills for logistics, first aid, food distribution and translation.' },
    { id: 4, name: 'Family Reunification Drive', org: 'District Relief Office', tag: 'Relief', reach: '120K', status: 'Live', location: 'Maharashtra', copy: 'Use verified helplines and shelter desks to reconnect separated families.' },
    { id: 5, name: 'First Aid Fast Track', org: 'Red Cross Unit', tag: 'Medical', reach: '210K', status: 'Recruiting', location: 'Pune • Pimpri-Chinchwad', copy: 'Learn bleeding control, CPR basics and emergency triage.' },
    { id: 6, name: 'Heatwave Community Cooling', org: 'Nagpur Smart Response', tag: 'Health', reach: '580K', status: 'Live', location: 'Nagpur', copy: 'Open cooling rooms and hydration points for at-risk residents.' }
  ],
  volunteers: [
    { id: 'VOL-331', name: 'Meera P.', skill: 'First Aid', area: 'Pune', status: 'Available', missions: 18 },
    { id: 'VOL-284', name: 'Arjun S.', skill: 'Logistics', area: 'Satara', status: 'On mission', missions: 31 },
    { id: 'VOL-198', name: 'Sara K.', skill: 'Translation', area: 'Pune', status: 'Available', missions: 11 },
    { id: 'VOL-412', name: 'Kabir R.', skill: 'Driving', area: 'Pune', status: 'On mission', missions: 24 }
  ],
  audits: [
    { id: 'aud-1', time: '12:42', actor: 'Officer #024', action: 'broadcast Flood Alert', severity: 'high', timestamp: new Date(Date.now() - 3600000).toISOString() },
    { id: 'aud-2', time: '12:35', actor: 'NGO #018', action: 'accepted Request #RQ-1048', severity: 'info', timestamp: new Date(Date.now() - 4200000).toISOString() },
    { id: 'aud-3', time: '12:31', actor: 'Admin #001', action: 'updated shelter capacity', severity: 'info', timestamp: new Date(Date.now() - 4800000).toISOString() },
    { id: 'aud-4', time: '12:20', actor: 'Citizen #781', action: 'reported flood incident', severity: 'medium', timestamp: new Date(Date.now() - 5400000).toISOString() },
    { id: 'aud-5', time: '12:11', actor: 'Officer #024', action: 'verified Request #RQ-1046', severity: 'info', timestamp: new Date(Date.now() - 6000000).toISOString() }
  ],
  users: []
};

class JSONStore {
  constructor() {
    this.memoryCache = null;
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
      this.persist();
      console.log('📦 Database initialized with seeds at:', DB_FILE);
    } else {
      try {
        const raw = fs.readFileSync(DB_FILE, 'utf8');
        this.memoryCache = JSON.parse(raw);
        // Ensure all collections exist
        for (const [key, value] of Object.entries(INITIAL_SEEDS)) {
          if (this.memoryCache[key] === undefined) {
            this.memoryCache[key] = JSON.parse(JSON.stringify(value));
          }
        }
      } catch (err) {
        console.error('⚠️ Error reading database file, repairing with default seeds:', err);
        this.memoryCache = JSON.parse(JSON.stringify(INITIAL_SEEDS));
        this.persist();
      }
    }
  }

  persist() {
    try {
      const tempPath = `${DB_FILE}.${Date.now()}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(this.memoryCache, null, 2), 'utf8');
      fs.renameSync(tempPath, DB_FILE);
    } catch (err) {
      console.error('❌ Failed to persist database:', err);
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

  addAudit(action, actor = 'System', severity = 'info') {
    const record = {
      id: `aud-${Date.now()}`,
      time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
      actor,
      action,
      severity,
      timestamp: new Date().toISOString()
    };
    this.getCollection('audits').unshift(record);
    if (this.memoryCache.audits.length > 200) {
      this.memoryCache.audits = this.memoryCache.audits.slice(0, 200);
    }
    this.persist();
    return record;
  }
}

export const db = new JSONStore();
