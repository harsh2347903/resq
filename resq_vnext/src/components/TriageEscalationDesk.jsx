import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as Icons from 'lucide-react';
import { api, getSocket } from '../lib/apiClient';
import { useAuth } from '../context/AuthContext';

const DEFAULT_NGOS = [
  { id: 'ngo-seva', name: 'Seva Sahayog Disaster Relief', focus: 'Community Evacuation & Medical', base: 'Pune Central' },
  { id: 'ngo-ndrf', name: 'NDRF Battalion 5 (Rapid Rescue)', focus: 'High-Risk Water & Structural Rescue', base: 'Talegaon HQ' },
  { id: 'ngo-redcross', name: 'Indian Red Cross Society (Maharashtra)', focus: 'Trauma Care & Field Hospital', base: 'Pune Camp' },
  { id: 'ngo-civil', name: 'Civil Defense Volunteer Taskforce', focus: 'Neighborhood Search & Logistical Aid', base: 'Shivaji Nagar' },
  { id: 'ngo-feed', name: 'Apada Nivaran Relief Mission', focus: 'Clean Water & Emergency Food Supply', base: 'Kothrud' }
];

const DEFAULT_VOLUNTEERS = [
  { id: 'VOL-412', name: 'Kabir R.', skill: 'Boat / Water Rescue', area: 'Pune', phone: '+91 98220 44120', status: 'Available' },
  { id: 'VOL-331', name: 'Meera P.', skill: 'First Aid / Paramedic', area: 'Pune', phone: '+91 98220 33100', status: 'Available' },
  { id: 'VOL-284', name: 'Arjun S.', skill: 'Logistics & Heavy Transport', area: 'Satara', phone: '+91 98220 28400', status: 'Available' },
  { id: 'VOL-198', name: 'Sara K.', skill: 'Crisis Translation & Triage', area: 'Pune', phone: '+91 98220 19800', status: 'Available' }
];

