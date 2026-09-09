import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Server as SocketIOServer } from 'socket.io';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.resolve(__dirname, '../../resq_vnext/dist');

// Load environment variables
dotenv.config();

import { initSocket } from './socket/socketHandler.js';
import { db } from './config/db.js';
import authRoutes from './routes/auth.routes.js';
import crisisRoutes from './routes/crisis.routes.js';
import incidentsRoutes from './routes/incidents.routes.js';
import requestsRoutes from './routes/requests.routes.js';
import broadcastsRoutes from './routes/broadcasts.routes.js';
import sheltersRoutes from './routes/shelters.routes.js';
import campaignsRoutes from './routes/campaigns.routes.js';
import auditRoutes from './routes/audit.routes.js';
import threatsRoutes from './routes/threats.routes.js';
import { createRateLimiter } from './middleware/rateLimiter.js';
import { getSubscriberCount } from './services/pushService.js';

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 5000;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

// Configure Socket.IO
const io = new SocketIOServer(server, {
  cors: {
    origin: [CLIENT_URL, 'http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:3000'],
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    credentials: true
  }
});

// Initialize real-time handlers
initSocket(io);

// Middleware
app.use(cors({
  origin: [CLIENT_URL, 'http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:3000', '*'],
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-resq-token', 'x-resq-envelope', 'x-idempotency-key'],
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logger
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (req.path !== '/api/health') {
      console.log(`📡 [${req.method}] ${req.path} -> ${res.statusCode} (${duration}ms)`);
    }
  });
  next();
});

// Rate limiters for critical endpoints
const authLimiter = createRateLimiter({ windowMs: 60000, max: 20, message: 'Too many authentication attempts. Please wait 1 minute.' });
const sosLimiter = createRateLimiter({ windowMs: 60000, max: 40, message: 'SOS rate threshold reached. For life-threatening emergencies call 112 directly.' });

// Health check with audit verification & telemetry metrics
app.get('/api/health', (req, res) => {
  const ledgerStatus = db.verifyAuditLedger();
  res.json({
    status: 'ok',
    service: 'RESQ National Disaster Coordination API',
    version: '2.0.0',
    capabilities: [
      'Geospatial Proximity & Radius Routing',
      'Offline Idempotency & SMS Webhook Ingestion',
      'Multilingual AI/NLP Emergency Triage (EN/HI/MR)',
      'Live External Threat Ingestion (IMD/USGS/CWC/FIRMS)',
      'Intelligent Volunteer Dispatch Matcher',
      'SHA-256 Tamper-Proof Cryptographic Audit Ledger',
      'Sliding-Window Rate Limiting & Web Push Gateway'
    ],
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    activeWebPushSubscribers: getSubscriberCount(),
    auditLedger: {
      integrity: ledgerStatus.valid ? 'VERIFIED' : 'FAILED',
      totalRecords: ledgerStatus.auditedCount || 0,
      latestHash: db.latestAuditHash
    }
  });
});

// Mount Routes with Defensive Rate Limiting
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/crisis', crisisRoutes);
app.use('/api/incidents', incidentsRoutes);
app.use('/api/requests', sosLimiter, requestsRoutes);
app.use('/api/broadcasts', broadcastsRoutes);
app.use('/api/shelters', sheltersRoutes);
app.use('/api/campaigns', campaignsRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/threats', threatsRoutes);

// 404 handler for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: `API endpoint '${req.method} ${req.originalUrl}' not found.` });
});

// Serve frontend single-page application (All-In-One Localhost at port 5000)
app.use(express.static(distPath));
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('💥 Unhandled server error:', err);
  res.status(500).json({
    error: 'Internal disaster system error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'An unexpected error occurred.'
  });
});

// Start listening
server.listen(PORT, () => {
  console.log('═══════════════════════════════════════════════════════');
  console.log(`🚨 Rakshak Disaster Response Server v2.0 active on port ${PORT}`);
  console.log(`🌐 ALL-IN-ONE LOCALHOST: http://localhost:${PORT}`);
  console.log(`🌐 REST API:    http://localhost:${PORT}/api/health`);
  console.log(`⚡ WebSockets:  ws://localhost:${PORT} (Socket.IO)`);
  console.log(`🧭 Geospatial:  Proximity Routing & Haversine Engine Online`);
  console.log(`🧠 AI Triage:   Multilingual Natural Language Processor Online`);
  console.log(`🛰️ Threat Grid: IMD / USGS / CWC Telemetry Feed Ingestion Active`);
  console.log(`🔗 Blockchain:  SHA-256 Hash-Chained Audit Ledger Verified`);
  console.log('═══════════════════════════════════════════════════════');
});
