import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import * as Icons from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  isCrisisActive,
  getCrisisMeta,
  activateCrisisMode,
  deactivateCrisisMode,
  CRISIS_SCENARIOS
} from '../lib/crisisManager';
import {
  playEmergencyTone,
  playCrisisSiren,
  startContinuousSiren,
  stopContinuousSiren,
  isSirenRunning,
  triggerHaptic,
  isSoundMuted,
  setSoundMuted
} from '../lib/soundUtils';

export function CrisisEmergencyEngine() {
  const { session } = useAuth();
  const navigate = useNavigate();

  const [crisisActive, setCrisisActive] = useState(() => isCrisisActive());
  const [crisisMeta, setCrisisMeta] = useState(() => getCrisisMeta());
  const [elapsed, setElapsed] = useState(0);
  const [toasts, setToasts] = useState([]);
  const [scenarioIndex, setScenarioIndex] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState('activate'); // 'activate' | 'standdown'
  const [muted, setMuted] = useState(() => isSoundMuted());
  const [sirenPlaying, setSirenPlaying] = useState(() => isSirenRunning());

  const canControl = session && (session.role === 'government' || session.role === 'admin');

  // Listen for global sound and siren toggle
  useEffect(() => {
    const onSound = (e) => setMuted(e.detail?.muted);
    const onSiren = (e) => setSirenPlaying(e.detail?.running);
    window.addEventListener('resq:sound-toggle', onSound);
    window.addEventListener('resq:siren-state', onSiren);
    return () => {
      window.removeEventListener('resq:sound-toggle', onSound);
      window.removeEventListener('resq:siren-state', onSiren);
    };
  }, []);

  // Listen for crisis mode state changes across tabs / components
  useEffect(() => {
    const onCrisisChange = (e) => {
      const active = e.detail?.active ?? isCrisisActive();
      setCrisisActive(active);
      setCrisisMeta(getCrisisMeta());
      if (!active) {
        stopContinuousSiren();
        setToasts([]);
        setElapsed(0);
        setSirenPlaying(false);
      }
    };
    window.addEventListener('resq:crisis-mode', onCrisisChange);
    window.addEventListener('storage', () => {
      setCrisisActive(isCrisisActive());
      setCrisisMeta(getCrisisMeta());
    });
    return () => {
      window.removeEventListener('resq:crisis-mode', onCrisisChange);
    };
  }, []);

  // Elapsed timer when crisis is active
  useEffect(() => {
    let timer = null;
    if (crisisActive) {
      // Calculate initial elapsed if we have meta timestamp
      const startTime = crisisMeta?.activatedAt || Date.now();
      const initialDiff = Math.max(0, Math.floor((Date.now() - startTime) / 1000));
      setElapsed(initialDiff);

      timer = setInterval(() => {
        setElapsed((prev) => prev + 1);
      }, 1000);
    } else {
      setElapsed(0);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [crisisActive, crisisMeta?.activatedAt]);

  // Dispatch a crisis toast notification
  const fireCrisisNotification = useCallback((index) => {
    const scen = CRISIS_SCENARIOS[index % CRISIS_SCENARIOS.length];
    const newToast = {
      id: 'toast-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
      scen,
      timestamp: Date.now(),
      counter: index + 1
    };

    // Play authentic disaster emergency crisis siren & trigger haptic
    playCrisisSiren(2.5);
    triggerHaptic([350, 150, 350, 150, 500]);

    // Add to toast stack (keep last 2 visible to keep viewport tidy)
    setToasts((prev) => [newToast, ...prev].slice(0, 2));

    // Also record into system activity feed
    try {
      const actKey = 'resq_system_activity_v3';
      const existing = JSON.parse(localStorage.getItem(actKey) || '[]');
      const event = {
        id: 'crisis-alert-' + Date.now(),
        kind: 'broadcast',
        severity: scen.severity || 'critical',
        message: `🚨 [CODE RED] ${scen.category}: ${scen.title} · ${scen.area}`,
        actor: 'Emergency Broadcast System',
        time: 'just now',
        createdAt: Date.now()
      };
      existing.unshift(event);
      localStorage.setItem(actKey, JSON.stringify(existing.slice(0, 80)));
      window.dispatchEvent(new CustomEvent('resq:activity', { detail: event }));
    } catch {}
  }, []);

  // 10 PER MINUTE AUTOMATED POPUP ENGINE (1 every 6000ms = 6s)
  useEffect(() => {
    let popupInterval = null;

    if (crisisActive) {
      // Immediately fire first alert upon activation
      fireCrisisNotification(0);
      setScenarioIndex(1);

      // Interval runs every 6 seconds (60 seconds / 10 = 6 seconds!)
      popupInterval = setInterval(() => {
        setScenarioIndex((current) => {
          const next = current + 1;
          fireCrisisNotification(current);
          return next;
        });
      }, 6000);
    } else {
      setToasts([]);
    }

    return () => {
      if (popupInterval) clearInterval(popupInterval);
    };
  }, [crisisActive, fireCrisisNotification]);

  // Handle manual dismiss
  const dismissToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Open activation/deactivation confirmation modal
  const handleOpenModal = (type) => {
    if (!canControl) return;
    setModalType(type);
    setModalOpen(true);
  };

  // Confirm modal action
  const handleConfirmAction = () => {
    if (!session) return;
    if (modalType === 'activate') {
      activateCrisisMode(session.name, session.role);
    } else {
      deactivateCrisisMode(session.name, session.role);
    }
    setModalOpen(false);
  };

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <>
      {/* 1. Global Top Emergency Crisis Banner (Visible whenever Crisis is active) */}
      {crisisActive && (
        <div className="crisis-global-banner" role="alert" aria-live="assertive">
          <div className="crisis-banner-left">
            <span className="crisis-beacon" title="Code Red Alert Active">
              <Icons.Siren size={18} />
            </span>
            <div className="crisis-banner-title">
              <b>
                <Icons.AlertTriangle size={14} /> DEFCON 1 · NATIONAL EMERGENCY CRISIS ACTIVE
              </b>
              <small>
                AUTHORIZED BY {crisisMeta?.activatedBy?.toUpperCase() || 'INCIDENT COMMAND'} (
                {crisisMeta?.role?.toUpperCase() || 'GOVERNMENT'})
              </small>
            </div>
          </div>

          <div className="crisis-banner-middle">
            <span className="crisis-chip-pill">
              ⏱️ CRISIS DURATION: <b>{formatTime(elapsed)}</b>
            </span>
            <span className="crisis-chip-pill freq">
              ⚡ FREQUENCY: <b>10 ALERTS / MIN</b>
            </span>
            <span className="crisis-chip-pill">
              📢 BROADCASTS ISSUED: <b>#{scenarioIndex}</b>
            </span>
          </div>

          <div className="crisis-banner-right">
            <button
              type="button"
              className={`crisis-siren-test-btn interactive ${sirenPlaying ? 'active' : ''}`}
              onClick={() => {
                if (sirenPlaying) {
                  stopContinuousSiren();
                  setSirenPlaying(false);
                } else {
                  startContinuousSiren();
                  setSirenPlaying(true);
                  triggerHaptic([400, 200, 400]);
                }
              }}
              title={sirenPlaying ? 'Stop Emergency Siren' : 'Trigger Continuous Emergency Siren'}
            >
              <Icons.Siren size={14} className={sirenPlaying ? 'siren-pulse' : ''} />
              <span>{sirenPlaying ? 'STOP SIREN' : 'SOUND SIREN'}</span>
              {sirenPlaying && (
                <div className="siren-wave-anim">
                  <span />
                  <span />
                  <span />
                </div>
              )}
            </button>

            <button
              type="button"
              className="crisis-audio-btn interactive"
              onClick={() => {
                const next = !muted;
                setSoundMuted(next);
                setMuted(next);
              }}
              title={muted ? 'Unmute Emergency Siren' : 'Mute Emergency Siren'}
              aria-label="Toggle siren audio"
            >
              {muted ? <Icons.VolumeX size={15} /> : <Icons.Volume2 size={15} />}
            </button>

            {canControl && (
              <button
                type="button"
                className="crisis-standdown-btn interactive"
                onClick={() => handleOpenModal('standdown')}
              >
                <Icons.CheckCircle2 size={14} />
                <span>STAND DOWN CRISIS</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* 2. 10 Per Minute Crisis Notification Popups (Floating Stack) */}
      <div className="crisis-toast-container">
        <AnimatePresence>
          {crisisActive &&
            toasts.map((toast) => (
              <motion.div
                key={toast.id}
                className="crisis-toast-card"
                initial={{ opacity: 0, y: -25, scale: 0.92, x: 20 }}
                animate={{ opacity: 1, y: 0, scale: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.88, y: -18 }}
                transition={{ type: 'spring', stiffness: 320, damping: 22 }}
              >
                <div className="crisis-toast-head">
                  <div className="crisis-toast-badge-group">
                    <span className="crisis-toast-siren">
                      <Icons.Siren size={14} />
                    </span>
                    <span className="crisis-toast-tag">{toast.scen.category}</span>
                  </div>
                  <span className="crisis-toast-rate">
                    <Icons.Radio size={11} /> 10/min
                  </span>
                  <button
                    type="button"
                    className="crisis-toast-close interactive"
                    onClick={() => dismissToast(toast.id)}
                    title="Dismiss alert"
                  >
                    <Icons.X size={14} />
                  </button>
                </div>

                <h4 className="crisis-toast-title">{toast.scen.title}</h4>

                <div className="crisis-toast-location">
                  <Icons.MapPin size={12} />
                  <span>{toast.scen.area}</span>
                </div>

                <p className="crisis-toast-body">{toast.scen.message}</p>

                <div className="crisis-toast-actions">
                  <button
                    type="button"
                    className="crisis-toast-siren-btn interactive"
                    onClick={(e) => {
                      e.stopPropagation();
                      playCrisisSiren(2.8);
                      triggerHaptic([300, 150, 300]);
                    }}
                    title="Sound Emergency Siren for this incident"
                  >
                    <Icons.Volume2 size={13} />
                    <span>SIREN</span>
                    <div className="siren-wave-anim">
                      <span />
                      <span />
                      <span />
                    </div>
                  </button>

                  <button
                    type="button"
                    className="crisis-toast-link-btn interactive"
                    onClick={() => {
                      if (toast.scen.actionRoute) {
                        navigate(toast.scen.actionRoute);
                      }
                    }}
                  >
                    <Icons.ExternalLink size={12} />
                    <span>{toast.scen.actionLabel || 'Take Action'}</span>
                  </button>

                  <button
                    type="button"
                    className="crisis-toast-link-btn interactive"
                    onClick={() => navigate('/help')}
                    style={{ background: 'rgba(255, 255, 255, 0.1)', borderColor: 'rgba(255, 255, 255, 0.2)' }}
                  >
                    <Icons.PhoneCall size={12} />
                    <span>SOS 112</span>
                  </button>
                </div>

                {/* 6-second live progress bar indicating next alert incoming */}
                <div className="crisis-progress-track">
                  <div className="crisis-progress-fill" />
                </div>
              </motion.div>
            ))}
        </AnimatePresence>
      </div>

      {/* 3. Emergency Crisis Confirmation Modal */}
      <AnimatePresence>
        {modalOpen && (
          <motion.div
            className="crisis-modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="crisis-modal-card"
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
            >
              <div className="crisis-modal-header">
                <span className="crisis-modal-icon">
                  {modalType === 'activate' ? <Icons.Flame size={26} /> : <Icons.ShieldCheck size={26} />}
                </span>
                <div className="crisis-modal-title">
                  <h3>
                    {modalType === 'activate'
                      ? 'DECLARE NATIONAL EMERGENCY CRISIS'
                      : 'STAND DOWN EMERGENCY CRISIS'}
                  </h3>
                  <span>
                    AUTHORIZED OPERATOR: {session?.name?.toUpperCase()} ({session?.role?.toUpperCase()})
                  </span>
                </div>
              </div>

              <div className="crisis-modal-body">
                {modalType === 'activate' ? (
                  <>
                    <p>
                      You are about to initiate <b>CODE RED EMERGENCY CRISIS</b> across the entire RESQ
                      platform. This is reserved for state-level disasters and catastrophic emergencies.
                    </p>
                    <ul>
                      <li>
                        <b>Emergency Theme Transformation:</b> All website surfaces will shift into high-contrast
                        Code Red Crisis Theme.
                      </li>
                      <li>
                        <b>Live 10/Min Advisories:</b> Continuous emergency disaster broadcasts will pop up every 6
                        seconds for all citizens, responders, and commanders.
                      </li>
                      <li>
                        <b>Siren & Audio Beacon:</b> Audible alarms and tactical vibrations will trigger across the
                        mesh network.
                      </li>
                    </ul>
                  </>
                ) : (
                  <>
                    <p>
                      Confirm standing down the emergency crisis posture. This will return the platform back to
                      standard operational status:
                    </p>
                    <ul>
                      <li>Emergency Crisis Theme will be normalized back to user preferences (Dark/Light).</li>
                      <li>Continuous 10/minute broadcast popups will be stopped.</li>
                      <li>An official stand-down notice will be recorded in the national audit ledger.</li>
                    </ul>
                  </>
                )}
              </div>

              <div className="crisis-modal-actions">
                <button
                  type="button"
                  className="crisis-btn-cancel interactive"
                  onClick={() => setModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={`crisis-btn-execute ${modalType === 'standdown' ? 'standdown' : ''} interactive`}
                  onClick={handleConfirmAction}
                >
                  {modalType === 'activate' ? '⚠️ CONFIRM & ACTIVATE CRISIS' : '🟢 CONFIRM STAND DOWN'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/**
 * Topbar Trigger Button component
 * Accessible exclusively to Government Officers and Website Admins.
 */
export function EmergencyCrisisButton() {
  const { session } = useAuth();
  const [crisisActive, setCrisisActive] = useState(() => isCrisisActive());
  const [modalOpen, setModalOpen] = useState(false);

  const canControl = session && (session.role === 'government' || session.role === 'admin');

  useEffect(() => {
    const sync = () => setCrisisActive(isCrisisActive());
    window.addEventListener('resq:crisis-mode', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('resq:crisis-mode', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  if (!canControl) return null;

  const handleClick = () => {
    setModalOpen(true);
  };

  const handleConfirm = () => {
    if (!session) return;
    if (crisisActive) {
      deactivateCrisisMode(session.name, session.role);
    } else {
      activateCrisisMode(session.name, session.role);
    }
    setModalOpen(false);
  };

  return (
    <>
      <button
        type="button"
        className={`crisis-toggle-trigger interactive ${crisisActive ? 'crisis-active' : ''}`}
        onClick={handleClick}
        title={crisisActive ? 'Stand down emergency crisis' : 'Activate national emergency crisis theme & broadcast'}
      >
        {crisisActive ? <Icons.AlertOctagon size={15} /> : <Icons.Flame size={15} />}
        <span>{crisisActive ? 'STAND DOWN CRISIS' : 'EMERGENCY CRISIS'}</span>
      </button>

      <AnimatePresence>
        {modalOpen && (
          <motion.div
            className="crisis-modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="crisis-modal-card"
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
            >
              <div className="crisis-modal-header">
                <span className="crisis-modal-icon">
                  {crisisActive ? <Icons.ShieldCheck size={26} /> : <Icons.Flame size={26} />}
                </span>
                <div className="crisis-modal-title">
                  <h3>
                    {crisisActive
                      ? 'STAND DOWN EMERGENCY CRISIS'
                      : 'DECLARE NATIONAL EMERGENCY CRISIS'}
                  </h3>
                  <span>
                    VERIFIED ROLE: {session.name} ({session.role.toUpperCase()})
                  </span>
                </div>
              </div>

              <div className="crisis-modal-body">
                {crisisActive ? (
                  <p>
                    Are you sure you want to stand down the emergency crisis? The website theme will revert to
                    standard and 10/min crisis broadcasts will cease.
                  </p>
                ) : (
                  <>
                    <p>
                      Are you sure you want to declare a <b>NATIONAL EMERGENCY CRISIS</b>?
                    </p>
                    <ul>
                      <li>All platform themes will instantly change to high-urgency <b>Emergency Crisis Mode</b>.</li>
                      <li><b>10 emergency crisis notifications per minute</b> will pop up for all users.</li>
                      <li>Emergency sirens and sirens audio will be primed across all active clients.</li>
                    </ul>
                  </>
                )}
              </div>

              <div className="crisis-modal-actions">
                <button
                  type="button"
                  className="crisis-btn-cancel interactive"
                  onClick={() => setModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={`crisis-btn-execute ${crisisActive ? 'standdown' : ''} interactive`}
                  onClick={handleConfirm}
                >
                  {crisisActive ? '🟢 Stand Down Crisis' : '🚨 Activate Code Red Crisis'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/**
 * Tactical Dashboard Banner Widget for Government & Admin dashboards
 */
export function DashboardCrisisWidget() {
  const { session } = useAuth();
  const [crisisActive, setCrisisActive] = useState(() => isCrisisActive());
  const [crisisMeta, setCrisisMeta] = useState(() => getCrisisMeta());
  const canControl = session && (session.role === 'government' || session.role === 'admin');

  useEffect(() => {
    const sync = () => {
      setCrisisActive(isCrisisActive());
      setCrisisMeta(getCrisisMeta());
    };
    window.addEventListener('resq:crisis-mode', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('resq:crisis-mode', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  if (!canControl) return null;

  return (
    <div className={`crisis-dashboard-banner ${crisisActive ? 'active' : ''}`}>
      <div className="crisis-dash-left">
        <span className="crisis-dash-icon">
          {crisisActive ? <Icons.Siren size={22} /> : <Icons.Flame size={22} />}
        </span>
        <div className="crisis-dash-text">
          <b>
            {crisisActive
              ? '🚨 CODE RED EMERGENCY CRISIS ACTIVATED'
              : '⚡ NATIONAL EMERGENCY CRISIS CONTROLLER'}
          </b>
          <p>
            {crisisActive
              ? `Platform is locked in Emergency Crisis Theme. 10 live advisories/min broadcasting to all users. Authorized by ${crisisMeta?.activatedBy || 'Officer'}.`
              : 'Authorized for Government Officers & System Admins. Press to engage Code Red Theme and broadcast 10 crisis advisories per minute.'}
          </p>
        </div>
      </div>
      <div>
        <EmergencyCrisisButton />
      </div>
    </div>
  );
}