export function TriageEscalationDesk() {
  const { session } = useAuth();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all, critical, pending, assigned
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCase, setSelectedCase] = useState(null); // for appointment modal
  const [selectedNgo, setSelectedNgo] = useState(DEFAULT_NGOS[0].name);
  const [selectedVolunteer, setSelectedVolunteer] = useState(DEFAULT_VOLUNTEERS[0].id);
  const [customInstructions, setCustomInstructions] = useState('');
  const [dispatching, setDispatching] = useState(false);
  const [actionSuccess, setActionSuccess] = useState(null);

  const fetchRequests = async () => {
    try {
      setLoading(true);
      const res = await api.requests.getAll();
      const list = res.requests || [];
      // Prioritize AI triage requests, but display all incoming distress cases
      setRequests(list);
    } catch (err) {
      console.error('Failed to load triage requests:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();

    const socket = getSocket();
    if (socket) {
      const handleNew = (newReq) => {
        setRequests(prev => [newReq, ...prev.filter(r => r.id !== newReq.id)]);
      };
      const handleUpdate = (updatedReq) => {
        setRequests(prev => prev.map(r => r.id === updatedReq.id ? { ...r, ...updatedReq } : r));
      };

      socket.on('triage:escalation', handleNew);
      socket.on('request:created', handleNew);
      socket.on('request:updated', handleUpdate);
      socket.on('triage:assigned', handleUpdate);

      return () => {
        socket.off('triage:escalation', handleNew);
        socket.off('request:created', handleNew);
        socket.off('request:updated', handleUpdate);
        socket.off('triage:assigned', handleUpdate);
      };
    }
  }, []);

  const openAppointModal = (reqItem) => {
    setSelectedCase(reqItem);
    setSelectedNgo(DEFAULT_NGOS[0].name);
    setSelectedVolunteer(DEFAULT_VOLUNTEERS[0].id);
    setCustomInstructions(`Immediate response for ${reqItem.type} at ${reqItem.location}. Assist citizen ${reqItem.citizen}.`);
    setActionSuccess(null);
  };

  const handleConfirmDispatch = async () => {
    if (!selectedCase) return;
    setDispatching(true);
    try {
      const vol = DEFAULT_VOLUNTEERS.find(v => v.id === selectedVolunteer);
      const teamLabel = `${selectedNgo} · ${vol?.name || 'Assigned Unit'} (${vol?.skill || 'Responder'})`;

      await api.requests.dispatch(selectedCase.id, {
        volunteerId: selectedVolunteer,
        team: teamLabel,
        ngoOrg: selectedNgo,
        instructions: customInstructions
      });

      // Update local state immediately
      setRequests(prev => prev.map(r => {
        if (r.id === selectedCase.id) {
          return {
            ...r,
            team: teamLabel,
            ngoOrg: selectedNgo,
            appointedVolunteer: vol?.name,
            status: 'Assigned',
            dispatchNotes: customInstructions
          };
        }
        return r;
      }));

      setActionSuccess(`Successfully appointed ${selectedNgo} to Request #${selectedCase.id}. Citizen notified.`);
      setTimeout(() => {
        setSelectedCase(null);
        setActionSuccess(null);
      }, 1600);
    } catch (err) {
      console.error('Dispatch failed:', err);
      alert('Failed to dispatch NGO team. Please try again.');
    } finally {
      setDispatching(false);
    }
  };

  const filteredRequests = requests.filter(r => {
    const isAiTriage = r.source === 'ai_triage' || (r.type && r.type.toLowerCase().includes('triage')) || r.triage;
    if (filter === 'critical') {
      if (r.priority !== 'Critical') return false;
    } else if (filter === 'pending') {
      if (r.status === 'Assigned' || r.status === 'Resolved' || r.status === 'Closed') return false;
    } else if (filter === 'assigned') {
      if (r.status !== 'Assigned') return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = (r.citizen || '').toLowerCase().includes(q);
      const matchLoc = (r.location || '').toLowerCase().includes(q);
      const matchType = (r.type || '').toLowerCase().includes(q);
      const matchDetails = (r.details || '').toLowerCase().includes(q);
      if (!matchName && !matchLoc && !matchType && !matchDetails) return false;
    }
    return true;
  });

  const pendingCount = requests.filter(r => r.status === 'Open' || !r.status || r.status === 'Pending').length;
  const criticalCount = requests.filter(r => r.priority === 'Critical').length;
  const assignedCount = requests.filter(r => r.status === 'Assigned').length;

  return (
    <div className="content-stack triage-desk-container">
      {/* Desk Banner */}
      <div className="glass-panel" style={{ padding: '22px 26px', borderRadius: '16px', border: '1px solid rgba(148, 163, 184, 0.16)', background: 'linear-gradient(135deg, rgba(14, 22, 35, 0.85), rgba(7, 16, 25, 0.95))' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '14px' }}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '4px 10px', borderRadius: '20px', background: 'rgba(2, 132, 199, 0.14)', color: '#38bdf8', fontSize: '12px', fontWeight: '700', letterSpacing: '0.06em', marginBottom: '8px' }}>
              <Icons.ShieldCheck size={14} /> OFFICIAL INCIDENT & DISPATCH CONSOLE
            </div>
            <h2 style={{ fontSize: '24px', fontWeight: '800', color: '#f8fafc', margin: '0 0 6px 0', letterSpacing: '-0.02em' }}>
              Citizen AI Triage Command & NGO Dispatch Desk
            </h2>
            <p style={{ margin: 0, color: '#94a3b8', fontSize: '14px', maxWidth: '750px', lineHeight: '1.5' }}>
              Real-time stream of distress reports evaluated by Rakshak AI directly from citizens in your sector. Review severity classifications, inspect GPS coordinates, and appoint accredited NGO response units and volunteers.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="secondary-button interactive" onClick={fetchRequests} title="Refresh incoming feed" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <Icons.RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh
            </button>
          </div>
        </div>

        {/* Counter Strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginTop: '20px' }}>
          <div style={{ padding: '12px 16px', borderRadius: '10px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <span style={{ fontSize: '11px', color: '#64748b', fontWeight: '700', textTransform: 'uppercase' }}>Total Triage Reports</span>
            <div style={{ fontSize: '24px', fontWeight: '800', color: '#f8fafc', marginTop: '2px' }}>{requests.length}</div>
          </div>
          <div style={{ padding: '12px 16px', borderRadius: '10px', background: 'rgba(217, 119, 6, 0.08)', border: '1px solid rgba(217, 119, 6, 0.25)' }}>
            <span style={{ fontSize: '11px', color: '#fbbf24', fontWeight: '700', textTransform: 'uppercase' }}>Awaiting NGO Dispatch</span>
            <div style={{ fontSize: '24px', fontWeight: '800', color: '#fef3c7', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              {pendingCount}
              {pendingCount > 0 && <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#f59e0b', animation: 'pulse 1.5s infinite' }} />}
            </div>
          </div>
          <div style={{ padding: '12px 16px', borderRadius: '10px', background: 'rgba(220, 38, 38, 0.08)', border: '1px solid rgba(220, 38, 38, 0.25)' }}>
            <span style={{ fontSize: '11px', color: '#f87171', fontWeight: '700', textTransform: 'uppercase' }}>Code Red Critical</span>
            <div style={{ fontSize: '24px', fontWeight: '800', color: '#fee2e2', marginTop: '2px' }}>{criticalCount}</div>
          </div>
          <div style={{ padding: '12px 16px', borderRadius: '10px', background: 'rgba(22, 163, 74, 0.08)', border: '1px solid rgba(22, 163, 74, 0.25)' }}>
            <span style={{ fontSize: '11px', color: '#4ade80', fontWeight: '700', textTransform: 'uppercase' }}>NGO Units Mobilized</span>
            <div style={{ fontSize: '24px', fontWeight: '800', color: '#dcfce7', marginTop: '2px' }}>{assignedCount}</div>
          </div>
        </div>
      </div>

      {/* Control Bar: Filters & Search */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ display: 'inline-flex', background: 'rgba(15, 23, 42, 0.6)', padding: '4px', borderRadius: '10px', border: '1px solid rgba(148, 163, 184, 0.12)' }}>
          {[
            { key: 'all', label: 'All Cases' },
            { key: 'critical', label: `Critical (${criticalCount})` },
            { key: 'pending', label: `Pending NGO (${pendingCount})` },
            { key: 'assigned', label: `Assigned (${assignedCount})` }
          ].map(tab => (
            <button
              key={tab.key}
              type="button"
              className="interactive"
              onClick={() => setFilter(tab.key)}
              style={{
                padding: '7px 14px',
                borderRadius: '7px',
                border: 'none',
                background: filter === tab.key ? 'rgba(2, 132, 199, 0.85)' : 'transparent',
                color: filter === tab.key ? '#fff' : '#94a3b8',
                fontWeight: filter === tab.key ? '700' : '500',
                fontSize: '13px',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div style={{ position: 'relative', minWidth: '260px' }}>
          <Icons.Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search citizen, location, or issue..."
            style={{
              width: '100%',
              padding: '8px 12px 8px 34px',
              borderRadius: '8px',
              border: '1px solid rgba(148, 163, 184, 0.16)',
              background: 'rgba(15, 23, 42, 0.6)',
              color: '#f8fafc',
              fontSize: '13px',
              outline: 'none'
            }}
          />
        </div>
      </div>

      {/* Triage Cards Feed */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
          <Icons.Loader size={24} className="spin" style={{ margin: '0 auto 10px' }} />
          <div>Connecting to Incident Grid & Ingesting Telemetry...</div>
        </div>
      ) : filteredRequests.length === 0 ? (
        <div className="glass-panel" style={{ textAlign: 'center', padding: '48px 24px', borderRadius: '14px', border: '1px dashed rgba(148, 163, 184, 0.2)' }}>
          <Icons.Inbox size={32} style={{ color: '#64748b', marginBottom: '10px' }} />
          <h4 style={{ color: '#cbd5e1', margin: '0 0 6px 0' }}>No Triage Reports Matching Current Filter</h4>
          <p style={{ color: '#64748b', fontSize: '13px', margin: 0 }}>
            Incoming citizen AI triage escalations will appear here automatically via real-time WebSocket connection.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '14px' }}>
          {filteredRequests.map(req => {
            const isCritical = req.priority === 'Critical';
            const isAssigned = req.status === 'Assigned';
            const coords = req.coordinates || { lat: 18.5204, lng: 73.8567 };
            const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${coords.lat},${coords.lng}&travelmode=driving`;
            const triageInfo = req.triage || {};

            return (
              <motion.div
                key={req.id}
                className="glass-panel"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                style={{
                  padding: '18px 20px',
                  borderRadius: '12px',
                  border: isCritical ? '1px solid rgba(220, 38, 38, 0.35)' : '1px solid rgba(148, 163, 184, 0.16)',
                  background: isCritical ? 'linear-gradient(180deg, rgba(220, 38, 38, 0.05), rgba(15, 23, 42, 0.7))' : 'rgba(15, 23, 42, 0.65)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{
                      padding: '3px 8px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: '800',
                      letterSpacing: '0.04em',
                      background: isCritical ? '#dc2626' : req.priority === 'High' ? '#d97706' : '#0284c7',
                      color: '#fff'
                    }}>
                      {req.priority || 'HIGH'}
                    </span>
                    <span style={{ color: '#f8fafc', fontWeight: '700', fontSize: '15px' }}>
                      {req.type || 'Emergency Assistance'}
                    </span>
                    <span style={{ color: '#64748b', fontSize: '12px' }}>
                      • Ticket #{req.id} • {req.time || 'Recent'}
                    </span>
                    {req.source === 'ai_triage' && (
                      <span style={{ padding: '2px 7px', borderRadius: '12px', background: 'rgba(56, 189, 248, 0.12)', color: '#38bdf8', fontSize: '10px', fontWeight: '700', border: '1px solid rgba(56, 189, 248, 0.25)' }}>
                        🤖 AI TRIAGE REPORT
                      </span>
                    )}
                  </div>

                  {/* Status Badge */}
                  <div>
                    {isAssigned ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 10px', borderRadius: '20px', background: 'rgba(22, 163, 74, 0.16)', color: '#4ade80', fontSize: '12px', fontWeight: '700', border: '1px solid rgba(22, 163, 74, 0.3)' }}>
                        <Icons.CheckCircle2 size={13} /> ASSIGNED TO NGO
                      </span>
                    ) : (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 10px', borderRadius: '20px', background: 'rgba(217, 119, 6, 0.16)', color: '#fbbf24', fontSize: '12px', fontWeight: '700', border: '1px solid rgba(217, 119, 6, 0.3)' }}>
                        <Icons.Clock size={13} /> PENDING NGO DISPATCH
                      </span>
                    )}
                  </div>
                </div>

                {/* Citizen Details Strip */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '18px', flexWrap: 'wrap', marginTop: '12px', padding: '8px 12px', borderRadius: '8px', background: 'rgba(0,0,0,0.2)', fontSize: '13px' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#e2e8f0' }}>
                    <Icons.User size={14} style={{ color: '#38bdf8' }} />
                    <b>{req.citizen || 'Anonymous Citizen'}</b>
                  </div>
                  {req.phone && (
                    <a href={`tel:${req.phone}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: '#38bdf8', textDecoration: 'none' }}>
                      <Icons.Phone size={13} /> {req.phone}
                    </a>
                  )}
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#94a3b8' }}>
                    <Icons.MapPin size={14} style={{ color: '#f43f5e' }} />
                    <span>{req.location}</span>
                  </div>
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
                    <a
                      href={mapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="interactive"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '4px 9px',
                        borderRadius: '6px',
                        background: 'rgba(255,255,255,0.06)',
                        color: '#cbd5e1',
                        fontSize: '12px',
                        textDecoration: 'none'
                      }}
                    >
                      <Icons.Navigation size={12} /> Google Maps
                    </a>
                  </div>
                </div>

                {/* AI Triage Synthesis & Equipment */}
                <div style={{ marginTop: '12px', padding: '10px 14px', borderRadius: '8px', background: 'rgba(15, 23, 42, 0.8)', border: '1px solid rgba(148, 163, 184, 0.1)' }}>
                  <div style={{ fontSize: '12px', color: '#94a3b8', display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span><b>Distress Report / Message:</b> "{req.details || req.type}"</span>
                    {triageInfo.estimatedPersons && (
                      <span style={{ color: '#cbd5e1' }}>👥 Estimated: <b>{triageInfo.estimatedPersons} Person(s)</b></span>
                    )}
                  </div>
                  {triageInfo.requiredEquipment && triageInfo.requiredEquipment.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
                      <span style={{ fontSize: '11px', color: '#64748b', fontWeight: '700' }}>RECOMMENDED RESCUE UNITS:</span>
                      {triageInfo.requiredEquipment.map((eq, i) => (
                        <span key={i} style={{ padding: '2px 6px', borderRadius: '4px', background: 'rgba(2, 132, 199, 0.15)', color: '#38bdf8', fontSize: '11px', fontWeight: '600' }}>
                          {eq}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Assignment Banner & Actions */}
                <div style={{ marginTop: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                  <div>
                    {isAssigned ? (
                      <div style={{ fontSize: '13px', color: '#e2e8f0' }}>
                        <span style={{ color: '#94a3b8' }}>Appointed Unit: </span>
                        <b style={{ color: '#4ade80' }}>{req.team}</b>
                        {req.dispatchNotes && (
                          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                            Notes: {req.dispatchNotes}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div style={{ fontSize: '12px', color: '#f59e0b', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                        <Icons.AlertCircle size={14} /> Unassigned · Citizen awaiting emergency rescue mobilization
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      className="primary-button interactive"
                      onClick={() => openAppointModal(req)}
                      style={{
                        padding: '7px 14px',
                        fontSize: '13px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        background: isAssigned ? 'rgba(255,255,255,0.08)' : '#0284c7',
                        border: isAssigned ? '1px solid rgba(255,255,255,0.15)' : 'none'
                      }}
                    >
                      <Icons.UserCheck size={14} />
                      {isAssigned ? 'Reappoint NGO / Team' : 'Appoint NGO & Volunteer'}
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* NGO & Volunteer Appointment Modal */}
      <AnimatePresence>
        {selectedCase && (
          <motion.div
            className="modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed',
              top: 0, left: 0, right: 0, bottom: 0,
              background: 'rgba(0, 0, 0, 0.75)',
              backdropFilter: 'blur(5px)',
              zIndex: 1000,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '20px'
            }}
          >
            <motion.div
              className="glass-panel"
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
              style={{
                width: '100%',
                maxWidth: '560px',
                borderRadius: '16px',
                padding: '24px',
                background: '#0c1524',
                border: '1px solid rgba(148, 163, 184, 0.25)',
                boxShadow: '0 20px 50px rgba(0,0,0,0.6)'
              }}
            >
              {/* Modal Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div>
                  <span style={{ fontSize: '11px', color: '#38bdf8', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Operational Deployment
                  </span>
                  <h3 style={{ margin: '2px 0 0 0', fontSize: '19px', fontWeight: '800', color: '#f8fafc' }}>
                    Appoint NGO & Volunteer Team
                  </h3>
                </div>
                <button
                  type="button"
                  className="interactive"
                  onClick={() => setSelectedCase(null)}
                  style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}
                >
                  <Icons.X size={18} />
                </button>
              </div>

              {/* Case Briefing */}
              <div style={{ padding: '12px 14px', borderRadius: '8px', background: 'rgba(15, 23, 42, 0.8)', border: '1px solid rgba(148, 163, 184, 0.12)', marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: '700', color: '#e2e8f0', marginBottom: '4px' }}>
                  <span>Ticket #{selectedCase.id}: {selectedCase.type}</span>
                  <span style={{ color: selectedCase.priority === 'Critical' ? '#ef4444' : '#f59e0b' }}>{selectedCase.priority}</span>
                </div>
                <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                  Citizen: <b>{selectedCase.citizen}</b> ({selectedCase.phone || 'No phone'}) • Location: <b>{selectedCase.location}</b>
                </div>
                <div style={{ fontSize: '12px', color: '#cbd5e1', marginTop: '4px', fontStyle: 'italic' }}>
                  "{selectedCase.details || selectedCase.type}"
                </div>
              </div>

              {/* Form: Select NGO */}
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#cbd5e1', marginBottom: '6px' }}>
                  Select Accredited NGO / Response Partner
                </label>
                <select
                  value={selectedNgo}
                  onChange={e => setSelectedNgo(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    background: 'rgba(15, 23, 42, 0.9)',
                    color: '#f8fafc',
                    border: '1px solid rgba(148, 163, 184, 0.2)',
                    fontSize: '13px',
                    outline: 'none'
                  }}
                >
                  {DEFAULT_NGOS.map(ngo => (
                    <option key={ngo.id} value={ngo.name}>
                      {ngo.name} — {ngo.focus} ({ngo.base})
                    </option>
                  ))}
                </select>
              </div>

              {/* Form: Select Volunteer Team Lead */}
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#cbd5e1', marginBottom: '6px' }}>
                  Appoint Field Volunteer Lead / Specialist
                </label>
                <select
                  value={selectedVolunteer}
                  onChange={e => setSelectedVolunteer(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    background: 'rgba(15, 23, 42, 0.9)',
                    color: '#f8fafc',
                    border: '1px solid rgba(148, 163, 184, 0.2)',
                    fontSize: '13px',
                    outline: 'none'
                  }}
                >
                  {DEFAULT_VOLUNTEERS.map(v => (
                    <option key={v.id} value={v.id}>
                      {v.name} — {v.skill} ({v.area}) • Status: {v.status}
                    </option>
                  ))}
                </select>
              </div>

              {/* Form: Tactical Instructions */}
              <div style={{ marginBottom: '18px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#cbd5e1', marginBottom: '6px' }}>
                  Command Instructions for Responders
                </label>
                <textarea
                  rows={3}
                  value={customInstructions}
                  onChange={e => setCustomInstructions(e.target.value)}
                  placeholder="Special instructions for field rescue team..."
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    background: 'rgba(15, 23, 42, 0.9)',
                    color: '#f8fafc',
                    border: '1px solid rgba(148, 163, 184, 0.2)',
                    fontSize: '13px',
                    outline: 'none',
                    resize: 'vertical'
                  }}
                />
              </div>

              {actionSuccess && (
                <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(22, 163, 74, 0.15)', color: '#4ade80', fontSize: '13px', fontWeight: '600', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Icons.CheckCircle2 size={16} /> {actionSuccess}
                </div>
              )}

              {/* Modal Actions */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  className="secondary-button interactive"
                  onClick={() => setSelectedCase(null)}
                  disabled={dispatching}
                  style={{ padding: '8px 16px', fontSize: '13px' }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="primary-button interactive"
                  onClick={handleConfirmDispatch}
                  disabled={dispatching}
                  style={{ padding: '8px 18px', fontSize: '13px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  {dispatching ? (
                    <>
                      <Icons.Loader size={14} className="spin" /> Dispatching...
                    </>
                  ) : (
                    <>
                      <Icons.Send size={14} /> Confirm & Dispatch NGO Team
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
export default TriageEscalationDesk;
