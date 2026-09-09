import React, { createContext, useContext, useMemo, useState } from 'react';
import { api, getSocket } from '../lib/apiClient';

export const roles = {
  citizen: {
    label: 'Citizen', accent: 'aqua',
    permissions: ['view_alerts','request_help','track_request','view_campaigns','view_shelters','report_incident','family_safety','interface_preferences'],
    nav: [
      ['Dashboard','/dashboard','home'], ['Emergency Help','/help','sos'], ['Report Incident','/incident','flag'],
      ['Alerts','/alerts','bell'], ['Campaigns','/campaigns','megaphone'], ['Shelters','/shelters','shelter'], ['Family Safety','/family','family'], ['Interface Preferences','/settings','settings']
    ]
  },
  ngo: {
    label: 'NGO / Volunteer', accent: 'amber',
    permissions: ['view_alerts','view_campaigns','offer_help','manage_tasks','view_shelters','view_assigned_help','update_missions','interface_preferences'],
    nav: [
      ['Volunteer Dashboard','/dashboard','home'], ['Response Tasks','/requests','tasks'], ['My Missions','/missions','mission'],
      ['Alerts','/alerts','bell'], ['Campaigns','/campaigns','megaphone'], ['Shelters','/shelters','shelter'], ['My Impact','/impact','impact'], ['Interface Preferences','/settings','settings']
    ]
  },
  government: {
    label: 'Government Officer', accent: 'emerald',
    permissions: ['view_alerts','broadcast_alert','verify_requests','view_shelters','manage_shelters','view_campaigns','manage_campaigns','view_reports','manage_incidents','view_live_map','manage_ngos','interface_preferences'],
    nav: [
      ['Command Dashboard','/dashboard','home'], ['Live Incidents','/incidents','incident'], ['Requests','/requests','tasks'], ['Broadcast Alerts','/broadcast','megaphone'], ['Broadcast History','/broadcast-history','audit'],
      ['Campaigns','/campaigns','campaign'], ['Shelter Network','/shelters','shelter'], ['NGO Coordination','/ngo-coordination','ngo'], ['Analytics','/analytics','chart'], ['Interface Preferences','/settings','settings']
    ]
  },
  admin: {
    label: 'System Admin', accent: 'violet',
    permissions: ['view_alerts','broadcast_alert','verify_requests','view_shelters','manage_shelters','view_campaigns','manage_campaigns','manage_users','view_reports','system_settings','audit_logs','manage_roles','interface_preferences'],
    nav: [
      ['Admin Dashboard','/dashboard','home'], ['Users','/users','users'], ['Roles & Permissions','/permissions','shield'], ['Requests','/requests','tasks'],
      ['Alerts','/alerts','bell'], ['Broadcast Alerts','/broadcast','megaphone'], ['Broadcast History','/broadcast-history','audit'], ['Audit Logs','/audit','audit'], ['Analytics','/analytics','chart'], ['Interface Preferences','/settings','settings']
    ]
  }
};

const AuthContext = createContext(null);
const PERMISSION_KEY = 'resq_permission_envelope_v2';

const createEnvelope = (role, profile = {}, issuedAt = Date.now()) => {
  const permissions = roles[role]?.permissions || [];
  const payload = { role, ...profile, permissions, issuedAt, version: 'v4' };
  let checksum = 2166136261;
  for (const ch of JSON.stringify(payload)) checksum = Math.imul(checksum ^ ch.charCodeAt(0), 16777619);
  return { ...payload, checksum: (checksum >>> 0).toString(16) };
};

const validateEnvelope = (envelope) => {
  if (!envelope?.role || !roles[envelope.role] || !envelope.issuedAt) return null;
  const { checksum, issuedAt, version, permissions, ...profile } = envelope;
  const fresh = createEnvelope(envelope.role, profile, issuedAt);
  if (fresh.checksum !== checksum) return null;
  if (!Array.isArray(permissions) || permissions.join('|') !== fresh.permissions.join('|')) return null;
  return envelope;
};

export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(PERMISSION_KEY));
      return validateEnvelope(raw);
    } catch { return null; }
  });

  const login = (role, profileData = {}) => {
    const safeProfile = {
      name: profileData.name?.trim() || `Demo ${roles[role].label}`,
      email: profileData.email?.trim() || '',
      phone: profileData.phone?.trim() || '',
      country: profileData.country?.trim() || '',
      state: profileData.state || 'Maharashtra',
      district: profileData.district || 'Pune',
      city: profileData.city?.trim() || 'Pune City',
      pincode: profileData.pincode?.trim() || '411005'
    };
    const profile = createEnvelope(role, safeProfile);
    localStorage.setItem(PERMISSION_KEY, JSON.stringify(profile));

    // Authenticate with backend and register session in background
    api.auth.login({ role, ...safeProfile, code: profileData.code || 'RESQ07' })
      .then((res) => {
        if (res?.token) {
          profile.token = res.token;
          localStorage.setItem(PERMISSION_KEY, JSON.stringify(profile));
          setSession({ ...profile });
        }
      })
      .catch(() => {});

    try {
      const socket = getSocket();
      if (socket && socket.connected) {
        socket.emit('resq:join', { role, ...safeProfile });
      }
    } catch {}

    try {
      const key = 'resq_system_activity_v3';
      const existing = JSON.parse(localStorage.getItem(key) || '[]');
      const seed = existing.length ? existing : [
        { id: 'seed-4', kind: 'broadcast', message: 'Flood warning broadcast for Pune District', actor: 'Government Officer', time: '2 min ago' },
        { id: 'seed-3', kind: 'accepted', message: 'Request RQ-1048 accepted for medical response', actor: 'NGO / Volunteer', time: '6 min ago' },
        { id: 'seed-2', kind: 'request', message: 'Emergency food request submitted from Warje', actor: 'Citizen', time: '12 min ago' },
        { id: 'seed-1', kind: 'accepted', message: 'Request RQ-1046 verified by response control', actor: 'System Admin', time: '18 min ago' }
      ];
      const event = { id: String(Date.now()), kind: 'login', message: `${roles[role].label} signed in`, actor: safeProfile.name, time: 'just now', createdAt: Date.now() };
      seed.unshift(event);
      localStorage.setItem(key, JSON.stringify(seed.slice(0, 80)));
      window.dispatchEvent(new CustomEvent('resq:activity', { detail: event }));
    } catch {}
    setSession(profile);
  };
  const logout = () => {
    localStorage.removeItem(PERMISSION_KEY);
    setSession(null);
  };
  const can = (permission) => {
    if (!session || !roles[session.role]) return false;
    const perms = roles[session.role].permissions;
    if (perms.includes(permission)) return true;
    if (permission === 'view_campaigns' && perms.includes('manage_campaigns')) return true;
    if (permission === 'view_shelters' && perms.includes('manage_shelters')) return true;
    if (permission === 'view_alerts' && perms.includes('broadcast_alert')) return true;
    if (permission === 'view_assigned_help' && perms.includes('verify_requests')) return true;
    return false;
  };
  const value = useMemo(() => ({ session, roles, login, logout, can }), [session]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth() { return useContext(AuthContext); }
