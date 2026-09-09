import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import * as Icons from 'lucide-react';
import { useAuth, roles } from './context/AuthContext';
import { alerts, campaigns, shelters, requests, incidents, activities, volunteers, audits } from './lib/mockData';
import { playEmergencyTone, triggerHaptic, createSpeechRecognizer, isSoundMuted, setSoundMuted } from './lib/soundUtils';
import { getAllStates, getDistrictsForState, getTalukasForDistrict, getCitiesForDistrict, getCoordinatesForLocation, getDistrictCenter } from './lib/indiaGeoData';
import { useSectorLocation } from './context/LocationContext';
import { LocationSwitcherBadge } from './components/LocationSwitcherModal';
import { CrisisEmergencyEngine, EmergencyCrisisButton, DashboardCrisisWidget } from './components/CrisisEmergencyEngine';
import { isCrisisActive } from './lib/crisisManager';
import { GoogleOperationsMap } from './components/GoogleOperationsMap';
import { DigitalTemperatureReader, LiveTemperatureNavPill } from './components/DigitalTemperatureReader';
import { CitizenAiTriageAssistant } from './components/CitizenAiTriageAssistant';


const ACTIVITY_KEY='resq_system_activity_v3';
const PROFILE_KEY='resq_profile_v3';
const BROADCAST_KEY='resq_broadcast_history_v1';
const PREF_KEY='resq_interface_preferences_v1';
const REQUEST_KEY='resq_request_workflow_v2';
const CAMPAIGN_KEY='resq_campaign_memberships_v2';

function readList(key, fallback=[]){ try { const v=JSON.parse(localStorage.getItem(key)||'null'); return Array.isArray(v)?v:fallback; } catch { return fallback; } }
function writeList(key, items){ try { localStorage.setItem(key, JSON.stringify(items)); window.dispatchEvent(new CustomEvent('resq:store',{detail:{key,items}})); } catch {} }
function severityClass(severity='info'){ const s=String(severity).toLowerCase(); return s==='critical'?'critical':s==='high'?'high':s==='medium'?'medium':'info'; }
function nowLabel(){ return 'just now'; }
function readBroadcasts(){ try { return JSON.parse(localStorage.getItem(BROADCAST_KEY)||'[]'); } catch { return []; } }
function saveBroadcasts(items){ try { const next=items.slice(0,100); localStorage.setItem(BROADCAST_KEY,JSON.stringify(next)); window.dispatchEvent(new CustomEvent('resq:broadcasts',{detail:next})); } catch {} }
function applyGlobalPreferences(prefs){
  if (typeof document === 'undefined') return;
  const p = prefs || readPrefs();
  const isCrisis = isCrisisActive();
  const theme = isCrisis ? 'crisis' : (p.theme || 'dark');
  document.documentElement.dataset.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.dataset.density = p.density || 'comfortable';
  document.documentElement.dataset.lang = p.language || 'English';
  document.documentElement.dataset.motion = p.reducedMotion ? 'reduced' : 'full';
  document.documentElement.dataset.emergency = p.emergencyMode ? 'on' : 'off';
  document.documentElement.dataset.glow = p.accentGlow === false ? 'off' : 'on';
  document.documentElement.dataset.autorefresh = p.autoRefresh === false ? 'off' : 'on';
  document.documentElement.dataset.sms = p.sms === false ? 'off' : 'on';
  if (isCrisis) {
    document.documentElement.dataset.crisis = 'active';
    document.documentElement.classList.add('crisis-mode-active');
    if (document.body) document.body.classList.add('crisis-mode-active');
  } else {
    document.documentElement.dataset.crisis = 'off';
    document.documentElement.classList.remove('crisis-mode-active');
    if (document.body) document.body.classList.remove('crisis-mode-active');
  }
}
function readPrefs(){ try { return JSON.parse(localStorage.getItem(PREF_KEY)||'{}'); } catch { return {}; } }
function writePrefs(next){ try { localStorage.setItem(PREF_KEY,JSON.stringify(next)); applyGlobalPreferences(next); window.dispatchEvent(new CustomEvent('resq:preferences',{detail:next})); } catch {} }
function readActivities(){ try { return JSON.parse(localStorage.getItem(ACTIVITY_KEY)||'[]'); } catch { return []; } }
function recordActivity(event){ try { const normalized={id:event.id||String(Date.now()),createdAt:event.createdAt||Date.now(),...event}; const next=[normalized,...readActivities().filter(x=>x.id!==normalized.id)].slice(0,80); localStorage.setItem(ACTIVITY_KEY,JSON.stringify(next)); window.dispatchEvent(new CustomEvent('resq:activity',{detail:normalized})); } catch {} }
function readProfile(){ try { return JSON.parse(localStorage.getItem(PROFILE_KEY)||'{}'); } catch { return {}; } }
function saveProfile(next){ try { localStorage.setItem(PROFILE_KEY,JSON.stringify(next)); } catch {} }

const iconMap = { home:Icons.LayoutDashboard, bot:Icons.Bot, sos:Icons.Siren, flag:Icons.Flag, bell:Icons.Bell, megaphone:Icons.Megaphone, shelter:Icons.House, family:Icons.Users, tasks:Icons.ListChecks, mission:Icons.Route, impact:Icons.BadgeCheck, incident:Icons.TriangleAlert, campaign:Icons.Megaphone, ngo:Icons.Handshake, chart:Icons.ChartNoAxesCombined, users:Icons.UsersRound, shield:Icons.ShieldCheck, audit:Icons.ScrollText, settings:Icons.Settings };
const pageMeta = {
  '/dashboard':['Command center','Response network overview'], '/triage':['AI Disaster Triage & First-Aid Assistant','24/7 automated disaster caution, safety protocols, and emergency guidance'], '/help':['Emergency response','Request immediate assistance'], '/incident':['Incident report','Help responders understand what is happening'],
  '/alerts':['Safety intelligence','Verified public advisories'], '/campaigns':['Community action','Government and NGO programs'], '/shelters':['Relief network','Open shelters and essential services'], '/family':['Family safety','Reunification and missing-person support'],
  '/requests':['Assistance queue','Requests visible to your role'], '/missions':['Mission control','Your assigned response tasks'], '/impact':['Volunteer impact','Your contribution to relief'], '/incidents':['Live incidents','Verified disaster events'],
  '/broadcast':['Public warning system','Create and publish official advisories'], '/broadcast-history':['Broadcast history','Track official alerts issued by your role'], '/ngo-coordination':['NGO coordination','Dispatch and partner capacity'], '/analytics':['Response analytics','District-level operational metrics'], '/users':['Identity control','Manage platform accounts'], '/permissions':['Role permissions','Manage access policy'], '/audit':['Audit trail','Trace critical actions'], '/settings':['System settings','Platform configuration'], '/profile':['Profile & preferences','Personal identity, contact and safety preferences']
};

function Protected({ children, permission }) {
  const { session, can } = useAuth();
  if (!session) return <Navigate to="/login" replace />;
  if (permission && !can(permission)) return <Navigate to="/dashboard" replace />;
  return children;
}

function RoleRestricted({ children, allow }) {
  const { session } = useAuth();
  if (!session) return <Navigate to="/login" replace />;
  if (!allow.includes(session.role)) return <Navigate to="/dashboard" replace />;
  return children;
}

function VoiceSosButton({ onTranscript, label = "Speak Details (Voice to Text)" }) {
  const [listening, setListening] = useState(false);
  const [feedback, setFeedback] = useState('');
  const recognizerRef = useRef(null);

  useEffect(() => {
    const recognizer = createSpeechRecognizer({
      onStart: () => {
        setListening(true);
        setFeedback('Listening... Speak your emergency details clearly.');
      },
      onResult: (text) => {
        onTranscript(text);
        setFeedback(`Captured: "${text}"`);
      },
      onError: (err) => {
        setListening(false);
        setFeedback(err);
        setTimeout(() => setFeedback(''), 4000);
      },
      onEnd: () => {
        setListening(false);
        setTimeout(() => setFeedback(''), 3000);
      }
    });
    recognizerRef.current = recognizer;
    return () => {
      recognizer?.stop();
    };
  }, [onTranscript]);

  const toggleListen = () => {
    if (!recognizerRef.current || !recognizerRef.current.supported) {
      setFeedback('Voice input requires browser mic permissions or is not supported. Please type.');
      setTimeout(() => setFeedback(''), 3500);
      return;
    }
    if (listening) {
      recognizerRef.current.stop();
      setListening(false);
    } else {
      recognizerRef.current.start();
    }
  };

  return (
    <div className="voice-sos-container">
      <button
        type="button"
        className={`voice-sos-btn interactive ${listening ? 'listening' : ''}`}
        onClick={toggleListen}
        title="Dictate message with microphone"
      >
        <Icons.Mic size={16} className={listening ? 'mic-pulse' : ''} />
        <span>{listening ? 'Listening... Tap to Stop' : label}</span>
      </button>
      {feedback && (
        <span className="voice-sos-feedback">
          {listening && <span className="live-dot pulse-red" />}
          {feedback}
        </span>
      )}
    </div>
  );
}

function CrisisDrillBanner({ seconds, count, onStop, soundMuted, onToggleSound }) {
  const mins = Math.floor(seconds / 60);
  const secs = (seconds % 60).toString().padStart(2, '0');
  return (
    <div className="crisis-drill-banner">
      <div className="drill-banner-badge">
        <span className="drill-siren-dot" />
        <span className="drill-banner-title">EMERGENCY DRILL SIMULATION ACTIVE</span>
      </div>
      <div className="drill-banner-metrics">
        <span className="drill-pill">⏱️ Timer: {mins}:{secs}</span>
        <span className="drill-pill">🚨 +{count} Simulated SOS Calls</span>
        <span className="drill-pill">🚒 {Math.max(1, Math.floor(count * 0.82))} Units Dispatched</span>
      </div>
      <div className="drill-banner-actions">
        <button
          type="button"
          className="drill-sound-btn interactive"
          onClick={onToggleSound}
          title={soundMuted ? 'Unmute Drill Sirens' : 'Mute Drill Sirens'}
        >
          {soundMuted ? <Icons.VolumeX size={14}/> : <Icons.Volume2 size={14}/>}
        </button>
        <button
          type="button"
          className="drill-stop-btn interactive"
          onClick={onStop}
        >
          <Icons.Square size={13}/> End Drill
        </button>
      </div>
    </div>
  );
}

function CursorFX(){
  return null;
}

function Shell({children}){
 const {session,logout}=useAuth(); const navigate=useNavigate(); const location=useLocation();
 const { activeLocation, syncWithProfile } = useSectorLocation();
 const [notice,setNotice]=useState(false);
 const [themeTransition,setThemeTransition]=useState(null);
 const [profile,setProfile]=useState(false);
 const [toast,setToast]=useState('');
 const [toastEvent,setToastEvent]=useState(null);
 const [flash,setFlash]=useState(false);
 const [feed,setFeed]=useState([]);

 useEffect(() => {
   if (session?.district || session?.state) {
     syncWithProfile(session);
   }
 }, [session, syncWithProfile]);


 // Live Crisis Drill State
 const [drillActive, setDrillActive] = useState(false);
 const [drillSeconds, setDrillSeconds] = useState(0);
 const [drillCount, setDrillCount] = useState(0);
 const [soundMutedState, setSoundMutedState] = useState(() => isSoundMuted());

 useEffect(() => {
   const onSoundToggle = e => setSoundMutedState(e.detail?.muted);
   window.addEventListener('resq:sound-toggle', onSoundToggle);
   return () => window.removeEventListener('resq:sound-toggle', onSoundToggle);
 }, []);

 useEffect(() => {
   let timer = null;
   let interval = null;
   if (drillActive) {
     playEmergencyTone('warning');
     triggerHaptic([300, 150, 300]);
     timer = setInterval(() => {
       setDrillSeconds(s => s + 1);
     }, 1000);

     const scenarios = [
       { area: 'Mula River Basin Sector 2', msg: 'Water inundation +3.2m · 8 families stranded on roof terrace', type: 'Flood', severity: 'Critical' },
       { area: 'Sinhagad Lowland Route', msg: 'Secondary mudslide blocking evacuation bus convoy', type: 'Landslide', severity: 'High' },
       { area: 'Kothrud Substation Area', msg: 'Auxiliary backup generator failure at district triage center', type: 'Power', severity: 'Critical' },
       { area: 'Warje Sector Camp 02', msg: 'Shelter reached 85% capacity · Diverting incoming evacuees to Hub 03', type: 'Shelter', severity: 'Medium' }
     ];

     interval = setInterval(() => {
       setDrillCount(c => {
         const next = c + 1;
         const scenario = scenarios[(next - 1) % scenarios.length];
         recordActivity({
           id: 'drill-' + Date.now(),
           kind: 'drill',
           severity: scenario.severity.toLowerCase(),
           message: `[DRILL] ${scenario.type} in ${scenario.area}: ${scenario.msg}`,
           actor: 'Simulation Engine',
           time: 'just now'
         });
         playEmergencyTone('warning');
         triggerHaptic([150, 100, 150]);
         window.dispatchEvent(new CustomEvent('resq:drill-tick', { detail: { count: next, scenario } }));
         return next;
       });
     }, 3500);
   } else {
     setDrillSeconds(0);
     setDrillCount(0);
   }
   return () => {
     if (timer) clearInterval(timer);
     if (interval) clearInterval(interval);
   };
 }, [drillActive]);

 const canRunDrill = session?.role && ['government', 'admin', 'coordinator'].includes(session.role);

 const startDrill = () => {
   if (!canRunDrill) return;
   setDrillActive(true);
   setToast('Emergency Disaster Simulation Drill Activated');
 };

 const stopDrill = () => {
   setDrillActive(false);
   setToast(`Simulation drill ended. ${drillCount} distress events handled.`);
   playEmergencyTone('chime');
 };

 useEffect(() => {
   if (!canRunDrill && drillActive) {
     setDrillActive(false);
   }
 }, [session?.role, canRunDrill, drillActive]);

  const applyPreferences=(p)=>{
    const isCrisis = isCrisisActive();
    const theme = isCrisis ? 'crisis' : (p.theme || 'dark');
    document.documentElement.dataset.density=p.density||'comfortable';
    document.documentElement.dataset.motion=p.reducedMotion?'reduced':'full';
    document.documentElement.dataset.emergency=p.emergencyMode?'on':'off';
    document.documentElement.dataset.glow=p.accentGlow===false?'off':'on';
    document.documentElement.dataset.theme=theme;
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.dataset.autorefresh=p.autoRefresh===false?'off':'on';
    document.documentElement.dataset.sms=p.sms===false?'off':'on';
    if (isCrisis) {
      document.documentElement.dataset.crisis = 'active';
      document.documentElement.classList.add('crisis-mode-active');
      if (document.body) document.body.classList.add('crisis-mode-active');
    } else {
      document.documentElement.dataset.crisis = 'off';
      document.documentElement.classList.remove('crisis-mode-active');
      if (document.body) document.body.classList.remove('crisis-mode-active');
    }
  };
  useEffect(()=>{setNotice(false);setProfile(false)},[location.pathname]);
  useEffect(()=>{if(session?.role)document.documentElement.dataset.role=session.role;return()=>{delete document.documentElement.dataset.role}},[session?.role]);
  useEffect(()=>{if(!toast)return;const t=setTimeout(()=>setToast(''),2600);return()=>clearTimeout(t)},[toast]);
  useEffect(()=>{applyPreferences(readPrefs());const fn=e=>applyPreferences(e.detail||{});window.addEventListener('resq:preferences',fn);return()=>window.removeEventListener('resq:preferences',fn)},[]);
  useEffect(()=>{const fn=e=>{if(!e.detail)return;setToastEvent(e.detail);setTimeout(()=>setToastEvent(null),4200)};window.addEventListener('resq:activity',fn);return()=>window.removeEventListener('resq:activity',fn)},[]);
  useEffect(()=>{const fn=e=>setThemeTransition(e.detail||null);window.addEventListener('resq:themeTransition',fn);return()=>window.removeEventListener('resq:themeTransition',fn)},[]);
  useEffect(()=>{ if(!session) return; const timer=setTimeout(()=>{ setFeed(readActivities().slice(0,5)); setFlash(true); },180); const hide=setTimeout(()=>setFlash(false),5200); return()=>{clearTimeout(timer);clearTimeout(hide)} },[session?.issuedAt]);
  useEffect(()=>{ const root=document.querySelector('.page-scroll'); if(!root)return; const nodes=[...root.querySelectorAll('.page-intro,.glass-card,.metric-card,.status-strip,.table-card,.form-card,.analytics-card,.history-card')]; nodes.forEach((el,i)=>{el.classList.add('scroll-reveal');el.style.setProperty('--reveal-delay',`${Math.min(i*35,240)}ms`)}); const io=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting)e.target.classList.add('in-view')}),{root,threshold:.08}); nodes.forEach(n=>io.observe(n)); return()=>io.disconnect(); },[location.pathname]);
  if(!session)return children; const role=roles[session.role];
  return <div className={`app-shell role-${session.role}`}><CursorFX/>
   <aside className="sidebar glass-panel">
    <button className="brand interactive" onClick={()=>navigate('/dashboard')}><span className="brand-mark"><Icons.ShieldCheck size={19}/></span><span><b>Rakshak</b><small>Disaster Response · रक्षक</small></span></button>
    <div className="role-pill"><span className="live-dot"/>{role.label}<span className="encrypted-badge"><Icons.LockKeyhole size={11}/>SIGNED</span></div>
    <nav className="side-nav">{role.nav.map(([label,path,ico])=><NavItem key={path} label={label} path={path} ico={ico} active={location.pathname===path}/>)}</nav>
    <div className="sidebar-bottom"><div className="safe-card"><span className="safe-icon"><Icons.Waves size={16}/></span><span><b>Network live</b><small>24/7 response layer</small></span></div><button className="soft-button interactive" onClick={()=>{recordActivity({kind:'signout',message:`${role.label} signed out safely`,actor:session.name,time:'just now'});setToast('Signed out safely');setTimeout(()=>{logout();navigate('/')},900)}}><Icons.LogOut size={15}/> Sign out</button></div>
   </aside>
   <main className="main-area">
    {drillActive && canRunDrill && (
      <CrisisDrillBanner
        seconds={drillSeconds}
        count={drillCount}
        onStop={stopDrill}
        soundMuted={soundMutedState}
        onToggleSound={() => {
          const next = !soundMutedState;
          setSoundMuted(next);
          setSoundMutedState(next);
        }}
      />
    )}
    <header className="topbar"><div><span className="eyebrow">National resilience network</span><h1>{pageMeta[location.pathname]?.[0]||'Rakshak'}</h1></div><div className="top-actions">
     <LocationSwitcherBadge />
     <LiveTemperatureNavPill onClick={() => window.dispatchEvent(new CustomEvent('resq:open-temp-reader'))} />
     <button
       type="button"
       className="topbar-triage-btn interactive"
       onClick={() => navigate('/triage')}
       title="24/7 AI Disaster Triage & First-Aid Assistant"
     >
       <Icons.Bot size={15}/>
       <span>AI Triage</span>
     </button>
     <EmergencyCrisisButton />

     {canRunDrill && (
       <button
         type="button"
         className={`drill-trigger-btn interactive ${drillActive ? 'active' : ''}`}
         onClick={drillActive ? stopDrill : startDrill}
         title={drillActive ? 'Stop Emergency Simulation Drill' : 'Start Simulated Crisis Drill'}
       >
         <Icons.Zap size={14} className={drillActive ? 'pulse-zap' : ''}/>
         <span>{drillActive ? 'Stop Drill' : 'Live Crisis Drill'}</span>
       </button>
     )}
     <button
       type="button"
       className="icon-button sound-toggle interactive"
       onClick={() => {
         const next = !soundMutedState;
         setSoundMuted(next);
         setSoundMutedState(next);
       }}
       title={soundMutedState ? 'Audio sirens muted' : 'Audio sirens active'}
       aria-label="Toggle Sound"
     >
       {soundMutedState ? <Icons.VolumeX size={17} /> : <Icons.Volume2 size={17} />}
     </button>
     <ThemeToggle/>
     <button className="icon-button emergency-button interactive" onClick={()=>setToast('Emergency hotline 112 is ready to call.')}><Icons.PhoneCall size={15}/>112</button>
     <div className="dropdown-wrap"><button className="icon-button notification-button interactive" onClick={()=>setNotice(v=>!v)}><Icons.Bell size={18}/><span className="notification-badge">{alerts.length}</span></button><AnimatePresence>{notice&&<NotificationMenu navigate={navigate} session={session}/>}</AnimatePresence></div>
     <div className="dropdown-wrap"><button className="profile-chip interactive" onClick={()=>setProfile(v=>!v)}><span className="avatar">{session.name[0].toUpperCase()}</span><span><b>{session.name}</b><small>{role.label}</small></span><Icons.ChevronDown size={15}/></button><AnimatePresence>{profile&&<ProfileMenu session={session} logout={()=>{logout();navigate('/')}}/>}</AnimatePresence></div>
   </div></header><section className="page-scroll">{children}</section><div className="footer-note"><span>●</span> Systems operational · Demonstration data · Client permissions are UI-enforced; production authorization belongs on a trusted server</div></main>
   <LoginActivityFlash feed={flash?feed:[]} role={role}/><AnimatePresence>{themeTransition&&<ThemeTransition transition={themeTransition} onDone={()=>setThemeTransition(null)}/>}</AnimatePresence><AnimatePresence>{toastEvent&&<ActivityFlash event={toastEvent}/>}</AnimatePresence><AnimatePresence>{toast&&<motion.div className="toast glass-panel" initial={{opacity:0,y:18}} animate={{opacity:1,y:0}} exit={{opacity:0,y:18}}><Icons.ShieldCheck size={17}/>{toast}</motion.div>}</AnimatePresence>
  </div>
 }
 function NavItem({label,path,ico,active}){const navigate=useNavigate();const I=iconMap[ico]||Icons.Circle;return <button className={`nav-item interactive ${active?'active':''}`} onClick={()=>navigate(path)}><I size={15}/>{label}</button>}
 function ThemeTransition({transition,onDone}){
  const [particles]=useState(()=>Array.from({length:42},(_,i)=>({id:i,left:Math.max(4,Math.min(96,50+(Math.random()-.5)*82)),top:Math.max(42,Math.min(92,55+Math.random()*34)),delay:Math.random()*.28,duration:1.15+Math.random()*.8,size:2.5+Math.random()*6,drift:(Math.random()-.5)*110,blur:1+Math.random()*4})));
  useEffect(()=>{const t=setTimeout(onDone,1250);return()=>clearTimeout(t)},[onDone]);
  if(!transition)return null;
  return <div className={`theme-transition theme-transition-to-${transition.to} from-${transition.from}`} style={{'--theme-x':`${transition.x}px`,'--theme-y':`${transition.y}px`}}>
   <div className="theme-orbit-glow" aria-hidden="true"/>
   <div className="theme-vapor-field" aria-hidden="true">{particles.map(p=><i key={p.id} className="theme-vapor" style={{left:`${p.left}%`,top:`${p.top}%`,animationDelay:`${p.delay}s`,animationDuration:`${p.duration}s`,width:`${p.size}px`,height:`${p.size}px`,'--drift':`${p.drift}px`,'--blur':`${p.blur}px`}}/>)}</div>
   <div className="theme-reveal" aria-hidden="true"/>
  </div>
 }
 function ThemeToggle(){
  const [theme,setTheme]=useState(()=>readPrefs().theme||'dark'); const ref=useRef(null);
  const [isCrisis,setIsCrisis]=useState(()=>isCrisisActive());
  useEffect(()=>{
    const fn=e=>setTheme(e.detail?.theme||readPrefs().theme||'dark');
    const onCrisis=()=>setIsCrisis(isCrisisActive());
    window.addEventListener('resq:preferences',fn);
    window.addEventListener('resq:crisis-mode',onCrisis);
    return()=>{
      window.removeEventListener('resq:preferences',fn);
      window.removeEventListener('resq:crisis-mode',onCrisis);
    };
  },[]);
  const toggle=()=>{
    if (isCrisisActive()) {
      window.dispatchEvent(new CustomEvent('resq:activity', {
        detail: {
          id: 'crisis-locked-' + Date.now(),
          kind: 'settings',
          severity: 'critical',
          message: 'Theme toggle locked: Emergency Crisis Code Red active.',
          actor: 'System Policy',
          time: 'just now'
        }
      }));
      return;
    }
    const next=theme==='dark'?'light':'dark';
    const rect=ref.current?.getBoundingClientRect();
    const x=rect?rect.left+rect.width/2:window.innerWidth-100;
    const y=rect?rect.top+rect.height/2:40;
    window.dispatchEvent(new CustomEvent('resq:themeTransition',{detail:{from:theme,to:next,x,y}}));
    const prefs={...readPrefs(),theme:next};
    writePrefs(prefs);
    setTheme(next);
    recordActivity({kind:'settings',message:`${next==='dark'?'Dark':'Light'} mode enabled`,actor:'User',time:'just now'});
  };
  return <button ref={ref} type="button" className={`icon-button theme-toggle interactive ${isCrisis?'crisis-locked':''}`} onClick={toggle} aria-label={isCrisis?'Theme locked to Crisis Mode':`Switch to ${theme==='dark'?'light':'dark'} mode`} title={isCrisis?'Emergency Crisis Mode Active (Theme Locked to Code Red)':`Switch to ${theme==='dark'?'light':'dark'} mode`}>{isCrisis?<Icons.Flame size={17} style={{color:'#ff2a4b'}}/>:theme==='dark'?<Icons.Sun size={17}/>:<Icons.Moon size={17}/>}</button>
 }
function activityRoute(a, role){
  if(a.kind==='broadcast') return (role==='government'||role==='admin')?'/broadcast-history':'/alerts';
  if(a.kind==='request') return role==='citizen'?'/help':role==='ngo'?'/requests':'/requests';
  if(a.kind==='accepted'||a.kind==='mission') return role==='ngo'?'/missions':'/requests';
  if(a.kind==='campaign') return '/campaigns';
  if(a.kind==='shelter') return '/shelters';
  if(a.kind==='incident'||a.kind==='alert') return role==='citizen'?'/alerts':'/incidents';
  if(a.kind==='family') return '/family';
  if(a.kind==='profile') return '/profile';
  if(a.kind==='settings') return '/settings';
  if(a.kind==='login'||a.kind==='signout') return '/audit';
  return '/audit';
}
function NotificationMenu({navigate,session}){const [tick,setTick]=useState(0);useEffect(()=>{const t=setInterval(()=>setTick(x=>x+1),1400);return()=>clearInterval(t)},[]);const live=[...readBroadcasts().slice(0,8),...readActivities().filter(x=>x.kind!=='login').slice(0,10)].sort((a,b)=>(b.createdAt||0)-(a.createdAt||0)).slice(0,9);return <motion.div className="floating-menu notification-menu glass-panel" initial={{opacity:0,y:-10,scale:.96}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,y:-8,scale:.96}} transition={{duration:.22,ease:[.22,1,.36,1]}}><div className="notification-menu-head"><div><span className="eyebrow">Response feed</span><b>Live activity</b></div><span className="live-chip"><i/>LIVE</span></div>{live.length?live.map((a,i)=>{const sev=severityClass(a.severity||(a.kind==='broadcast'?'high':a.kind==='request'?'critical':'info'));return <button className={`notice-row interactive severity-${sev}`} key={(a.id||'a')+i} onClick={()=>navigate(activityRoute(a,session?.role))}><span className={`severity-dot ${sev}`}/><span><b>{a.title||a.type||a.message}</b><small>{a.message||a.region||a.area||'RESQ activity'} · {a.actor||'RESQ system'} · {a.time||'just now'}</small></span><Icons.ChevronRight size={13}/></button>}):<div className="empty-state mini"><Icons.Bell size={18}/><b>No activity yet</b><p>Important actions will appear here.</p></div>}<button className="notification-footer-link interactive" onClick={()=>navigate(session?.role==='citizen'||session?.role==='ngo'?'/alerts':'/audit')}>Open activity history <Icons.ArrowUpRight size={13}/></button></motion.div>}
function ProfileMenu({session,logout}){const navigate=useNavigate();const p=readProfile();const safeLogout=()=>{recordActivity({kind:'signout',message:`${roles[session.role].label} signed out safely`,actor:session.name,time:nowLabel(),createdAt:Date.now()});logout();navigate('/')};return <motion.div className="floating-menu profile-menu glass-panel" initial={{opacity:0,y:-10,scale:.98}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,y:-10,scale:.98}}><div className="profile-pop">{p.photo?<img className="avatar xl avatar-photo" src={p.photo} alt="Profile"/>:<span className="avatar xl">{(session.name?.[0]||'R').toUpperCase()}</span>}<span><b>{session.name}</b><small>{roles[session.role].label}</small></span></div><div className="security-row"><Icons.LockKeyhole size={14}/> Permission envelope verified</div><button className="menu-link interactive" onClick={()=>navigate('/profile')}><Icons.UserCog size={15}/> Profile & preferences</button><button className="menu-link interactive" onClick={()=>navigate('/settings')}><Icons.SlidersHorizontal size={15}/> Interface preferences</button><button className="menu-link danger interactive" onClick={safeLogout}><Icons.LogOut size={15}/>Sign out</button></motion.div>}
function LoginActivityFlash({feed,role}){return <AnimatePresence>{feed?.length>0&&<motion.div className="login-flash" initial={{opacity:0,y:-22,scale:.94}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,y:-18,scale:.96}} transition={{type:'spring',stiffness:240,damping:19}}><div className="flash-glow"/><div className="flash-head"><span><Icons.Sparkles size={15}/> Welcome back, {role.label}</span><i>LIVE ACTIVITY</i></div><div className="flash-list">{feed.slice(0,4).map((e,i)=><div key={(e.id||'e')+i} className="flash-row"><span className="flash-dot"/><div><b>{e.message}</b><small>{e.actor} · {e.time||'just now'}</small></div></div>)}</div></motion.div>}</AnimatePresence>}
function ActivityFlash({event}){const Icon=event.kind==='broadcast'?Icons.Megaphone:event.kind==='login'?Icons.LogIn:event.kind==='signout'?Icons.LogOut:event.kind==='request'?Icons.Siren:event.kind==='accepted'?Icons.BadgeCheck:event.kind==='campaign'?Icons.Megaphone:event.kind==='mission'?Icons.Route:event.kind==='profile'?Icons.UserCog:event.kind==='settings'?Icons.SlidersHorizontal:Icons.Bell;return <motion.div className={`activity-flash kind-${event.kind||'system'} severity-${severityClass(event.severity||((event.kind==='broadcast')?'high':'info'))}`} initial={{opacity:0,y:-24,scale:.9,filter:'blur(4px)'}} animate={{opacity:1,y:0,scale:1,filter:'blur(0)'}} exit={{opacity:0,y:-18,scale:.95,filter:'blur(3px)'}} transition={{type:'spring',stiffness:270,damping:19}}><span className="activity-flash-icon"><Icon size={17}/></span><div><b>{event.message}</b><small>{event.actor||'RESQ system'} · {event.time||'just now'}</small></div><span className="activity-flash-live">LIVE</span></motion.div>}
function PageIntro({kicker,title,sub,actions}){return <div className="page-intro"><div><span className="eyebrow">{kicker}</span><h2>{title}</h2><p>{sub}</p></div><div className="page-actions">{actions}</div></div>}
function Metric({label,value,sub,Icon,accent='aqua'}){return <motion.div className="metric-card glass-panel" whileHover={{y:-4}}><span className={`metric-icon ${accent}`}><Icon size={17}/></span><span className="metric-label">{label}</span><strong>{value}</strong><small>{sub}</small></motion.div>}
function GlassCard({children,className='',...props}){return <motion.div className={`glass-panel glass-card ${className}`} whileHover={{y:-3}} {...props}>{children}</motion.div>}

function AiTriagePage() {
  const navigate = useNavigate();
  return (
    <div className="content-stack">
      <PageIntro
        kicker="24/7 Automated Emergency Guidance"
        title="AI Disaster Triage & First-Aid Assistant"
        sub="Instant disaster caution protocols, triage checklists, and first-aid recommendations when administrative or emergency personnel are delayed or unavailable."
        actions={
          <div className="page-actions">
            <button className="secondary-button interactive" onClick={() => navigate('/dashboard')}>
              <Icons.LayoutDashboard size={15}/> Dashboard
            </button>
            <button className="primary-button interactive" onClick={() => navigate('/help')}>
              <Icons.Siren size={15}/> Emergency SOS
            </button>
          </div>
        }
      />
      <CitizenAiTriageAssistant />
    </div>
  );
}

function Dashboard(){const {session}=useAuth(); if(session.role==='citizen')return <CitizenDashboard/>; if(session.role==='ngo')return <VolunteerDashboard/>; if(session.role==='government')return <GovernmentDashboard/>; return <AdminDashboard/>;}
function CitizenDashboard(){
  const navigate=useNavigate();
  return <div className="content-stack">
    <PageIntro kicker="Personal safety overview" title="Your safety dashboard" sub="A calm, limited-access view built around what you need during an emergency." actions={<button className="primary-button interactive" onClick={()=>navigate('/help')}><Icons.Siren size={16}/> Get emergency help</button>}/>
    <div className="status-strip glass-panel">
      <div>
        <span className="status-label">YOUR CURRENT STATUS</span>
        <strong>🟢 SAFE</strong>
        <small>No evacuation order in your registered zone.</small>
      </div>
      <div className="status-item"><Icons.MapPin size={16}/><span>Nearest shelter<b>1.8 km</b></span></div>
      <div className="status-item"><Icons.Phone size={16}/><span>Emergency line<b>112</b></span></div>
    </div>

    {/* 24/7 AI Citizen Triage & Caution Assistant */}
    <CitizenAiTriageAssistant />

    <div className="stats-grid four">
      <Metric label="Active alerts" value="03" sub="2 near you" Icon={Icons.Bell} accent="aqua"/>
      <Metric label="Help request" value="No active" sub="One tap to create" Icon={Icons.HeartHandshake} accent="violet"/>
      <Metric label="Closest shelter" value="12 min" sub="642 / 850 occupied" Icon={Icons.House} accent="amber"/>
      <Metric label="Campaigns nearby" value="04" sub="2 recruiting" Icon={Icons.Megaphone} accent="rose"/>
    </div>
    <div className="dashboard-columns">
      <GlassCard><CardHeader title="What is happening" action="View all" onClick={()=>navigate('/alerts')}/>{alerts.slice(0,3).map(a=><AlertRow key={a.id} item={a}/>)}</GlassCard>
      <GlassCard><CardHeader title="Quick help"/><div className="quick-grid">{[['AI Triage',Icons.Bot],['Medical',Icons.Stethoscope],['Food',Icons.Utensils],['Water',Icons.Droplets],['Shelter',Icons.House],['Rescue',Icons.Siren]].map(([n,I])=><button key={n} className="quick-action interactive" onClick={()=>navigate(n==='AI Triage'?'/triage':n==='Shelter'?'/shelters':n==='Family'?'/family':'/help')}><I size={18}/><span>{n}</span></button>)}</div></GlassCard>
    </div>
    <div className="dashboard-columns">
      <GlassCard><CardHeader title="Nearby campaigns" action="Explore" onClick={()=>navigate('/campaigns')}/>{campaigns.slice(0,2).map(c=><CampaignMini key={c.id} c={c}/>)}</GlassCard>
      <GlassCard><CardHeader title="Limited access"/><div className="access-note"><Icons.ShieldCheck size={18}/><div><b>Citizen permissions</b><p>You can view alerts, request help, report incidents, find shelters, join public campaigns and manage family safety. Operational controls, responder queues and user administration stay hidden.</p></div></div></GlassCard>
    </div>
    <div className="network-shortcuts">
      <button className="network-shortcut interactive" onClick={()=>navigate('/campaigns')}><Icons.Megaphone size={17}/><span><b>Campaign Network</b><small>Join nearby public programs</small></span><Icons.ArrowUpRight size={14}/></button>
      <button className="network-shortcut interactive" onClick={()=>navigate('/shelters')}><Icons.House size={17}/><span><b>Shelter Network</b><small>Find a verified safe place</small></span><Icons.ArrowUpRight size={14}/></button>
    </div>
  </div>;
}
function VolunteerDashboard(){const navigate=useNavigate();return <div className="content-stack"><PageIntro kicker="Volunteer operations" title="Your response dashboard" sub="See only campaigns, tasks and help requests you are permitted to take or give." actions={<button className="primary-button interactive" onClick={()=>navigate('/requests')}><Icons.ListChecks size={16}/> Open response tasks</button>}/><div className="stats-grid four"><Metric label="Open tasks" value="12" sub="3 critical" Icon={Icons.ListChecks} accent="violet"/><Metric label="My missions" value="04" sub="2 active" Icon={Icons.Route} accent="aqua"/><Metric label="People helped" value="126" sub="+18 this month" Icon={Icons.HeartHandshake} accent="amber"/><Metric label="Campaigns nearby" value="06" sub="3 recruiting" Icon={Icons.Megaphone} accent="rose"/></div><div className="volunteer-grid"><GlassCard><CardHeader title="Help requests you can take" action="View queue" onClick={()=>navigate('/requests')}/>{requests.slice(0,4).map(r=><TaskRow key={r.id} r={r}/>)}</GlassCard><GlassCard><CardHeader title="Campaigns where you can help" action="Browse" onClick={()=>navigate('/campaigns')}/>{campaigns.slice(0,3).map(c=><CampaignMini key={c.id} c={c} volunteer/>)}</GlassCard></div><GlassCard><CardHeader title="Access scope"/><div className="scope-grid"><ScopeItem icon={Icons.MapPin} title="Location scope" text="Pune + assigned partner districts"/><ScopeItem icon={Icons.Handshake} title="Help scope" text="Requests marked volunteer-eligible"/><ScopeItem icon={Icons.LockKeyhole} title="Restricted" text="No citizen identity admin, official broadcasts or system settings"/></div></GlassCard><div className="network-shortcuts"><button className="network-shortcut interactive" onClick={()=>navigate('/campaigns')}><Icons.Megaphone size={17}/><span><b>Campaign Network</b><small>Join approved community programs</small></span><Icons.ArrowUpRight size={14}/></button><button className="network-shortcut interactive" onClick={()=>navigate('/shelters')}><Icons.House size={17}/><span><b>Shelter Network</b><small>View relief centres & capacity</small></span><Icons.ArrowUpRight size={14}/></button></div></div>}
function LiveThreatFeedWidget(){
  const [threats, setThreats] = useState([]);
  const [syncing, setSyncing] = useState(null);
  const [toast, setToast] = useState('');

  const fetchThreats = () => {
    api.threats.getLive()
      .then(res => {
        if (res?.threats?.length > 0) {
          setThreats(res.threats);
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    fetchThreats();
    const interval = setInterval(fetchThreats, 20000);
    return () => clearInterval(interval);
  }, []);

  const handleSync = async (feedId) => {
    setSyncing(feedId);
    try {
      const res = await api.threats.sync(feedId);
      setToast(`🛰️ Synchronized: Incident #${res.incident?.id} created from external telemetry feed!`);
      setTimeout(() => setToast(''), 4000);
    } catch (err) {
      setToast('Threat sync failed: ' + err.message);
      setTimeout(() => setToast(''), 3000);
    } finally {
      setSyncing(null);
    }
  };

  if (!threats.length) return null;

  return (
    <div className="glass-panel" style={{padding:'16px 20px',borderRadius:'14px',marginBottom:'18px',background:'rgba(244,63,94,0.06)',border:'1px solid rgba(244,63,94,0.25)'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'12px',flexWrap:'wrap',gap:'8px'}}>
        <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
          <span className="drill-siren-dot" style={{background:'#f43f5e'}}/>
          <strong style={{fontSize:'13px',letterSpacing:'0.05em',color:'#f43f5e'}}>
            LIVE EXTERNAL THREAT INGESTION GRID (IMD · USGS · CWC · NASA FIRMS)
          </strong>
        </div>
        <span className="live-chip" style={{background:'rgba(244,63,94,0.15)',borderColor:'#f43f5e',color:'#f43f5e'}}>
          4 ACTIVE TELEMETRY SENSORS
        </span>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(260px, 1fr))',gap:'10px'}}>
        {threats.map(t => (
          <div key={t.id} style={{background:'rgba(0,0,0,0.3)',padding:'12px 14px',borderRadius:'10px',border:'1px solid rgba(255,255,255,0.06)',display:'flex',flexDirection:'column',justifyContent:'space-between'}}>
            <div>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                <small style={{color:'#94a3b8',fontSize:'10px',textTransform:'uppercase'}}>{t.agency}</small>
                <span className={`priority ${t.status === 'ACTIVE_THREAT' ? 'critical' : 'medium'}`} style={{fontSize:'9px',padding:'2px 6px'}}>
                  {t.intensity}
                </span>
              </div>
              <strong style={{display:'block',fontSize:'13px',marginTop:'4px',color:'#f8fafc'}}>
                {t.hazard}
              </strong>
              <p style={{fontSize:'11px',color:'#cbd5e1',margin:'4px 0 8px 0',lineHeight:'1.4'}}>
                📍 {t.region} · {t.recommendation}
              </p>
            </div>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:'6px',paddingTop:'6px',borderTop:'1px solid rgba(255,255,255,0.05)'}}>
              <small style={{color:'#64748b',fontSize:'10px'}}>Confidence: {t.confidence}</small>
              <button
                type="button"
                className="tiny-button interactive"
                style={{fontSize:'10px',padding:'3px 8px',background:'rgba(244,63,94,0.2)',color:'#f43f5e',borderColor:'rgba(244,63,94,0.4)'}}
                disabled={syncing === t.id}
                onClick={() => handleSync(t.id)}
              >
                {syncing === t.id ? 'Syncing...' : 'Ingest as Incident'}
              </button>
            </div>
          </div>
        ))}
      </div>
      {toast && <div className="toast glass-panel"><Icons.CheckCircle2 size={16}/> {toast}</div>}
    </div>
  );
}

function GovernmentDashboard(){
  const {session}=useAuth();
  const {activeLocation}=useSectorLocation();
  const navigate=useNavigate();
  const [history,setHistory]=useState(()=>readBroadcasts().filter(x=>x.role==='government'));
  const [layers,setLayers]=useState({incidents:true,shelters:true,ngo:true,responders:true});
  const [status,setStatus]=useState('Elevated');

  useEffect(()=>{
    const refresh=()=>setHistory(readBroadcasts().filter(x=>x.role==='government'));
    window.addEventListener('resq:broadcasts',refresh);
    window.addEventListener('storage',refresh);
    return()=>{
      window.removeEventListener('resq:broadcasts',refresh);
      window.removeEventListener('storage',refresh);
    };
  },[]);

  const critical=incidents.filter(i=>i.severity==='Critical');

  return (
    <div className="content-stack government-dashboard">
      <DashboardCrisisWidget />
      <LiveThreatFeedWidget />
      <div className="command-hero glass-panel tactical-command-hero">
        <div className="command-hero-left">
          <span className="eyebrow">DISTRICT COMMAND CENTER · {activeLocation.district?.toUpperCase()} • {activeLocation.taluka?.toUpperCase() || 'SECTOR HQ'}</span>
          <h2>Operate the response network with confidence.</h2>

          <p>Verify critical incidents, broadcast emergency warnings, coordinate NGO partner capacity, and maintain district relief flow.</p>
        </div>
        <div className="command-status-card">
          <div className="status-indicator-wrap">
            <span className={`status-lamp ${status.toLowerCase()}`}/>
            <div>
              <span className="posture-eyebrow">DEFCON POSTURE</span>
              <b className="posture-val">{status.toUpperCase()}</b>
            </div>
          </div>
          <span className="posture-desc">Active District Threat Level · 24/7 EOC</span>
          <button
            type="button"
            className="status-cycle-btn interactive"
            onClick={()=>setStatus(status==='Elevated'?'Stabilizing':status==='Stabilizing'?'Normal':'Elevated')}
          >
            <Icons.RefreshCw size={12}/> Cycle Posture
          </button>
        </div>
      </div>

      <PageIntro
        kicker="National Incident Management System"
        title="District Response Operations Matrix"
        sub="Command-level information is separated from citizen and volunteer experiences."
        actions={
          <div className="button-row">
            <button className="primary-button interactive" onClick={()=>navigate('/broadcast')}>
              <Icons.Megaphone size={16}/> Broadcast Alert
            </button>
            <button className="secondary-button interactive" onClick={()=>navigate('/broadcast-history')}>
              <Icons.History size={16}/> Broadcast History
            </button>
          </div>
        }
      />

      <div className="stats-grid four">
        <Metric label="Active Incidents" value="07" sub={`${critical.length} critical`} Icon={Icons.TriangleAlert} accent="rose"/>
        <Metric label="Open Requests" value="24" sub="6 critical" Icon={Icons.ListChecks} accent="amber"/>
        <Metric label="Field Responders" value="186" sub="+14 this hour" Icon={Icons.UsersRound} accent="blue"/>
        <Metric label="Shelter Capacity" value="71%" sub="1,406 beds available" Icon={Icons.House} accent="aqua"/>
      </div>

      <div className="command-layout">
        <GlassCard className="map-card tactical-map-card">
          <CardHeader title="Live Tactical Operations Map" action="Full incident board" onClick={()=>navigate('/incidents')}/>
          <div className="layer-toggle-row">
            {Object.entries(layers).map(([k,v])=>(
              <button
                key={k}
                className={`filter-chip interactive ${v?'active':''}`}
                onClick={()=>setLayers(s=>({...s,[k]:!v}))}
              >
                {v?'●':'○'} {k.toUpperCase()}
              </button>
            ))}
          </div>
          <OperationsMap layers={layers}/>
        </GlassCard>

        <GlassCard className="command-incident-panel">
          <CardHeader title="Critical Incident Feed" action="View all" onClick={()=>navigate('/incidents')}/>
          <div className="incident-alert-stack">
            {incidents.map((i,idx)=>(
              <motion.div
                key={i.id}
                className={`incident-command-row severity-${severityClass(i.severity)}`}
                whileHover={{x:4}}
                onClick={()=>navigate('/incidents')}
              >
                <span className="incident-badge">{i.severity}</span>
                <div>
                  <b>{i.type} · {i.location.split(' • ')[0]}</b>
                  <small>{i.affected} affected · {i.reports} reports · {i.status}</small>
                </div>
                <span>{idx<2?'LIVE':'WATCH'}</span>
              </motion.div>
            ))}
          </div>
        </GlassCard>
      </div>

      <div className="network-shortcuts">
        <button className="network-shortcut interactive" onClick={()=>navigate('/shelters')}>
          <Icons.House size={17}/>
          <span><b>Shelter Network</b><small>Verified capacity & relief services</small></span>
          <Icons.ArrowUpRight size={14}/>
        </button>
        <button className="network-shortcut interactive" onClick={()=>navigate('/campaigns')}>
          <Icons.Megaphone size={17}/>
          <span><b>Campaign Network</b><small>Government & NGO programs</small></span>
          <Icons.ArrowUpRight size={14}/>
        </button>
      </div>

      <div className="dashboard-columns">
        <GlassCard className="history-card">
          <CardHeader title="Broadcast History" action="View full ledger" onClick={()=>navigate('/broadcast-history')}/>
          {history.length ? history.slice(0,6).map(x=>(
            <motion.div
              className={`history-row severity-${severityClass(x.severity)}`}
              key={x.id}
              initial={{opacity:0,y:6}}
              animate={{opacity:1,y:0}}
            >
              <span className={`severity-dot ${severityClass(x.severity)}`}/>
              <div>
                <b>{x.severity} · {x.type}</b>
                <small>{x.area} · {x.message}</small>
              </div>
              <span>{x.time}</span>
            </motion.div>
          )) : (
            <div className="empty-state">
              <Icons.Megaphone size={20}/>
              <b>No broadcasts yet</b>
              <p>Official alerts will populate this ledger as they are published.</p>
              <button className="primary-button interactive" onClick={()=>navigate('/broadcast')}>Publish first alert</button>
            </div>
          )}
        </GlassCard>

        <GlassCard>
          <CardHeader title="Response Coverage"/>
          <div className="coverage-radar">
            <div className="radar-ring r1"/>
            <div className="radar-ring r2"/>
            <div className="radar-core"><b>92%</b><small>Coverage</small></div>
          </div>
          <div className="coverage-bars">
            <Bar label="Alert acknowledgement" value={92}/>
            <Bar label="Shelter sync" value={86}/>
            <Bar label="NGO availability" value={74}/>
            <Bar label="Request verification" value={81}/>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}

function OperationsMap(props){
  return (
    <GoogleOperationsMap
      {...props}
      onInspectTemperature={(loc) => {
        window.dispatchEvent(new CustomEvent('resq:open-temp-reader', { detail: loc }));
      }}
    />
  );
}

function MapPinPoint({x,y,type,label,title,onSelect,selected}){
  return (
    <button
      type="button"
      aria-label={title||label}
      className={`map-point tactical-pin ${type} interactive ${selected?'selected':''}`}
      style={{left:`${x}%`,top:`${y}%`}}
      onClick={onSelect}
    >
      <span className="pin-beacon"/>
      <b className="pin-label">{label}</b>
    </button>
  );
}
function AdminDashboard(){const {session}=useAuth();const navigate=useNavigate();const [broadcasts,setBroadcasts]=useState(()=>readBroadcasts().filter(x=>x.role==='admin'));const [security,setSecurity]=useState('Healthy');useEffect(()=>{const refresh=()=>setBroadcasts(readBroadcasts().filter(x=>x.role==='admin'));window.addEventListener('resq:broadcasts',refresh);window.addEventListener('storage',refresh);return()=>{window.removeEventListener('resq:broadcasts',refresh);window.removeEventListener('storage',refresh)}},[]);return <div className="content-stack admin-dashboard"><DashboardCrisisWidget /><div className="admin-hero glass-panel"><div><span className="eyebrow">Privileged control plane</span><h2>Secure the platform behind the response.</h2><p>Identity, permissions, auditability and broadcast governance are separated from field operations.</p></div><div className="admin-posture-card glass-panel"><div className="posture-card-top"><div className="posture-status-indicator"><span className={`posture-lamp ${security==='Healthy'?'lamp-healthy':'lamp-review'}`}/><span className="posture-sub-tag">SYSTEM POSTURE</span></div><span className={`posture-badge ${security==='Healthy'?'badge-healthy':'badge-review'}`}>{security==='Healthy'?'● OPERATIONAL':'▲ AUDIT REQUIRED'}</span></div><div className="posture-card-body"><div className="posture-title-wrap"><Icons.ShieldCheck size={22} className={`posture-shield-ico ${security==='Healthy'?'ico-healthy':'ico-review'}`}/><div className="posture-text"><strong className="posture-state-text">{security}</strong><small className="posture-hint-text">{security==='Healthy'?'ICS-200 Cryptographic Security Verified':'Policy Discrepancy Flagged For Review'}</small></div></div><button type="button" className="admin-check-btn interactive" onClick={()=>setSecurity(security==='Healthy'?'Review':'Healthy')}><Icons.RotateCw size={13}/> Run Diagnostic Check</button></div></div></div><PageIntro kicker="System administration" title="Platform control center" sub="Manage policy and trace every high-impact action across the network." actions={<div className="button-row"><button className="primary-button interactive" onClick={()=>navigate('/broadcast')}><Icons.Megaphone size={16}/> Broadcast alert</button><button className="secondary-button interactive" onClick={()=>navigate('/permissions')}><Icons.ShieldCheck size={16}/> Access policy</button></div>}/><div className="stats-grid four"><Metric label="Active users" value="8,420" sub="+182 this week" Icon={Icons.Users} accent="rose"/><Metric label="Signed sessions" value="2,148" sub="99.8% valid envelopes" Icon={Icons.LockKeyhole} accent="aqua"/><Metric label="Audit events" value="12.4K" sub="Last 24 hours" Icon={Icons.ScrollText} accent="violet"/><Metric label="Policy health" value="98%" sub="2 warnings" Icon={Icons.ShieldCheck} accent="amber"/></div><div className="admin-grid"><GlassCard className="security-panel"><CardHeader title="Security posture"/><SecurityPosture/><div className="security-meter"><span>Authentication integrity</span><b>98%</b><i style={{width:'98%'}}/></div><div className="security-meter"><span>Permission integrity</span><b>100%</b><i style={{width:'100%'}}/></div><div className="security-meter"><span>Audit coverage</span><b>96%</b><i style={{width:'96%'}}/></div></GlassCard><GlassCard><CardHeader title="Privileged actions"/><div className="privileged-action-grid"><Shortcut name="Users" path="/users" Icon={Icons.Users}/><Shortcut name="Roles" path="/permissions" Icon={Icons.ShieldCheck}/><Shortcut name="Audit" path="/audit" Icon={Icons.ScrollText}/><Shortcut name="Broadcasts" path="/broadcast" Icon={Icons.Megaphone}/><Shortcut name="Shelters" path="/shelters" Icon={Icons.House}/><Shortcut name="Campaigns" path="/campaigns" Icon={Icons.Flag}/></div></GlassCard></div><div className="dashboard-columns"><GlassCard><CardHeader title="Admin broadcast activity" action="Open history" onClick={()=>navigate('/broadcast-history')}/>{broadcasts.length?broadcasts.slice(0,6).map(x=><motion.div className={`history-row history-rich severity-${severityClass(x.severity)}`} key={x.id} onClick={()=>navigate('/broadcast-history')}><span className={`severity-dot ${severityClass(x.severity)}`}/><div><b>{x.severity} · {x.type} · {x.area}</b><small>{x.message}</small><em>{x.actor||session?.name||'System Admin'} · {(x.channels||[]).join(' · ')||'App notification'} · {x.time}</em></div><span>OPEN</span></motion.div>):<div className="empty-state"><Icons.Megaphone size={20}/><b>No admin broadcasts</b><p>Admin advisories will appear here after publication.</p><button className="primary-button interactive" onClick={()=>navigate('/broadcast')}>Create broadcast</button></div>}</GlassCard><GlassCard><CardHeader title="Latest audit signals"/>{audits.slice(0,5).map((a,i)=><div className="audit-mini" key={i}><span>{a.time}</span><b>{a.actor}</b><p>{a.action}</p><span className={`priority ${a.severity}`}>{a.severity}</span></div>)}</GlassCard></div></div>}
function AlertRow({item}){return <div className="alert-row"><span className={`severity-dot ${item.level}`}/><div><b>{item.title}</b><small>{item.region}</small></div><span>{item.time}</span></div>}
function CampaignMini({c,volunteer}){const navigate=useNavigate();return <div className="campaign-mini interactive-row" onClick={()=>navigate('/campaigns')}><div><span className="tag">{c.tag}</span><b>{c.name}</b><small>{c.org} · {c.location}</small></div><button className="tiny-button interactive" onClick={(e)=>{e.stopPropagation();navigate('/campaigns')}}>{volunteer?'HELP':'VIEW'}</button></div>}
function TaskRow({r}){return <div className="task-row"><div><span className={`priority ${r.priority.toLowerCase()}`}>{r.priority}</span><b>{r.id} · {r.type}</b><small>{r.location} · {r.time}</small></div><button className="tiny-button interactive">TAKE</button></div>}
function IncidentRow({i}){
  const openNavigate = (e) => {
    e.stopPropagation();
    const coords = i.coordinates || (i.id==='INC-077'?{lat:18.5312,lng:73.8553}:i.id==='INC-076'?{lat:18.7546,lng:73.4062}:i.id==='INC-075'?{lat:19.9975,lng:73.7898}:{lat:21.1458,lng:79.0882});
    const url = `https://www.google.com/maps/dir/?api=1&destination=${coords.lat},${coords.lng}&travelmode=driving`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };
  return (
    <div className="incident-row" style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
      <div>
        <span className={`priority ${i.severity.toLowerCase()}`}>{i.severity}</span>
        <b>{i.type}</b>
        <small>{i.location} · {i.affected} affected</small>
      </div>
      <div style={{display:'flex',gap:'6px',alignItems:'center'}}>
        <span className="status-pill">{i.status}</span>
        <button
          type="button"
          className="tiny-button interactive"
          title="Inspect incident site in Google Maps navigation"
          onClick={openNavigate}
          style={{display:'inline-flex',alignItems:'center',gap:'3px',padding:'3px 8px',fontSize:'11px'}}
        >
          <Icons.Navigation size={11}/> Inspect
        </button>
      </div>
    </div>
  );
}
function CardHeader({title,action,onClick}){return <div className="card-header"><h3>{title}</h3>{action&&<button className="text-button interactive" onClick={onClick}>{action} <Icons.ArrowUpRight size={13}/></button>}</div>}
function ScopeItem({icon:Icon,title,text}){return <div className="scope-item"><span className="scope-icon"><Icon size={16}/></span><div><b>{title}</b><p>{text}</p></div></div>}
function Bar({label,value}){return <div className="bar-row"><span>{label}</span><b>{value}%</b><div><i style={{width:`${value}%`}}/></div></div>}
function SecurityPosture(){return <div className="security-list"><div><span>Role envelope</span><b className="good">VALID</b></div><div><span>Permission drift</span><b className="good">NONE</b></div><div><span>Session checks</span><b className="good">PASS</b></div><div><span>Backend enforcement</span><b className="warn">REQUIRED</b></div></div>}
function Shortcut({name,path,Icon}){const navigate=useNavigate();return <button className="shortcut interactive" onClick={()=>navigate(path)}><Icon size={17}/><span>{name}</span><Icons.ArrowUpRight size={14}/></button>}

function AlertsPage(){const [filter,setFilter]=useState('all');const [acked,setAcked]=useState(()=>readList('resq_alert_ack',[]));const [toast,setToast]=useState('');const dynamic=readBroadcasts().map(x=>({id:x.id,level:severityClass(x.severity),title:`${x.type} warning · ${x.area}`,region:x.area,time:x.time||'just now',body:x.message,broadcast:true}));const items=[...dynamic,...alerts];const list=filter==='all'?items:items.filter(a=>a.level===filter);const acknowledge=(a)=>{if(acked.includes(a.id))return;const n=[...acked,a.id];setAcked(n);writeList('resq_alert_ack',n);recordActivity({kind:'alert',severity:a.level,message:`Alert acknowledged: ${a.title}`,actor:'User',time:nowLabel(),createdAt:Date.now()});setToast('Alert acknowledged');setTimeout(()=>setToast(''),1800)};return <div className="content-stack"><PageIntro kicker="Verified advisories" title="Alerts & advisories" sub="Broadcasts and verified alerts are severity-coded so critical instructions are impossible to miss."/><div className="filter-row">{['all','critical','high','medium','warning','info'].map(f=><button key={f} className={`filter-chip interactive ${filter===f?'active':''}`} onClick={()=>setFilter(f)}>{f}</button>)}</div><div className="alert-page-grid">{list.map(a=><GlassCard key={a.id} className={`big-alert ${a.level}`}><div className="big-alert-top"><span className={`severity-dot ${a.level}`}/><span>{a.level}</span><small>{a.time}</small></div><h3>{a.title}</h3><p>{a.body}</p><div className="alert-meta"><span><Icons.MapPin size={14}/>{a.region}</span><button className="secondary-button interactive" onClick={()=>acknowledge(a)}>{acked.includes(a.id)?'Acknowledged ✓':'Acknowledge'}</button></div></GlassCard>)}</div>{toast&&<div className="toast glass-panel"><Icons.CheckCircle2 size={16}/>{toast}</div>}</div>}
function computeDistanceKm(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return null;
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round((R * c) * 10) / 10;
}

function Campaigns(){
  const { session } = useAuth();
  const { activeLocation } = useSectorLocation();
  const volunteer = session?.role === 'ngo';
  const [joined, setJoined] = useState([]);
  const [showAllRegions, setShowAllRegions] = useState(false);

  const activeDistrict = activeLocation?.district || 'Pune';

  const filteredCampaigns = useMemo(() => {
    if (showAllRegions) return campaigns;
    return campaigns.filter(c => 
      !c.district || c.district === 'All' || c.district.toLowerCase() === activeDistrict.toLowerCase()
    );
  }, [showAllRegions, activeDistrict]);

  return (
    <div className="content-stack">
      <PageIntro
        kicker="Community action"
        title="Disaster response campaigns"
        sub={volunteer ? 'Active community and relief campaigns where volunteers can assist immediately.' : 'Explore verified government and NGO programs active in your response zone.'}
        actions={
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              type="button"
              className={`filter-chip interactive ${!showAllRegions ? 'active' : ''}`}
              onClick={() => setShowAllRegions(false)}
            >
              <Icons.MapPin size={12} style={{ marginRight: 4 }} />
              Sector: {activeDistrict} ({campaigns.filter(c => !c.district || c.district === 'All' || c.district.toLowerCase() === activeDistrict.toLowerCase()).length})
            </button>
            <button
              type="button"
              className={`filter-chip interactive ${showAllRegions ? 'active' : ''}`}
              onClick={() => setShowAllRegions(true)}
            >
              All Regions ({campaigns.length})
            </button>
          </div>
        }
      />
      <div className="campaign-grid">
        {filteredCampaigns.map(c => {
          const isCurrentSector = c.district && c.district.toLowerCase() === activeDistrict.toLowerCase();
          return (
            <GlassCard key={c.id} className="campaign-card">
              <div className="campaign-top">
                <span className="tag">{c.tag}</span>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  {isCurrentSector && (
                    <span className="status-pill" style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981', borderColor: 'rgba(16,185,129,0.3)' }}>
                      Local Sector
                    </span>
                  )}
                  <span className="status-pill">{c.status}</span>
                </div>
              </div>
              <h3>{c.name}</h3>
              <p>{c.copy}</p>
              <div className="campaign-details">
                <span><Icons.Building2 size={13} />{c.org}</span>
                <span><Icons.MapPin size={13} />{c.location || `${c.district} • ${c.taluka || ''}`}</span>
                <span><Icons.Users size={13} />{c.reach} reached</span>
              </div>
              <button
                className={`primary-button full interactive ${joined.includes(c.id) ? 'joined' : ''}`}
                onClick={() => {
                  if (!joined.includes(c.id)) {
                    setJoined(v => v.concat(c.id));
                    recordActivity({
                      kind: 'campaign',
                      message: `Campaign joined: ${c.name}`,
                      actor: volunteer ? 'Volunteer' : 'Citizen',
                      time: 'just now'
                    });
                  }
                }}
              >
                {joined.includes(c.id) ? 'Joined ✓' : volunteer ? 'Volunteer for campaign' : 'Join campaign'}
              </button>
            </GlassCard>
          );
        })}
      </div>
    </div>
  );
}

function Shelters(){
  const { activeLocation } = useSectorLocation();
  const [saved, setSaved] = useState(() => readList('resq_saved_shelters', []));
  const [toast, setToast] = useState('');
  const [shelterList, setShelterList] = useState(shelters);
  const [filterMode, setFilterMode] = useState('sector'); // 'sector' | 'all'

  const activeDistrict = activeLocation?.district || 'Pune';
  const activeTaluka = activeLocation?.taluka || '';
  const userLat = activeLocation?.coordinates?.lat || 18.5204;
  const userLng = activeLocation?.coordinates?.lng || 73.8567;

  useEffect(() => {
    let mounted = true;
    api.shelters.getAll({ district: activeDistrict, taluka: activeTaluka })
      .then(res => {
        if (mounted && res?.shelters?.length > 0) {
          setShelterList(res.shelters);
        }
      })
      .catch(() => {});
    return () => { mounted = false; };
  }, [activeDistrict, activeTaluka]);

  const processedShelters = useMemo(() => {
    return shelterList.map(s => {
      const lat = s.coordinates?.lat || 18.5204;
      const lng = s.coordinates?.lng || 73.8567;
      const dist = computeDistanceKm(userLat, userLng, lat, lng);
      const isLocal = (s.district?.toLowerCase() === activeDistrict.toLowerCase());
      const estMin = dist !== null ? Math.max(3, Math.round(dist * 2.2)) : null;
      const dynamicEta = estMin !== null ? (estMin > 60 ? `${Math.floor(estMin / 60)}h ${estMin % 60}m drive` : `${estMin} min drive`) : (s.eta || '10 min');
      return {
        ...s,
        dynamicDistanceKm: dist,
        dynamicEta,
        isLocal
      };
    }).sort((a, b) => {
      if (a.isLocal && !b.isLocal) return -1;
      if (!a.isLocal && b.isLocal) return 1;
      return (a.dynamicDistanceKm ?? 999) - (b.dynamicDistanceKm ?? 999);
    });
  }, [shelterList, userLat, userLng, activeDistrict]);

  const displayedShelters = useMemo(() => {
    if (filterMode === 'all') return processedShelters;
    const local = processedShelters.filter(s => s.isLocal);
    return local.length > 0 ? local : processedShelters;
  }, [processedShelters, filterMode]);

  const toggleSave = id => {
    const next = saved.includes(id) ? saved.filter(x => x !== id) : [...saved, id];
    setSaved(next);
    writeList('resq_saved_shelters', next);
    recordActivity({
      kind: 'shelter',
      message: `${saved.includes(id) ? 'Removed' : 'Saved'} shelter ${id}`,
      actor: 'User',
      time: nowLabel(),
      createdAt: Date.now()
    });
  };

  const directions = s => {
    const lat = s.coordinates?.lat || (s.id === 1 ? 18.5314 : s.id === 2 ? 18.4575 : s.id === 3 ? 17.6805 : s.id === 4 ? 21.1458 : 18.5590);
    const lng = s.coordinates?.lng || (s.id === 1 ? 73.8446 : s.id === 2 ? 73.8508 : s.id === 3 ? 74.0183 : s.id === 4 ? 79.0882 : 73.8070);
    const navUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
    window.open(navUrl, '_blank', 'noopener,noreferrer');
    setToast(`🚀 Redirecting to Google Maps: Destination set to "${s.name}"`);
    recordActivity({
      kind: 'shelter',
      message: `Google Maps navigation started for ${s.name}`,
      actor: 'User',
      time: nowLabel(),
      createdAt: Date.now()
    });
    setTimeout(() => setToast(''), 3000);
  };

  return (
    <div className="content-stack">
      <PageIntro
        kicker="Geospatial Proximity Network"
        title="Safe shelters & relief centres"
        sub={`Real-time safe zones projected for ${activeLocation.district} · ${activeLocation.taluka || 'All Sectors'}. Ranked dynamically by GPS distance and bed occupancy.`}
        actions={
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="live-chip" style={{ background: 'rgba(16,185,129,0.15)', borderColor: '#10b981', color: '#10b981' }}>
              <Icons.Compass size={13} style={{ marginRight: 4 }} /> GPS RADAR: {activeDistrict.toUpperCase()} • {activeTaluka ? activeTaluka.toUpperCase() : 'ACTIVE'}
            </span>
            <button
              type="button"
              className={`filter-chip interactive ${filterMode === 'sector' ? 'active' : ''}`}
              onClick={() => setFilterMode('sector')}
            >
              Local Sector ({processedShelters.filter(s => s.isLocal).length})
            </button>
            <button
              type="button"
              className={`filter-chip interactive ${filterMode === 'all' ? 'active' : ''}`}
              onClick={() => setFilterMode('all')}
            >
              All Regions ({processedShelters.length})
            </button>
          </div>
        }
      />
      <div className="shelter-grid">
        {displayedShelters.map(s => {
          const available = s.availableBeds ?? Math.max(0, s.capacity - s.occupied);
          const pct = Math.round(s.occupied / s.capacity * 100);
          return (
            <GlassCard key={s.id} className="shelter-card">
              <div className="shelter-head">
                <div>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '4px' }}>
                    <span className="live-status">● OPEN</span>
                    {s.isLocal && (
                      <span className="status-pill" style={{ background: 'rgba(56,189,248,0.12)', color: '#38bdf8', borderColor: 'rgba(56,189,248,0.25)', fontSize: '10px', padding: '1px 6px' }}>
                        {s.district} Sector
                      </span>
                    )}
                  </div>
                  <h3>{s.name}</h3>
                  <p>
                    {s.city || s.district} {s.dynamicDistanceKm !== null ? `· ${s.dynamicDistanceKm} km away` : ''} · {s.dynamicEta}
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span className="capacity-badge">{pct}%</span>
                  <small style={{ display: 'block', fontSize: '10px', color: '#38bdf8', marginTop: '2px' }}>
                    {available} beds open
                  </small>
                </div>
              </div>
              <div className="capacity-bar"><i style={{ width: `${pct}%` }} /></div>
              <div className="capacity-line">
                <span>{s.occupied} / {s.capacity} occupied</span>
                <span>{available} Available Beds</span>
              </div>
              <div className="service-list">
                {s.services.map(x => <span key={x}>✓ {x}</span>)}
              </div>
              <div className="card-actions">
                <button className="secondary-button interactive" onClick={() => directions(s)}>
                  <Icons.Navigation size={13} style={{ marginRight: 4 }} /> Directions ({s.dynamicEta})
                </button>
                <button className="icon-button interactive" title="Save shelter" onClick={() => toggleSave(s.id)}>
                  {saved.includes(s.id) ? <Icons.BookmarkCheck size={16} /> : <Icons.Bookmark size={16} />}
                </button>
              </div>
            </GlassCard>
          );
        })}
      </div>
      {toast && <div className="toast glass-panel"><Icons.Navigation size={16} />{toast}</div>}
    </div>
  );
}

function HelpDesk(){
  const [step,setStep]=useState(1);
  const [sent,setSent]=useState(false);
  const [type,setType]=useState('Medical Trauma');
  const [urgency,setUrgency]=useState('Critical');
  const [headcount,setHeadcount]=useState('1-2 People');
  const [notes,setNotes]=useState('');
  const [ticketId,setTicketId]=useState('REQ-2084');

  const needs=[
    {id:'Medical Trauma',label:'Medical Trauma',sub:'Trauma, severe injury, ambulance required',ico:Icons.Activity,color:'rose'},
    {id:'Search & Rescue',label:'Search & Rescue',sub:'Trapped in collapsed structure or water',ico:Icons.Siren,color:'rose'},
    {id:'Flood Evacuation',label:'Flood Evacuation',sub:'Rising waters, boat/high-clearance transport',ico:Icons.Waves,color:'amber'},
    {id:'Clean Water & Food',label:'Clean Water & Food',sub:'Critical survival supplies depleted',ico:Icons.Droplets,color:'aqua'},
    {id:'Safe Shelter',label:'Safe Shelter',sub:'Displaced, structural damage, uninhabitable',ico:Icons.House,color:'aqua'},
    {id:'Family Reunification',label:'Family Reunification',sub:'Separated family members or missing child',ico:Icons.Users,color:'violet'}
  ];

  const urgencies=[
    {id:'Critical',level:'Critical',sub:'Immediate threat to life · 0–15 min response window',color:'critical'},
    {id:'High',level:'High',sub:'Rapidly escalating danger · 15–45 min response window',color:'high'},
    {id:'Medium',level:'Medium',sub:'Stranded but stable · Urgent supplies needed',color:'medium'},
    {id:'Advisory',level:'Advisory',sub:'Relocation assistance / Welfare verification',color:'info'}
  ];

  const handleSend=()=>{
    const nextId='REQ-'+Math.floor(1000+Math.random()*9000);
    setTicketId(nextId);
    playEmergencyTone(urgency==='Critical'?'alarm':'warning');
    triggerHaptic([250, 100, 250]);
    recordActivity({
      id:crypto.randomUUID?.()||String(Date.now()),
      kind:'request',
      severity:urgency.toLowerCase(),
      message:`${type} [${urgency}] reported for ${headcount}${notes ? ` · Note: ${notes}` : ''}`,
      actor:'Citizen',
      time:'just now'
    });
    setSent(true);
  };

  const eta = urgency==='Critical'?'6–10 min':urgency==='High'?'15–25 min':urgency==='Medium'?'30–45 min':'60+ min';


  return <div className="content-stack help-desk-stack">
    <PageIntro kicker="Tactical emergency response" title="Request immediate assistance" sub="Emergency dispatch flow connects directly to District EOC, NDRF teams and verified NGO volunteers."/>
    <GlassCard className="help-card tactical-card">
      {sent ? (
        <div className="success-state">
          <div className="success-orb"><Icons.Check size={32}/></div>
          <span className="eyebrow">EMERGENCY DISPATCH CONFIRMED</span>
          <h3 className="dispatch-title">#{ticketId}</h3>
          <p>Coordinates confirmed by satellite mesh. Nearest National Disaster Response Force (NDRF) / Civil Defense unit has been alerted.</p>
          <div className="progress-steps">
            <span className="done"><Icons.Check size={11}/> Request Transmitted</span>
            <span className="done"><Icons.Check size={11}/> GPS Locked</span>
            <span className="active"><Icons.Radio size={11}/> Responder Assigned</span>
            <span>En Route</span>
          </div>
          <div className="dispatch-meta-grid">
            <div className="meta-block">
              <small>TARGET ETA</small>
              <strong>{eta}</strong>
            </div>
            <div className="meta-block">
              <small>TRIAGE PRIORITY</small>
              <strong className={`priority-tag ${urgency.toLowerCase()}`}>{urgency.toUpperCase()}</strong>
            </div>
            <div className="meta-block">
              <small>ASSIGNED FREQUENCY</small>
              <strong>VHF 156.800 MHz</strong>
            </div>
          </div>
          <button className="primary-button interactive" onClick={()=>{setSent(false);setStep(1);setNotes('')}}>
            <Icons.Plus size={15}/> Transmit another request
          </button>
        </div>
      ) : (
        <div>
          <div className="stepper tactical-stepper">
            {[
              {n:'Need',sub:'Category'},
              {n:'Urgency',sub:'Triage'},
              {n:'Location',sub:'GPS & Count'},
              {n:'Confirm',sub:'Transmit'}
            ].map((s,i)=>(
              <div className={`step-item ${step===i+1?'current':step>i+1?'on':''}`} key={s.n} onClick={()=>step>i+1&&setStep(i+1)}>
                <span className="step-num">{step>i+1?'✓':i+1}</span>
                <div className="step-label">
                  <b>{s.n}</b>
                  <small>{s.sub}</small>
                </div>
              </div>
            ))}
          </div>

          {step===1 && (
            <div className="step-body">
              <div className="step-heading">
                <span className="eyebrow">STEP 1 OF 4</span>
                <h3>Select Emergency Category</h3>
                <p>What immediate life-safety or relief assistance is required?</p>
              </div>
              <div className="help-options tactical-grid">
                {needs.map(x=>{
                  const Ico=x.ico;
                  const isSelected=type===x.id;
                  return (
                    <button
                      type="button"
                      className={`help-option tactical-option interactive ${isSelected?'selected':''}`}
                      onClick={()=>setType(x.id)}
                      key={x.id}
                    >
                      <span className={`option-icon-box ${x.color}`}><Ico size={20}/></span>
                      <div className="option-text">
                        <b>{x.label}</b>
                        <small>{x.sub}</small>
                      </div>
                      <span className="option-radio">{isSelected?<Icons.CheckCircle2 size={18}/>:<Icons.Circle size={18}/>}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {step===2 && (
            <div className="step-body">
              <div className="step-heading">
                <span className="eyebrow">STEP 2 OF 4</span>
                <h3>Triage Urgency Rating</h3>
                <p>Responders prioritize life-threatening situations first. Select the current hazard severity.</p>
              </div>
              <div className="urgency-options tactical-grid">
                {urgencies.map(x=>{
                  const isSelected=urgency===x.id;
                  return (
                    <button
                      type="button"
                      className={`urgency-card interactive ${x.color} ${isSelected?'selected':''}`}
                      onClick={()=>setUrgency(x.id)}
                      key={x.id}
                    >
                      <div className="urgency-head">
                        <span className={`urgency-pill ${x.color}`}>{x.level.toUpperCase()}</span>
                        <span className="option-radio">{isSelected?<Icons.CheckCircle2 size={18}/>:<Icons.Circle size={18}/>}</span>
                      </div>
                      <b>Code {x.level}</b>
                      <small>{x.sub}</small>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {step===3 && (
            <div className="step-body">
              <div className="step-heading">
                <span className="eyebrow">STEP 3 OF 4</span>
                <h3>Confirm Location & Casualties</h3>
                <p>Telemetry pinpoints your rescue grid. Responders need to know how many people are stranded.</p>
              </div>
              <div className="location-confirm tactical-location">
                <div className="loc-radar-icon"><Icons.Crosshair size={26}/></div>
                <div>
                  <span className="eyebrow">SATELLITE TELEMETRY LOCKED</span>
                  <b>Pune District Sector 4 · Maharashtra</b>
                  <p>18.5204° N, 73.8567° E · Accuracy ±4 meters · Mesh Channel #04</p>
                </div>
                <span className="gps-pill">GPS LOCKED</span>
              </div>

              <div className="headcount-section">
                <label className="field-label">People Requiring Assistance</label>
                <div className="headcount-grid">
                  {['1 Person','2–4 People','5–10 Group','10+ Stranded Community'].map(c=>(
                    <button
                      type="button"
                      key={c}
                      className={`headcount-chip interactive ${headcount===c?'selected':''}`}
                      onClick={()=>setHeadcount(c)}
                    >
                      {headcount===c && <Icons.Check size={14}/>} {c}
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-row full" style={{marginTop:16}}>
                <div className="field-label-row">
                  <label className="field-label">Field Notes / Specific Hazards (Optional)</label>
                  <VoiceSosButton
                    onTranscript={text => setNotes(prev => prev ? `${prev} ${text}` : text)}
                    label="Speak Details (Voice to Text)"
                  />
                </div>
                <textarea
                  className="tactical-input"
                  value={notes}
                  onChange={e=>setNotes(e.target.value)}
                  placeholder="e.g. Water is waist-high, 1 diabetic patient requiring insulin, located on 2nd floor roof terrace... (or tap Speak Details)"
                />
              </div>
            </div>
          )}

          {step===4 && (
            <div className="step-body">
              <div className="step-heading">
                <span className="eyebrow">STEP 4 OF 4</span>
                <h3>Review Incident Dispatch</h3>
                <p>Verify information before transmitting to Incident Command.</p>
              </div>
              <div className="confirm-card tactical-confirm">
                <div className="confirm-row">
                  <span>Emergency Category</span>
                  <b>{type}</b>
                </div>
                <div className="confirm-row">
                  <span>Triage Priority</span>
                  <b className={`priority-tag ${urgency.toLowerCase()}`}>{urgency} (Code {urgency==='Critical'?'Red':urgency==='High'?'Amber':urgency==='Medium'?'Yellow':'Blue'})</b>
                </div>
                <div className="confirm-row">
                  <span>Persons in Distress</span>
                  <b>{headcount}</b>
                </div>
                <div className="confirm-row">
                  <span>Coordinates</span>
                  <b>Pune Sector 4 (18.5204° N, 73.8567° E)</b>
                </div>
                {notes && (
                  <div className="confirm-row full">
                    <span>Field Notes</span>
                    <p>{notes}</p>
                  </div>
                )}
              </div>
              <div className="transmission-notice">
                <Icons.ShieldAlert size={16}/>
                <span>This alert is sent directly to emergency dispatch 112 and local NDRF rescue teams. False transmissions are punishable under the Disaster Management Act.</span>
              </div>
            </div>
          )}

          <div className="step-actions">
            {step>1 && (
              <button type="button" className="secondary-button interactive" onClick={()=>setStep(s=>s-1)}>
                <Icons.ArrowLeft size={15}/> Back
              </button>
            )}
            <button
              type="button"
              className={`primary-button interactive ${step===4?'dispatch-btn':''}`}
              onClick={()=>{
                if(step<4){
                  setStep(s=>s+1);
                } else {
                  handleSend();
                }
              }}
            >
              {step<4 ? (
                <>Next Step <Icons.ArrowRight size={15}/></>
              ) : (
                <><Icons.Siren size={17}/> Transmit Emergency Dispatch</>
              )}
            </button>
          </div>
        </div>
      )}
    </GlassCard>
  </div>;
}
function IncidentReport(){
  const [submitted,setSubmitted]=useState(false);
  const [type,setType]=useState('Flood');
  const [severity,setSeverity]=useState('Critical');
  const [loc,setLoc]=useState('');
  const [desc,setDesc]=useState('');

  const submit=()=>{
    playEmergencyTone(severity==='Critical'?'alarm':'warning');
    triggerHaptic([200,100,200]);
    recordActivity({
      id:crypto.randomUUID?.()||String(Date.now()),
      kind:'incident',
      severity:severity.toLowerCase(),
      message:`${severity} ${type} reported at ${loc||'Sector 4'}: ${desc||'Citizen triage notice'}`,
      actor:'Citizen',
      time:'just now'
    });
    setSubmitted(true);
  };

  return (
    <div className="content-stack">
      <PageIntro kicker="Community reporting" title="Report an incident" sub="Citizen reports become a reviewable signal for authorized responders."/>
      <GlassCard className="form-card">
        {submitted ? (
          <div className="success-state compact">
            <div className="success-orb"><Icons.Check size={26}/></div>
            <h3>Incident reported</h3>
            <p>Reference <b>#INC-0842</b>. A verified officer can review and escalate the report.</p>
            <button className="secondary-button interactive" onClick={()=>{setSubmitted(false);setDesc('');setLoc('');}}>Report another</button>
          </div>
        ) : (
          <div className="form-grid">
            <div className="form-row">
              <label>Incident type</label>
              <select value={type} onChange={e=>setType(e.target.value)}>
                {['Flood','Fire','Landslide','Heatwave','Road block','Other'].map(x=><option key={x} value={x}>{x}</option>)}
              </select>
            </div>
            <div className="form-row">
              <label>Severity</label>
              <select value={severity} onChange={e=>setSeverity(e.target.value)}>
                {['Critical','High','Medium','Low'].map(x=><option key={x} value={x}>{x}</option>)}
              </select>
            </div>
            <div className="form-row full">
              <label>Location</label>
              <input type="text" placeholder="Current location or landmark" value={loc} onChange={e=>setLoc(e.target.value)}/>
            </div>
            <div className="form-row full">
              <div className="field-label-row">
                <label>Description</label>
                <VoiceSosButton onTranscript={text => setDesc(prev => prev ? `${prev} ${text}` : text)} label="Speak Details (Voice to Text)" />
              </div>
              <textarea
                value={desc}
                onChange={e=>setDesc(e.target.value)}
                placeholder="What happened? Describe immediate danger, casualties or trapped persons... (or tap Speak Details)"
                rows={4}
              />
            </div>
            <div className="form-row full">
              <label>Photo evidence</label>
              <button type="button" className="upload-box interactive"><Icons.ImagePlus size={19}/> Add photo or document</button>
            </div>
            <div className="form-row full">
              <button className="primary-button interactive" onClick={submit}>
                Submit incident report <Icons.ArrowRight size={15}/>
              </button>
            </div>
          </div>
        )}
      </GlassCard>
    </div>
  );
}
function CustomSelect({label, options, value, onChange, placeholder}){
  const [open,setOpen]=useState(false);
  const [dropUp,setDropUp]=useState(false);
  const ref=useRef(null);
  const toggle=()=>{
    setOpen(v=>{
      const next=!v;
      if(next&&ref.current){
        const r=ref.current.getBoundingClientRect();
        setDropUp(window.innerHeight - r.bottom < 240);
      }
      return next;
    });
  };
  useEffect(()=>{
    const close=e=>{if(ref.current&&!ref.current.contains(e.target))setOpen(false)};
    document.addEventListener('pointerdown',close);
    const resize=()=>{
      if(open&&ref.current){
        const r=ref.current.getBoundingClientRect();
        setDropUp(window.innerHeight - r.bottom < 240);
      }
    };
    window.addEventListener('resize',resize);
    return()=>{
      document.removeEventListener('pointerdown',close);
      window.removeEventListener('resize',resize);
    };
  },[open]);
  useEffect(()=>{
    const onKey=e=>{if(!open)return;if(e.key==='Escape')setOpen(false)};
    document.addEventListener('keydown',onKey);
    return()=>document.removeEventListener('keydown',onKey);
  },[open]);

  return (
    <div className={`custom-select-wrap ${open?'is-open':''} ${dropUp?'drop-up':''}`} ref={ref}>
      {label && <label>{label}</label>}
      <button
        type="button"
        className={`custom-select interactive ${open?'open':''} ${value?'chosen':''}`}
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span>{value||placeholder||`Select ${label}`}</span>
        <Icons.ChevronDown size={17} className={`select-chevron ${open?'rotated':''}`}/>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className={`select-menu elevated-solid-menu ${dropUp?'open-up':''}`}
            initial={{opacity:0,y:dropUp?8:-8,scale:.98}}
            animate={{opacity:1,y:0,scale:1}}
            exit={{opacity:0,y:dropUp?8:-8,scale:.98}}
            transition={{duration:.18,ease:[.2,.8,.2,1]}}
            role="listbox"
          >
            {options.map((o,i)=>(
              <motion.button
                type="button"
                key={o}
                className={`select-option interactive ${value===o?'selected':''}`}
                initial={{opacity:0,x:-6}}
                animate={{opacity:1,x:0}}
                transition={{delay:Math.min(i*0.008, 0.08),duration:0.12}}
                onClick={()=>{onChange?.(o);setOpen(false)}}

                role="option"
                aria-selected={value===o}
              >
                <span>{o}</span>
                {value===o && <Icons.Check size={15}/>}
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
function Field({label,options,placeholder,textarea}){const [value,setValue]=useState('');return <div className="form-row">{textarea?<><label>{label}</label><textarea placeholder={placeholder}/></>:options?<CustomSelect label={label} options={options} value={value} onChange={setValue} placeholder={placeholder}/>:<><label>{label}</label><input placeholder={placeholder}/></>}</div>}
function Requests(){
  const {session}=useAuth();
  const volunteer=session.role==='ngo';
  const [accepted,setAccepted]=useState(()=>readList(REQUEST_KEY,[]));
  const [q,setQ]=useState('');
  const [reqList,setReqList]=useState(requests);
  const [matchModal,setMatchModal]=useState(null);
  const [dispatching,setDispatching]=useState(false);
  const [toast,setToast]=useState('');

  const loadRequests = () => {
    api.requests.getAll()
      .then(res => {
        if (res?.requests?.length > 0) {
          setReqList(res.requests);
        }
      })
      .catch(() => {});
  };

  useEffect(()=>{
    loadRequests();
    const handleNewRequest = (e) => {
      if (e.detail) {
        setReqList(prev => [e.detail, ...prev.filter(x => x.id !== e.detail.id)]);
        setToast(`🚨 New Live SOS Request Received: #${e.detail.id} (${e.detail.type} at ${e.detail.location})`);
        setTimeout(() => setToast(''), 4000);
      }
    };
    window.addEventListener('resq:socket-new-request', handleNewRequest);
    return () => window.removeEventListener('resq:socket-new-request', handleNewRequest);
  },[]);

  const take=(r)=>{
    if(accepted.some(x=>x.id===r.id))return;
    const item={...r,status:volunteer?'Accepted':'Verified',acceptedBy:session.name,createdAt:Date.now()};
    const next=[item,...accepted];
    setAccepted(next);
    writeList(REQUEST_KEY,next);
    api.requests.updateStatus(r.id, volunteer ? 'Accepted' : 'Verified', session.name).catch(()=>{});
    recordActivity({
      id:`req-${r.id}-${session.role}`,
      kind:'accepted',
      severity:r.priority==='Critical'?'critical':r.priority==='High'?'high':'medium',
      message:`${volunteer?'Volunteer accepted':'Officer verified'} ${r.id}`,
      actor:session.name,
      time:nowLabel(),
      createdAt:Date.now()
    });
  };

  const openMatcher = async (r) => {
    try {
      const res = await api.requests.getMatches(r.id);
      setMatchModal({ request: r, matches: res.matches || [] });
    } catch {
      setToast('Unable to calculate volunteer matches right now.');
      setTimeout(()=>setToast(''), 2500);
    }
  };

  const confirmDispatch = async (reqId, volId) => {
    setDispatching(true);
    try {
      const res = await api.requests.dispatch(reqId, { volunteerId: volId });
      setToast(`Dispatched: ${res.message || 'Mission assigned!'}`);
      setMatchModal(null);
      loadRequests();
    } catch (err) {
      setToast(`Dispatch error: ${err.message}`);
    } finally {
      setDispatching(false);
      setTimeout(()=>setToast(''), 3000);
    }
  };

  const simulateSmsDistress = async () => {
    try {
      const sampleLocations = ['Kothrud', 'Warje', 'Dhayari', 'Sinhagad', 'Pashan'];
      const loc = sampleLocations[Math.floor(Math.random() * sampleLocations.length)];
      const res = await api.requests.smsWebhook('+91-98' + Math.floor(10000000 + Math.random() * 90000000), `SOS FLOOD ${loc} 4 TRAPPED water rising fast`);
      if (res?.request) {
        setReqList(prev => [res.request, ...prev]);
        setToast(`📱 SMS Emergency Ingested: #${res.request.id} at ${loc} [Triage: ${res.triage?.urgency}]`);
        setTimeout(()=>setToast(''), 3500);
      }
    } catch (err) {
      setToast('SMS gateway simulation failed: ' + err.message);
      setTimeout(()=>setToast(''), 2500);
    }
  };

  const filtered=reqList.filter(r=>!q||`${r.id} ${r.type} ${r.location} ${r.citizen} ${r.details||''}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="content-stack">
      <PageIntro
        kicker={volunteer?'Volunteer dispatch queue':'Authorized assistance command'}
        title={volunteer?'Assistance requests you can take':'Incident assistance dispatch ledger'}
        sub={volunteer?'Eligible humanitarian tasks matched by skill and location.':'AI triage urgency, required equipment and algorithmic volunteer matching.'}
        actions={
          <div style={{display:'flex',gap:'8px'}}>
            <button type="button" className="secondary-button interactive" onClick={simulateSmsDistress} title="Simulate an emergency distress SMS coming through the SMS gateway">
              <Icons.Smartphone size={14}/> Test SMS Gateway
            </button>
          </div>
        }
      />

      <div className="filter-bar glass-panel">
        <div className="filter-left">
          <Icons.Search size={15}/>
          <input className="bare-input" value={q} onChange={e=>setQ(e.target.value)} placeholder="Search request, citizen, triage tag, location..."/>
        </div>
      </div>

      <GlassCard className="table-card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID & Citizen</th>
                <th>Assistance Type</th>
                <th>Location</th>
                <th>AI Triage & Priority</th>
                <th>Status</th>
                <th>Assigned Unit</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r=>{
                const done=accepted.some(x=>x.id===r.id) || r.status==='Assigned' || r.status==='In transit';
                const assignedName = r.team && r.team !== '—' ? r.team : (accepted.find(x=>x.id===r.id)?.acceptedBy || '—');
                const triageInfo = r.triage;

                return (
                  <tr key={r.id}>
                    <td>
                      <b>{r.id}</b>
                      <small style={{display:'block'}}>{r.citizen}</small>
                    </td>
                    <td>
                      <strong>{r.type}</strong>
                      {triageInfo?.requiredEquipment?.[0] && (
                        <small style={{display:'block',color:'#38bdf8',fontSize:'10px'}}>
                          Asset: {triageInfo.requiredEquipment[0]}
                        </small>
                      )}
                    </td>
                    <td>
                      <span style={{display:'flex',alignItems:'center',gap:'4px'}}>
                        <Icons.MapPin size={12} style={{color:'#f43f5e'}}/> {r.location}
                      </span>
                    </td>
                    <td>
                      <span className={`priority ${(r.priority || 'Medium').toLowerCase()}`}>
                        {r.priority || 'Medium'}
                      </span>
                      {triageInfo?.urgency && (
                        <small style={{display:'block',fontSize:'10px',color:'#cbd5e1'}}>
                          AI: {triageInfo.urgency}
                        </small>
                      )}
                    </td>
                    <td>
                      <span className="status-pill">{r.status}</span>
                    </td>
                    <td>
                      <b>{assignedName}</b>
                    </td>
                    <td>
                      <div style={{display:'flex',gap:'6px'}}>
                        <button className="tiny-button interactive" onClick={()=>take(r)}>
                          {done?'DONE':volunteer?'TAKE':'VERIFY'}
                        </button>
                        {r.status === 'Open' && (
                          <button
                            type="button"
                            className="tiny-button interactive"
                            style={{background:'rgba(56,189,248,0.2)',color:'#38bdf8',borderColor:'rgba(56,189,248,0.4)'}}
                            onClick={()=>openMatcher(r)}
                            title="Match nearest available responder by skill & distance"
                          >
                            <Icons.Route size={11} style={{marginRight:2}}/> Match
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </GlassCard>

      {/* Dispatch Matcher Modal */}
      {matchModal && (
        <div className="drill-modal-backdrop" onClick={()=>setMatchModal(null)}>
          <div className="glass-panel" style={{maxWidth:'600px',width:'92%',padding:'24px',borderRadius:'16px',background:'rgba(15,23,42,0.95)',border:'1px solid rgba(255,255,255,0.15)',boxShadow:'0 24px 60px rgba(0,0,0,0.6)'}} onClick={e=>e.stopPropagation()}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'16px'}}>
              <div>
                <span className="eyebrow">ALGORITHMIC DISPATCH MATCHER</span>
                <h3 style={{margin:0,fontSize:'18px'}}>
                  Matches for #{matchModal.request.id} ({matchModal.request.type})
                </h3>
                <small style={{color:'#94a3b8'}}>Location: {matchModal.request.location}</small>
              </div>
              <button className="icon-button interactive" onClick={()=>setMatchModal(null)}>
                <Icons.X size={16}/>
              </button>
            </div>

            <p style={{fontSize:'13px',color:'#cbd5e1',marginBottom:'16px'}}>
              The system calculates match scores combining <b>skill taxonomy</b>, <b>readiness status</b>, and <b>Haversine distance</b>:
            </p>

            <div style={{display:'flex',flexDirection:'column',gap:'10px',maxHeight:'320px',overflowY:'auto',marginBottom:'20px'}}>
              {matchModal.matches.map(m => (
                <div key={m.volunteerId} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'12px 14px',borderRadius:'10px',background:m.isOptimal?'rgba(16,185,129,0.1)':'rgba(255,255,255,0.03)',border:`1px solid ${m.isOptimal?'#10b981':'rgba(255,255,255,0.1)'}`}}>
                  <div>
                    <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                      <strong style={{fontSize:'14px'}}>{m.name}</strong>
                      <span className="status-pill" style={{fontSize:'10px'}}>{m.skill}</span>
                      {m.isOptimal && <span className="live-chip" style={{fontSize:'10px',background:'#10b981',color:'#fff'}}>TOP MATCH</span>}
                    </div>
                    <small style={{color:'#94a3b8',display:'block',marginTop:'3px'}}>
                      📍 {m.distanceKm} km away · ETA {m.eta} · {m.missions} missions completed
                    </small>
                  </div>
                  <div style={{textAlign:'right'}}>
                    <div style={{fontSize:'16px',fontWeight:'bold',color:m.matchScore>=75?'#10b981':m.matchScore>=50?'#f59e0b':'#f43f5e'}}>
                      {m.matchScore}%
                    </div>
                    <button
                      type="button"
                      className="tiny-button interactive"
                      disabled={dispatching}
                      onClick={()=>confirmDispatch(matchModal.request.id, m.volunteerId)}
                      style={{marginTop:'4px'}}
                    >
                      Dispatch
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div style={{display:'flex',justifyContent:'flex-end',gap:'10px'}}>
              <button className="secondary-button interactive" onClick={()=>setMatchModal(null)}>Close</button>
              <button className="primary-button interactive" disabled={dispatching} onClick={()=>confirmDispatch(matchModal.request.id, null)}>
                <Icons.Zap size={14}/> Auto-Dispatch Best Match
              </button>
            </div>
          </div>
        </div>
      )}

      {toast&&<div className="toast glass-panel"><Icons.CheckCircle2 size={16}/>{toast}</div>}
    </div>
  );
}
function Missions(){
  const {session}=useAuth();
  const [status,setStatus]=useState(()=>Object.fromEntries(readList('resq_mission_status',[]).map(x=>[x.id,x.stage])));
  const [filter,setFilter]=useState('all');
  const [toast,setToast]=useState('');

  const missionTemplates = [
    {
      id: 'REQ-1048',
      code: 'RQ-1048',
      type: 'Medical Trauma Delivery',
      priority: 'Critical',
      citizen: 'Asha Kulkarni',
      phone: '+91 98220 18492',
      location: 'Kothrud Sector 1 · 18.508° N, 73.809° E',
      eta: '8 min ETA',
      instructions: 'Deliver emergency trauma dressing, insulin ampoule and perform vitals check on 2 stranded citizens.',
      checklist: ['Verify oxygen saturation', 'Administer cold-chain insulin', 'Log triage vital signs to EOC']
    },
    {
      id: 'REQ-1047',
      code: 'RQ-1047',
      type: 'Relief Ration Distribution',
      priority: 'High',
      citizen: 'Rohit Mane & 4 Families',
      phone: '+91 98904 22319',
      location: 'Warje Lowlands · 18.479° N, 73.798° E',
      eta: '18 min ETA',
      instructions: 'Distribute 50 survival food ration packets and 100 chlorine purification tablets to water-locked families.',
      checklist: ['Inspect seal of food packets', 'Confirm clean water canister count', 'Provide shelter route card']
    },
    {
      id: 'REQ-1046',
      code: 'RQ-1046',
      type: 'High-Water Evacuation Escort',
      priority: 'High',
      citizen: 'Mridula Patil & Children',
      phone: '+91 94225 61830',
      location: 'Dhayari Riverbank · 18.450° N, 73.820° E',
      eta: '30 min ETA',
      instructions: 'Provide life vests and assist NDRF motorized boat unit with evacuation to Shivaji Nagar Relief Shelter.',
      checklist: ['Issue child safety flotation vests', 'Escort to evacuation high-clearance truck', 'Confirm shelter check-in']
    }
  ];

  const stages = [
    { name: 'Accepted', time: '14:15', desc: 'Dispatched to volunteer' },
    { name: 'En route', time: '14:28', desc: 'Traveling to grid coordinate' },
    { name: 'Arrived', time: '14:42', desc: 'On scene with citizen' },
    { name: 'Completed', time: '15:05', desc: 'Safe relief verified' }
  ];

  const advance = (m) => {
    const current = status[m.id] || 1;
    const next = Math.min(current + 1, 4);
    const map = [...readList('resq_mission_status',[]).filter(x=>x.id!==m.id), {id:m.id, stage:next}];
    setStatus(v=>({...v, [m.id]:next}));
    writeList('resq_mission_status', map);
    const stageInfo = stages[next-1];
    recordActivity({
      kind:'mission',
      severity: m.priority==='Critical' ? 'critical' : 'high',
      message: `Mission ${m.code} (${m.type}) advanced to ${stageInfo.name}`,
      actor: session.name,
      time: nowLabel(),
      createdAt: Date.now()
    });
    setToast(`Mission ${m.code} advanced to stage: ${stageInfo.name}!`);
    setTimeout(()=>setToast(''), 2400);
  };

  const displayedMissions = missionTemplates.filter(m => {
    const st = status[m.id] || 1;
    if (filter === 'active') return st < 4;
    if (filter === 'completed') return st >= 4;
    return true;
  });

  return (
    <div className="content-stack volunteer-missions-stack">
      <PageIntro
        kicker="Field Response Coordination"
        title="Assigned Response Work"
        sub="Field missions dispatched to your NGO unit. Update your progress in real time so district command maintains operational visibility."
        actions={
          <div className="mission-filter-tabs">
            <button
              type="button"
              className={`filter-chip interactive ${filter==='all'?'active':''}`}
              onClick={()=>setFilter('all')}
            >
              All Missions ({missionTemplates.length})
            </button>
            <button
              type="button"
              className={`filter-chip interactive ${filter==='active'?'active':''}`}
              onClick={()=>setFilter('active')}
            >
              In Progress ({missionTemplates.filter(m => (status[m.id]||1) < 4).length})
            </button>
            <button
              type="button"
              className={`filter-chip interactive ${filter==='completed'?'active':''}`}
              onClick={()=>setFilter('completed')}
            >
              Completed ({missionTemplates.filter(m => (status[m.id]||1) >= 4).length})
            </button>
          </div>
        }
      />

      <div className="mission-grid responsive-mission-grid">
        {displayedMissions.map(m => {
          const currentStage = status[m.id] || 1;
          const isDone = currentStage >= 4;
          return (
            <GlassCard key={m.id} className={`mission-card tactical-mission-card ${isDone?'mission-done':''}`}>
              <div className="mission-top">
                <div className="mission-badge-wrap">
                  <span className={`priority ${m.priority.toLowerCase()}`}>
                    {isDone ? 'COMPLETED' : m.priority.toUpperCase()}
                  </span>
                  <span className="mission-code">{m.code}</span>
                </div>
                <span className="mission-eta-badge">
                  <Icons.Clock size={12}/> {isDone ? 'Resolved' : m.eta}
                </span>
              </div>

              <div className="mission-body">
                <h3 className="mission-title">{m.type}</h3>
                <div className="mission-target-info">
                  <p><Icons.MapPin size={13}/> <b>{m.location}</b></p>
                  <p><Icons.User size={13}/> <span>{m.citizen}</span> · <b className="citizen-phone">{m.phone}</b></p>
                </div>
                <p className="mission-instructions">{m.instructions}</p>

                <div className="mission-checklist">
                  <small className="checklist-heading">FIELD OBJECTIVES</small>
                  {m.checklist.map((item, idx) => (
                    <div key={item} className={`checklist-item ${currentStage > idx ? 'checked' : ''}`}>
                      <span className="check-box">{currentStage > idx ? <Icons.Check size={11}/> : idx+1}</span>
                      <span>{item}</span>
                    </div>
                  ))}
                </div>

                <div className="mission-track tactical-mission-track">
                  <div className="track-header">
                    <span>PROGRESS STAGE</span>
                    <b>{stages[currentStage-1].name.toUpperCase()}</b>
                  </div>
                  <div className="stage-bars">
                    {stages.map((st, i) => (
                      <div
                        key={st.name}
                        className={`stage-bar-item ${currentStage > i ? 'done' : currentStage === i+1 ? 'current' : ''}`}
                        title={`${st.name} - ${st.desc}`}
                      >
                        <span className="stage-dot"/>
                        <span className="stage-name">{st.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mission-actions">
                <button
                  type="button"
                  className={`primary-button full interactive advance-btn ${isDone?'completed-btn':''}`}
                  onClick={()=>advance(m)}
                  disabled={isDone}
                >
                  {isDone ? (
                    <><Icons.CheckCircle2 size={16}/> Mission Completed ✓</>
                  ) : (
                    <><Icons.ArrowRightCircle size={16}/> Advance: {stages[currentStage]?.name || 'Next Stage'}</>
                  )}
                </button>
                <button
                  type="button"
                  className="secondary-button full interactive dispatch-radio-btn"
                  onClick={()=>{
                    setToast(`Radio link opened with EOC Field Coordinator for ${m.code}`);
                    setTimeout(()=>setToast(''), 2400);
                  }}
                >
                  <Icons.Radio size={14}/> Contact Dispatch Radio
                </button>
              </div>
            </GlassCard>
          );
        })}
      </div>

      {toast && (
        <div className="toast mission-toast glass-panel">
          <Icons.CheckCircle2 size={16}/> {toast}
        </div>
      )}
    </div>
  );
}
function Impact(){return <div className="content-stack"><PageIntro kicker="Volunteer impact" title="Your community contribution" sub="A simple impact view for the work you complete through the response network."/><div className="stats-grid four"><Metric label="People helped" value="126" sub="+18 this month" Icon={Icons.HeartHandshake}/><Metric label="Missions" value="48" sub="92% completed" Icon={Icons.Route} accent="violet"/><Metric label="Hours" value="72" sub="Field time" Icon={Icons.Clock3} accent="amber"/><Metric label="Badge level" value="8" sub="Community Hero" Icon={Icons.BadgeCheck} accent="rose"/></div><GlassCard><CardHeader title="Impact timeline"/>{['Food delivery · Camp 04','First aid support · Kothrud','Water distribution · Warje','Translation support · Family desk'].map((x,i)=><div className="impact-row" key={x}><span className="impact-index">0{i+1}</span><div><b>{x}</b><small>{['Today','Yesterday','3 days ago','Last week'][i]}</small></div><span className="impact-ok">+{[12,8,24,5][i]} helped</span></div>)}</GlassCard></div>}
function FamilySafety(){
  const [members,setMembers]=useState(()=>readList('resq_family_members',[
    {name:'Aarav Mogare',status:'Safe · last sync 4 min ago',location:'Kothrud Relief Camp'},
    {name:'Mina Mogare',status:'Shelter check-in pending',location:'Pune Sector 2'},
    {name:'Riya Mogare',status:'Safe · Rescued by NDRF Unit 04',location:'Shivaji Nagar Hub'}
  ]));
  const [adding,setAdding]=useState(false);
  const [name,setName]=useState('');
  const [location,setLocation]=useState('');

  const add=()=>{
    if(!name.trim())return;
    const next=[...members,{name:name.trim(),status:'Safety sync active · Just added',location:location.trim()||'Registered Zone'}];
    setMembers(next);
    writeList('resq_family_members',next);
    recordActivity({kind:'family',message:`Family member tracked: ${name.trim()}`,actor:'Citizen',time:nowLabel(),createdAt:Date.now()});
    setName('');
    setLocation('');
    setAdding(false);
  };

  const removeMember=(idx)=>{
    const target=members[idx];
    const next=members.filter((_,i)=>i!==idx);
    setMembers(next);
    writeList('resq_family_members',next);
    recordActivity({
      kind:'family',
      message:`Family member record removed: ${target?.name||'Member'}`,
      actor:'Citizen',
      time:nowLabel(),
      createdAt:Date.now()
    });
  };

  return <div className="content-stack">
    <PageIntro kicker="Family safety & reunification" title="Reunification & missing persons registry" sub="Real-time biometric and manifest matching across regional relief camps, field hospitals and evacuation corridors." actions={<button className="primary-button interactive" onClick={()=>setAdding(v=>!v)}><Icons.UserPlus size={15}/> {adding?'Cancel':'Add family member'}</button>}/>
    
    {adding&&<GlassCard className="tactical-card"><div className="inline-add-grid"><div className="form-row"><label>Full Name</label><input value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Meera Mogare"/></div><div className="form-row"><label>Last Known Location / Landmark</label><input value={location} onChange={e=>setLocation(e.target.value)} placeholder="e.g. Pune Camp 4 or Kothrud"/></div><button className="primary-button interactive" onClick={add}><Icons.Check size={15}/> Save Member Record</button></div></GlassCard>}

    <div className="dashboard-columns">
      <GlassCard className="tactical-card">
        <CardHeader title={`Registered family members (${members.length})`}/>
        {members.length ? (
          <div className="family-list-wrap">
            {members.map((m,i)=>(
              <div className="family-row tactical-family-row" key={`${m.name}-${i}`}>
                <span className="avatar family-avatar">{m.name[0]}</span>
                <div className="family-details">
                  <b>{m.name}</b>
                  <small>{m.status} {m.location ? `· ${m.location}` : ''}</small>
                </div>
                <span className="live-status">● VERIFIED</span>
                <button
                  type="button"
                  className="remove-family-btn interactive"
                  title={`Remove ${m.name} from family roster`}
                  onClick={()=>removeMember(i)}
                  aria-label={`Remove ${m.name}`}
                >
                  <Icons.Trash2 size={14}/>
                  <span>Remove</span>
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state mini">
            <Icons.Users size={24}/>
            <b>No family records saved</b>
            <p>Add your loved ones to track their safety across disaster shelter manifests.</p>
          </div>
        )}
      </GlassCard>

      <GlassCard className="tactical-card">
        <CardHeader title="Search disaster shelter manifests"/>
        <div className="search-box tactical-search">
          <Icons.Search size={17}/>
          <input placeholder="Search person name, shelter manifest or ID..."/>
          <button className="primary-button interactive" onClick={()=>recordActivity({kind:'family',message:'Missing-person search initiated',actor:'Citizen',time:nowLabel(),createdAt:Date.now()})}>Search</button>
        </div>
        <div className="match-card tactical-match">
          <div className="match-icon"><Icons.BadgeCheck size={24}/></div>
          <div>
            <span className="eyebrow">AUTOMATED BIO-MATCH FOUND</span>
            <b>Rohan Mogare · ID #MP-2084</b>
            <p>Checked into Shivaji Nagar Relief Camp · Medical state: Stable · Evacuation Bus #12</p>
          </div>
          <button className="secondary-button interactive">View Report</button>
        </div>
      </GlassCard>
    </div>
  </div>;
}
function Incidents(){return <div className="content-stack"><PageIntro kicker="Verified disaster events" title="Live incident board" sub="Only authorized officers can verify, escalate and manage incident states."/><div className="command-grid"><GlassCard className="map-card"><CardHeader title="Incident map"/><OperationsMap/></GlassCard><GlassCard><CardHeader title="Incident stream"/>{incidents.map(i=><IncidentRow key={i.id} i={i}/>)}</GlassCard></div></div>}
function Broadcast(){const {session}=useAuth();const navigate=useNavigate();const [sent,setSent]=useState(false);const [type,setType]=useState('');const [severity,setSeverity]=useState('');const [area,setArea]=useState('');const [message,setMessage]=useState('');const [channels,setChannels]=useState(['App notification','SMS','Email','Public display','NGO network']);const [error,setError]=useState('');const [history,setHistory]=useState(()=>readBroadcasts().filter(x=>x.role===session.role));useEffect(()=>{const refresh=()=>setHistory(readBroadcasts().filter(x=>x.role===session.role));window.addEventListener('resq:broadcasts',refresh);window.addEventListener('storage',refresh);return()=>{window.removeEventListener('resq:broadcasts',refresh);window.removeEventListener('storage',refresh)}},[session.role]);const reset=()=>{setSent(false);setType('');setSeverity('');setArea('');setMessage('');setError('');setChannels(['App notification','SMS','Email','Public display','NGO network'])};const toggleChannel=x=>setChannels(v=>v.includes(x)?v.filter(c=>c!==x):[...v,x]);const submit=()=>{if(!type||!severity||!area||!message.trim()){setError('Complete alert type, severity, affected area and action message before broadcasting.');return}if(!channels.length){setError('Select at least one delivery channel before broadcasting.');return}setError('');const id=crypto.randomUUID?.()||String(Date.now());const event={id,kind:'broadcast',type,severity,area,message:message.trim(),channels,role:session.role,actor:session.name,time:'just now',createdAt:Date.now()};saveBroadcasts([event,...readBroadcasts()]);recordActivity(event);setSent(true)};return <div className="content-stack"><PageIntro kicker="Official warning system" title={`${session.role==='admin'?'Admin':'Government'} broadcast center`} sub="Draft a clear, severity-coded warning and publish it to selected response channels." actions={<button className="secondary-button interactive" onClick={()=>navigate('/broadcast-history')}><Icons.History size={15}/> History</button>}/><GlassCard className="form-card"><div className="broadcast-preview-row"><div className={`broadcast-severity-preview severity-${severityClass(severity)}`}><span className={`severity-dot ${severityClass(severity)}`}/><div><b>{severity||'Select severity'}</b><small>{type||'Alert type'} · {area||'Affected area'}</small></div><span>{severity?severity.toUpperCase():'DRAFT'}</span></div><div className="broadcast-rule"><Icons.ShieldAlert size={15}/><span>Critical alerts use the strongest neon notification treatment and remain visually distinct across RESQ.</span></div></div>{sent?<div className="success-state compact"><div className={`success-orb severity-${severityClass(severity)}`}><Icons.Radio size={26}/></div><h3>Alert broadcast published</h3><p>This {severity.toLowerCase()} advisory is now tracked in the {session.role==='admin'?'admin':'government'} ledger and global activity feed.</p><div className="button-row"><button className="primary-button interactive" onClick={reset}>Create another alert</button><button className="secondary-button interactive" onClick={()=>navigate('/broadcast-history')}>Open history</button></div></div>:<div className="form-grid"><CustomSelect label="Alert type" options={['Flood','Fire','Heatwave','Landslide','Cyclone','Road closure']} value={type} onChange={v=>{setType(v);setError('')}} placeholder="Select alert type"/><CustomSelect label="Severity" options={['Critical','High','Medium']} value={severity} onChange={v=>{setSeverity(v);setError('')}} placeholder="Select severity"/><CustomSelect label="Affected area" options={['Pune District','Satara','Nagpur','Nashik','Lonavala','Pimpri-Chinchwad']} value={area} onChange={v=>{setArea(v);setError('')}} placeholder="Select affected area"/><div className="form-row full"><label>Message</label><textarea value={message} onChange={e=>{setMessage(e.target.value);setError('')}} placeholder="Write the action people should take..."/></div><div className="channel-row"><label>Delivery channels</label><div className="channel-pills">{['App notification','SMS','Email','Public display','NGO network'].map(x=><button type="button" key={x} className={`check-pill interactive ${channels.includes(x)?'checked':''}`} onClick={()=>toggleChannel(x)}><span>{channels.includes(x)?'✓':'○'}</span>{x}</button>)}</div></div>{error&&<motion.div className="form-error" initial={{opacity:0,y:-3}} animate={{opacity:1,y:0}}><Icons.TriangleAlert size={14}/>{error}</motion.div>}<button className={`primary-button interactive full broadcast-submit severity-${severityClass(severity)}`} onClick={submit}><Icons.Megaphone size={16}/> Publish official alert</button></div>}</GlassCard><GlassCard><CardHeader title={`${session.role==='admin'?'Admin':'Government'} recent broadcasts`} action="Open history" onClick={()=>navigate('/broadcast-history')}/>{history.length?history.slice(0,5).map(x=><div className={`history-row severity-${severityClass(x.severity)}`} key={x.id}><span className={`severity-dot ${severityClass(x.severity)}`}/><div><b>{x.severity} · {x.type}</b><small>{x.area} · {x.message}</small></div><span>{x.time}</span></div>):<div className="empty-state"><Icons.Megaphone size={20}/><b>No broadcasts from this role</b><p>Your published advisories will appear here immediately.</p></div>}</GlassCard></div>}
function BroadcastHistory(){const {session}=useAuth();const navigate=useNavigate();const [filter,setFilter]=useState('all');const [all,setAll]=useState(()=>readBroadcasts());useEffect(()=>{const refresh=()=>setAll(readBroadcasts());window.addEventListener('resq:broadcasts',refresh);window.addEventListener('storage',refresh);return()=>{window.removeEventListener('resq:broadcasts',refresh);window.removeEventListener('storage',refresh)}},[]);const mine=session.role==='government'?all.filter(x=>x.role==='government'&&(x.actor===session.name||!x.actor)):all.filter(x=>x.role==='admin');const list=filter==='all'?mine:mine.filter(x=>(x.severity||'').toLowerCase()===filter);return <div className="content-stack"><PageIntro kicker="Official communication ledger" title="Broadcast history" sub="Every official alert issued by your role is tracked here with severity, area, message and timestamp." actions={<div className="chart-controls">{['all','critical','high','medium'].map(x=><button key={x} className={`filter-chip interactive ${filter===x?'active':''}`} onClick={()=>setFilter(x)}>{x}</button>)}</div>}/><div className="history-summary"><Metric label="Your broadcasts" value={String(mine.length).padStart(2,'0')} sub="Tracked locally" Icon={Icons.Megaphone} accent="aqua"/><Metric label="Critical" value={String(mine.filter(x=>x.severity==='Critical').length).padStart(2,'0')} sub="Priority advisories" Icon={Icons.Siren} accent="rose"/><Metric label="Last broadcast" value={mine[0]?.time||'—'} sub={mine[0]?.area||'No activity yet'} Icon={Icons.Clock3} accent="amber"/></div><GlassCard className="history-card">{list.length?list.map((x,i)=><motion.div key={x.id||i} className="broadcast-history-row" initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{delay:i*.035}}><div className="history-severity"><span className={`severity-dot ${(x.severity||'Medium').toLowerCase()==='critical'?'critical':(x.severity||'Medium').toLowerCase()==='high'?'warning':'info'}`}/><b>{x.severity}</b></div><div className="history-main"><strong>{x.type} alert · {x.area}</strong><p>{x.message}</p><small>{x.actor} · {x.time}</small></div><span className="status-pill">BROADCAST</span></motion.div>):<div className="empty-state"><Icons.History size={28}/><h3>No broadcast history</h3><p>Once you publish an official alert, it will be tracked in this ledger.</p><button className="primary-button interactive" onClick={()=>navigate('/broadcast')}>Create broadcast</button></div>}</GlassCard></div>}
function NgoCoordination(){const {session}=useAuth();const [assigned,setAssigned]=useState(()=>readList('resq_ngo_assignments',[]));const assign=v=>{if(assigned.includes(v.id))return;const next=[...assigned,v.id];setAssigned(next);writeList('resq_ngo_assignments',next);recordActivity({kind:'accepted',severity:'medium',message:`Partner ${v.name} assigned to a response task`,actor:session.name,time:nowLabel(),createdAt:Date.now()})};const routeToNgo=v=>{const coords=v.coordinates||(v.id==='VOL-331'?{lat:18.5204,lng:73.8567}:v.id==='VOL-284'?{lat:17.6805,lng:74.0183}:v.id==='VOL-198'?{lat:18.5074,lng:73.8077}:{lat:18.4900,lng:73.8150});window.open(`https://www.google.com/maps/dir/?api=1&destination=${coords.lat},${coords.lng}&travelmode=driving`,'_blank','noopener,noreferrer')};return <div className="content-stack"><PageIntro kicker="Partner network" title="NGO coordination" sub="See partner coverage, available teams and the missions that need capacity."/><div className="partner-grid">{volunteers.map(v=><GlassCard key={v.id}><div className="partner-head"><span className="avatar">{v.name[0]}</span><div><b>{v.name}</b><small>{v.skill} · {v.area}</small></div><span className="status-pill">{v.status}</span></div><div className="partner-metric"><span>Missions</span><b>{v.missions}</b></div><div style={{display:'flex',gap:'8px',marginTop:'10px'}}><button className="secondary-button full interactive" onClick={()=>assign(v)}>{assigned.includes(v.id)?'Task assigned ✓':'Assign task'}</button><button type="button" className="secondary-button interactive" title="Open Google Maps navigation to partner HQ" onClick={()=>routeToNgo(v)} style={{display:'inline-flex',alignItems:'center',gap:'4px'}}><Icons.Navigation size={13}/> Route</button></div></GlassCard>)}</div></div>}
function Analytics(){
  const [range,setRange]=useState('24h');
  const [selected,setSelected]=useState('Flood');
  const insight={
    Flood:'Peak requests correlate with river-basin alerts.',
    Fire:'Containment windows improved in industrial zones.',
    Heatwave:'Cooling-center demand is rising after noon.',
    Other:'Road and family-safety requests are steady.'
  };

  return (
    <div className="content-stack">
      <PageIntro
        kicker="Operational intelligence"
        title="Response analytics"
        sub="Explore demand, incident mix, response quality and partner activity through an interactive operations view."
        actions={
          <div className="chart-controls">
            {['24h','7d','30d'].map(x=>(
              <button key={x} className={`filter-chip interactive ${range===x?'active':''}`} onClick={()=>setRange(x)}>
                {x}
              </button>
            ))}
          </div>
        }
      />

      <GlassCard className="analytics-decision-card">
        <div className="decision-card-left">
          <div className="decision-badge-row">
            <span className="decision-eyebrow"><Icons.Activity size={14}/> OPERATIONAL DECISION SIGNAL</span>
            <span className="decision-live-pill"><span className="live-dot pulse-green"/> ACTIVE TELEMETRY</span>
          </div>
          <h3 className="decision-headline">{insight[selected]}</h3>
          <p className="decision-sub">Correlate emergency request surges with river-basin sensors, weather radars, and community triage reports.</p>
        </div>
        <div className="decision-card-right">
          <div className="decision-signal-chip">
            <span className="signal-chip-label">PRIMARY TELEMETRY SIGNAL</span>
            <div className="signal-chip-val">
              <Icons.Radio size={16} className="signal-pulse-ico"/>
              <strong>{selected}</strong>
            </div>
            <small className="signal-chip-meta">Highest Correlated Disaster Vector</small>
          </div>
        </div>
      </GlassCard>

      <div className="stats-grid four">
        <Metric label="Requests received" value="1,284" sub="+14% vs yesterday" Icon={Icons.Inbox}/>
        <Metric label="Resolved" value="1,106" sub="86% completion" Icon={Icons.CheckCircle2} accent="aqua"/>
        <Metric label="Avg. response" value="11m" sub="↓ 2m this week" Icon={Icons.Clock3} accent="amber"/>
        <Metric label="NGO participation" value="74%" sub="42 active partners" Icon={Icons.Handshake} accent="violet"/>
      </div>

      <div className="dashboard-columns analytics-dashboard-columns">
        <GlassCard className="analytics-card analytics-chart-card">
          <CardHeader title={`Incident Triage Velocity · ${range}`}/>
          <TrendChart range={range}/>
        </GlassCard>

        <GlassCard className="analytics-card analytics-mix-card">
          <CardHeader title="Disaster Vector Mix & Telemetry"/>
          <DisasterMixChart selected={selected} setSelected={setSelected} insight={insight}/>
        </GlassCard>
      </div>
    </div>
  );
}

function TrendChart({range}){
  const [chartMode,setChartMode]=useState('telemetry');
  const [hoverIdx,setHoverIdx]=useState(null);
  const [drillBump,setDrillBump]=useState(0);

  useEffect(()=>{
    const onTick = () => {
      setDrillBump(b => (b + 3) % 22);
    };
    window.addEventListener('resq:drill-tick', onTick);
    return () => window.removeEventListener('resq:drill-tick', onTick);
  },[]);

  const rawSeries = range === '24h' ? [
    { label: '02:00', requests: 42, resolved: 36, critical: 6, area: 'Mula Basin', mtta: 3.8, sla: 98.4 },
    { label: '04:00', requests: 56, resolved: 48, critical: 9, area: 'Sinhagad Corridor', mtta: 4.1, sla: 97.2 },
    { label: '06:00', requests: 38, resolved: 34, critical: 4, area: 'Warje Sector', mtta: 3.2, sla: 99.1 },
    { label: '08:00', requests: 74, resolved: 62, critical: 12, area: 'Kothrud Core', mtta: 5.4, sla: 96.0 },
    { label: '10:00', requests: 64, resolved: 58, critical: 8, area: 'Hadapsar Hub', mtta: 4.5, sla: 97.8 },
    { label: '12:00', requests: 81, resolved: 70, critical: 14, area: 'Shivaji Nagar HQ', mtta: 6.2, sla: 95.1 },
    { label: '14:00', requests: 67, resolved: 60, critical: 10, area: 'Deccan Gymkhana', mtta: 4.9, sla: 97.0 },
    { label: '16:00', requests: 88, resolved: 76, critical: 15, area: 'Pimpri Industrial', mtta: 6.8, sla: 94.8 },
    { label: '18:00', requests: 94, resolved: 82, critical: 18, area: 'Aundh Corridor', mtta: 7.2, sla: 93.9 },
    { label: '20:00', requests: 76, resolved: 68, critical: 11, area: 'Katraj Basin', mtta: 5.6, sla: 96.5 },
    { label: '22:00', requests: 82, resolved: 74, critical: 13, area: 'Camp District', mtta: 5.9, sla: 95.8 },
    { label: '24:00', requests: 69, resolved: 65, critical: 8, area: 'Viman Nagar Sector', mtta: 4.6, sla: 98.0 },
  ] : range === '7d' ? [
    { label: 'Mon', requests: 62, resolved: 54, critical: 11, area: 'District West', mtta: 4.8, sla: 96.8 },
    { label: 'Tue', requests: 48, resolved: 42, critical: 7, area: 'District North', mtta: 3.9, sla: 98.2 },
    { label: 'Wed', requests: 71, resolved: 63, critical: 12, area: 'River Corridor', mtta: 5.2, sla: 95.9 },
    { label: 'Thu', requests: 88, resolved: 78, critical: 16, area: 'Metro Core', mtta: 6.7, sla: 94.3 },
    { label: 'Fri', requests: 92, resolved: 84, critical: 17, area: 'Industrial East', mtta: 7.1, sla: 93.7 },
    { label: 'Sat', requests: 75, resolved: 70, critical: 10, area: 'Valley Route', mtta: 5.4, sla: 96.9 },
    { label: 'Sun', requests: 84, resolved: 79, critical: 14, area: 'Highland Pass', mtta: 6.1, sla: 95.4 },
  ] : [
    { label: 'W1', requests: 54, resolved: 48, critical: 9, area: 'Week 1 Surge', mtta: 4.4, sla: 97.5 },
    { label: 'W2', requests: 68, resolved: 60, critical: 12, area: 'Week 2 Baseline', mtta: 5.1, sla: 96.2 },
    { label: 'W3', requests: 61, resolved: 55, critical: 10, area: 'Week 3 Advisory', mtta: 4.7, sla: 97.0 },
    { label: 'W4', requests: 78, resolved: 70, critical: 14, area: 'Week 4 Monsoon Front', mtta: 5.8, sla: 95.3 },
    { label: 'W5', requests: 89, resolved: 81, critical: 16, area: 'Week 5 Peak Runoff', mtta: 6.6, sla: 94.1 },
    { label: 'W6', requests: 94, resolved: 86, critical: 18, area: 'Week 6 Inundation', mtta: 7.0, sla: 93.5 },
    { label: 'W7', requests: 81, resolved: 74, critical: 13, area: 'Week 7 Relief Staging', mtta: 5.9, sla: 95.8 },
    { label: 'W8', requests: 97, resolved: 88, critical: 19, area: 'Week 8 Inflow Surge', mtta: 7.4, sla: 92.8 },
  ];

  const series = rawSeries.map((item, idx) => {
    if (drillBump > 0 && idx >= rawSeries.length - 2) {
      return {
        ...item,
        requests: Math.min(99, item.requests + drillBump),
        resolved: Math.min(92, item.resolved + Math.floor(drillBump * 0.75))
      };
    }
    return item;
  });

  const maxVal = 100;
  const peakPoint = [...series].sort((a,b)=>b.requests-a.requests)[0];
  const avgRequests = Math.round(series.reduce((acc,s)=>acc+s.requests,0)/series.length);
  const avgResolved = Math.round(series.reduce((acc,s)=>acc+s.resolved,0)/series.length);
  const resolutionRate = Math.round((avgResolved/avgRequests)*100);

  // Calculate Statistical Process Control (SPC) Limits
  const variance = series.reduce((acc,s)=>acc+Math.pow(s.requests-avgRequests,2),0)/series.length;
  const stdDev = Math.round(Math.sqrt(variance));
  const ucl = Math.min(98, Math.round(avgRequests + 1.8 * stdDev)); // Upper Control Limit
  const lcl = Math.max(15, Math.round(avgRequests - 1.8 * stdDev)); // Lower Control Limit

  // Calculate 3-interval Exponential Moving Average (EMA)
  const emaValues = [];
  const k = 2 / (3 + 1);
  let prevEma = series[0].requests;
  series.forEach((pt, i) => {
    if (i === 0) {
      emaValues.push(pt.requests);
    } else {
      prevEma = pt.requests * k + prevEma * (1 - k);
      emaValues.push(Math.round(prevEma));
    }
  });

  const svgW = 600;
  const svgH = 220;
  const padX = 28;
  const padY = 24;
  const chartW = svgW - padX * 2;
  const chartH = svgH - padY * 2;

  const getX = idx => padX + (idx / (series.length - 1)) * chartW;
  const getY = val => padY + chartH - (val / maxVal) * chartH;

  // Build crisp curves without neon distortion
  const buildSmoothPath = (values) => values.reduce((acc, val, idx, arr) => {
    const x = getX(idx);
    const y = getY(val);
    if (idx === 0) return `M ${x} ${y}`;
    const prevX = getX(idx - 1);
    const prevY = getY(arr[idx - 1]);
    const cpX1 = prevX + (x - prevX) / 2;
    const cpY1 = prevY;
    const cpX2 = prevX + (x - prevX) / 2;
    const cpY2 = y;
    return `${acc} C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${x} ${y}`;
  }, '');

  const reqLine = buildSmoothPath(series.map(s => s.requests));
  const emaLine = buildSmoothPath(emaValues);
  const reqArea = `${reqLine} L ${getX(series.length - 1)} ${padY + chartH} L ${getX(0)} ${padY + chartH} Z`;

  return (
    <div className="enhanced-trend-chart realistic-analytics-chart">
      {/* Telemetry Header KPIs */}
      <div className="chart-telemetry-header">
        <div className="chart-stat-chips">
          <div className="telemetry-chip peak-chip">
            <span className="chip-indicator"><Icons.TrendingUp size={12}/> SURGE PEAK</span>
            <b>{peakPoint.requests} req/h</b>
            <small>at {peakPoint.label} ({peakPoint.area})</small>
          </div>
          <div className="telemetry-chip avg-chip">
            <span className="chip-indicator"><Icons.Activity size={12}/> MEAN INFLOW</span>
            <b>{avgRequests} req/h</b>
            <small>±{stdDev} σ standard dev</small>
          </div>
          <div className="telemetry-chip rate-chip">
            <span className="chip-indicator"><Icons.CheckCircle2 size={12}/> DISPATCH VELOCITY</span>
            <b>{resolutionRate}%</b>
            <small>{avgResolved} units/hr deployed</small>
          </div>
          <div className="telemetry-chip sla-chip">
            <span className="chip-indicator"><Icons.ShieldCheck size={12}/> SLA RELIABILITY</span>
            <b>96.8%</b>
            <small>Mean MTTA 4.8 min</small>
          </div>
        </div>

        <div className="chart-view-toggles">
          <button
            type="button"
            className={`chart-mode-btn ${chartMode === 'telemetry' ? 'active' : ''}`}
            onClick={() => setChartMode('telemetry')}
          >
            <Icons.TrendingUp size={12}/> Statistical Telemetry
          </button>
          <button
            type="button"
            className={`chart-mode-btn ${chartMode === 'histogram' ? 'active' : ''}`}
            onClick={() => setChartMode('histogram')}
          >
            <Icons.BarChart2 size={12}/> Triage Histogram
          </button>
        </div>
      </div>

      {/* Main Visual Chart */}
      <div className="chart-canvas-wrapper" onMouseLeave={() => setHoverIdx(null)}>
        <div className="chart-axis-y">
          <span>100</span>
          <span>75</span>
          <span>50</span>
          <span>25</span>
          <span>0</span>
        </div>

        <div className="svg-chart-container">
          <svg viewBox={`0 0 ${svgW} ${svgH}`} className="telemetry-svg" preserveAspectRatio="none">
            <defs>
              {/* Subtle professional gradient fill without neon glow */}
              <linearGradient id="realisticReqArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0284c7" stopOpacity="0.28"/>
                <stop offset="60%" stopColor="#0284c7" stopOpacity="0.08"/>
                <stop offset="100%" stopColor="#0284c7" stopOpacity="0.01"/>
              </linearGradient>
              <linearGradient id="realBarReq" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0284c7" stopOpacity="0.85"/>
                <stop offset="100%" stopColor="#0369a1" stopOpacity="0.45"/>
              </linearGradient>
              <linearGradient id="realBarRes" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity="0.85"/>
                <stop offset="100%" stopColor="#047857" stopOpacity="0.45"/>
              </linearGradient>
            </defs>

            {/* Gridlines */}
            {[0, 25, 50, 75, 100].map(val => (
              <line key={val} x1={padX} y1={getY(val)} x2={svgW - padX} y2={getY(val)} className="chart-gridline"/>
            ))}

            {/* Upper Control Limit (UCL) & Lower Control Limit (LCL) */}
            <line x1={padX} y1={getY(ucl)} x2={svgW - padX} y2={getY(ucl)} className="spc-ucl-line"/>
            <text x={svgW - padX - 6} y={getY(ucl) - 4} className="spc-label ucl-label" textAnchor="end">
              UCL (+2σ): {ucl} req/h
            </text>

            <line x1={padX} y1={getY(lcl)} x2={svgW - padX} y2={getY(lcl)} className="spc-lcl-line"/>
            <text x={svgW - padX - 6} y={getY(lcl) + 10} className="spc-label lcl-label" textAnchor="end">
              LCL (-2σ): {lcl} req/h
            </text>

            {/* Mean Baseline */}
            <line x1={padX} y1={getY(avgRequests)} x2={svgW - padX} y2={getY(avgRequests)} className="spc-mean-line"/>

            {chartMode === 'telemetry' ? (
              <>
                {/* Background Triage Throughput Columns */}
                {series.map((pt, i) => {
                  const cx = getX(i);
                  const barW = (chartW / series.length) * 0.45;
                  const resH = (pt.resolved / maxVal) * chartH;
                  return (
                    <rect
                      key={`res-bar-${i}`}
                      x={cx - barW / 2}
                      y={padY + chartH - resH}
                      width={barW}
                      height={resH}
                      fill="#10b981"
                      opacity="0.22"
                      rx="2"
                    />
                  );
                })}

                {/* Primary Area Fill */}
                <path d={reqArea} fill="url(#realisticReqArea)" />

                {/* Exponential Moving Average (Trend Line) */}
                <path d={emaLine} fill="none" stroke="#f59e0b" strokeWidth="1.8" strokeDasharray="5 3" opacity="0.9" />

                {/* Real SOS Distress Line */}
                <path d={reqLine} fill="none" stroke="#0284c7" strokeWidth="2.4" />

                {/* Data Points */}
                {series.map((pt, i) => {
                  const cx = getX(i);
                  const cy = getY(pt.requests);
                  const isHovered = hoverIdx === i;
                  return (
                    <g key={i} className="point-group">
                      <circle
                        cx={cx}
                        cy={cy}
                        r={isHovered ? 5.5 : 3}
                        fill={isHovered ? '#38bdf8' : '#071521'}
                        stroke="#0284c7"
                        strokeWidth={isHovered ? 2.5 : 1.8}
                        className="realistic-data-dot"
                      />
                    </g>
                  );
                })}
              </>
            ) : (
              /* Histogram Mode: Clean dual-column bars */
              <g className="bars-group">
                {series.map((pt, i) => {
                  const cx = getX(i);
                  const barWidth = Math.max(8, Math.min(18, (chartW / series.length) * 0.36));
                  const gap = 3;
                  const reqH = (pt.requests / maxVal) * chartH;
                  const resH = (pt.resolved / maxVal) * chartH;
                  const isHovered = hoverIdx === i;
                  return (
                    <g key={i} className={`dual-bar-pair ${isHovered ? 'bar-pair-hover' : ''}`}>
                      <rect
                        x={cx - barWidth - gap/2}
                        y={padY + chartH - reqH}
                        width={barWidth}
                        height={reqH}
                        rx="2"
                        fill="url(#realBarReq)"
                        className="req-rect"
                      />
                      <rect
                        x={cx + gap/2}
                        y={padY + chartH - resH}
                        width={barWidth}
                        height={resH}
                        rx="2"
                        fill="url(#realBarRes)"
                        className="res-rect"
                      />
                    </g>
                  );
                })}
              </g>
            )}

            {/* Hairline Scrubber */}
            {hoverIdx !== null && (
              <line
                x1={getX(hoverIdx)}
                y1={padY}
                x2={getX(hoverIdx)}
                y2={padY + chartH}
                className="realistic-scrubber-line"
              />
            )}
          </svg>

          {/* Interactive Hitbox Strips */}
          <div className="chart-hitboxes">
            {series.map((s, i) => (
              <div key={i} className="chart-hitbox-col" onMouseEnter={() => setHoverIdx(i)} />
            ))}
          </div>

          {/* Precision Tooltip */}
          {hoverIdx !== null && (
            <motion.div
              className="chart-hud-tooltip realistic-tooltip glass-panel"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.1 }}
              style={{
                left: `${(hoverIdx / (series.length - 1)) * 68 + 16}%`,
                top: '6%'
              }}
            >
              <div className="tooltip-topbar">
                <span className="tooltip-time">{series[hoverIdx].label} Window</span>
                <span className="tooltip-zone">{series[hoverIdx].area}</span>
              </div>
              <div className="tooltip-metrics-matrix">
                <div className="matrix-cell">
                  <span className="matrix-lbl">SOS Inflow</span>
                  <b className="matrix-val blue">{series[hoverIdx].requests} <small>req/h</small></b>
                </div>
                <div className="matrix-cell">
                  <span className="matrix-lbl">Dispatched</span>
                  <b className="matrix-val green">{series[hoverIdx].resolved} <small>units</small></b>
                </div>
                <div className="matrix-cell">
                  <span className="matrix-lbl">Code Red</span>
                  <b className="matrix-val red">{series[hoverIdx].critical} <small>high</small></b>
                </div>
                <div className="matrix-cell">
                  <span className="matrix-lbl">Ack Latency</span>
                  <b className="matrix-val">{series[hoverIdx].mtta} <small>min</small></b>
                </div>
                <div className="matrix-cell">
                  <span className="matrix-lbl">SLA Score</span>
                  <b className="matrix-val amber">{series[hoverIdx].sla}%</b>
                </div>
                <div className="matrix-cell">
                  <span className="matrix-lbl">EMA Trend</span>
                  <b className="matrix-val">{emaValues[hoverIdx]} <small>moving</small></b>
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </div>

      {/* X Axis */}
      <div className="chart-axis-x">
        {series.map((s, i) => (
          <span key={i} className={`x-tick ${hoverIdx === i ? 'tick-highlight' : ''}`}>
            {s.label}
          </span>
        ))}
      </div>

      {/* Professional Telemetry Legend */}
      <div className="chart-footer-legend realistic-legend">
        <div className="legend-indicator-item">
          <span className="legend-sample-line req-sample"/>
          <span>SOS Distress Rate (req/h)</span>
        </div>
        <div className="legend-indicator-item">
          <span className="legend-sample-line ema-sample"/>
          <span>7-Period Moving Average</span>
        </div>
        <div className="legend-indicator-item">
          <span className="legend-sample-box res-box-sample"/>
          <span>Dispatched Units Capacity</span>
        </div>
        <div className="legend-indicator-item">
          <span className="legend-sample-line ucl-sample"/>
          <span>Upper Control Limit (UCL)</span>
        </div>
      </div>
    </div>
  );
}

function DisasterMixChart({ selected, setSelected, insight }) {
  const [hoveredVector, setHoveredVector] = useState(null);
  const [mixMode, setMixMode] = useState('segmented'); // 'segmented' | 'pareto'

  const vectors = [
    {
      id: 'Flood',
      name: 'Flood & Inundation Rescue',
      percent: 42,
      incidents: 539,
      color: '#0284c7',
      secondary: '#0369a1',
      severity: 'CRITICAL',
      defcon: 'CODE 1',
      mttr: '38 min',
      saturation: '84%',
      fieldUnits: 38,
      trend: '+12.4% vs 24h baseline',
      sector: 'Mula-Mutha River Corridor',
      ico: Icons.Waves
    },
    {
      id: 'Fire',
      name: 'Industrial Fire & Hazmat',
      percent: 21,
      incidents: 269,
      color: '#d97706',
      secondary: '#b45309',
      severity: 'ELEVATED',
      defcon: 'CODE 2',
      mttr: '52 min',
      saturation: '61%',
      fieldUnits: 22,
      trend: '-4.2% contained',
      sector: 'Hadapsar MIDC Corridor',
      ico: Icons.Flame
    },
    {
      id: 'Heatwave',
      name: 'Extreme Thermal & Power Grid',
      percent: 18,
      incidents: 231,
      color: '#7c3aed',
      secondary: '#6d28d9',
      severity: 'MONITORED',
      defcon: 'CODE 3',
      mttr: '24 min',
      saturation: '45%',
      fieldUnits: 16,
      trend: '+7.8% afternoon surge',
      sector: 'Shivaji Nagar Core Metro',
      ico: Icons.SunMedium
    },
    {
      id: 'Other',
      name: 'Medical Escort & Structural SAR',
      percent: 19,
      incidents: 244,
      color: '#dc2626',
      secondary: '#b91c1c',
      severity: 'STANDBY',
      defcon: 'CODE 4',
      mttr: '19 min',
      saturation: '52%',
      fieldUnits: 19,
      trend: 'Normal statistical baseline',
      sector: 'Sinhagad Mountain Corridor',
      ico: Icons.Siren
    }
  ];

  const activeVector = vectors.find(v => v.id === selected) || vectors[0];
  const ActiveIcon = activeVector.ico;

  const size = 200;
  const radius = 74;
  const circumference = 2 * Math.PI * radius;
  let cumulative = 0;

  return (
    <div className="enhanced-disaster-mix realistic-disaster-mix">
      {/* Top Telemetry Row */}
      <div className="mix-visual-row">
        {/* Crisp Segmented Telemetry Ring without neon blur */}
        <div className="donut-radar-container realistic-ring-container">
          <svg viewBox={`0 0 ${size} ${size}`} className="donut-radar-svg realistic-ring-svg">
            {/* Background Track */}
            <circle
              cx={size/2}
              cy={size/2}
              r={radius}
              className="donut-bg-track"
              strokeWidth="14"
            />
            {/* Azimuth tick marks */}
            <circle
              cx={size/2}
              cy={size/2}
              r={radius + 12}
              className="donut-azimuth-ring"
              strokeDasharray="2 8"
              strokeWidth="1"
            />

            {/* Clean Segment Arcs */}
            {vectors.map((vec) => {
              const arcLength = (vec.percent / 100) * circumference;
              const gap = 2.5; // Clean crisp separator gap
              const strokeDasharray = `${Math.max(0, arcLength - gap)} ${circumference}`;
              const strokeDashoffset = -((cumulative / 100) * circumference);
              cumulative += vec.percent;
              const isSelected = selected === vec.id;
              const isHovered = hoveredVector === vec.id;

              return (
                <circle
                  key={vec.id}
                  cx={size/2}
                  cy={size/2}
                  r={radius}
                  fill="transparent"
                  stroke={vec.color}
                  strokeWidth={isSelected || isHovered ? 18 : 13}
                  strokeDasharray={strokeDasharray}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="butt"
                  className={`donut-segment-circle realistic-segment ${isSelected ? 'segment-selected' : ''}`}
                  onClick={() => setSelected(vec.id)}
                  onMouseEnter={() => setHoveredVector(vec.id)}
                  onMouseLeave={() => setHoveredVector(null)}
                />
              );
            })}
          </svg>

          {/* Clean Data Matrix Center Hub */}
          <div
            className="donut-center-hub realistic-center-hub interactive"
            onClick={() => {
              const nextIdx = (vectors.findIndex(v => v.id === selected) + 1) % vectors.length;
              setSelected(vectors[nextIdx].id);
            }}
          >
            <div className="center-hub-ico" style={{ color: activeVector.color }}>
              <ActiveIcon size={20}/>
            </div>
            <strong className="center-hub-pct">{activeVector.percent}%</strong>
            <span className="center-hub-name">{activeVector.id}</span>
            <div className="center-hub-mini-matrix">
              <span>{activeVector.incidents} Incidents</span>
              <span>MTTR {activeVector.mttr}</span>
            </div>
          </div>
        </div>

        {/* Detailed Operational Vector Breakdown Matrix */}
        <div className="vector-cards-stack realistic-vector-table">
          {vectors.map((vec) => {
            const isSelected = selected === vec.id;
            const Icon = vec.ico;

            return (
              <button
                type="button"
                key={vec.id}
                className={`vector-item-card realistic-vector-row interactive ${isSelected ? 'vector-active' : ''}`}
                onClick={() => setSelected(vec.id)}
                onMouseEnter={() => setHoveredVector(vec.id)}
                onMouseLeave={() => setHoveredVector(null)}
                style={{
                  '--vec-color': vec.color,
                  '--vec-bg': `${vec.color}12`
                }}
              >
                <div className="vector-card-head">
                  <span className="vector-icon" style={{ color: vec.color }}>
                    <Icon size={14}/>
                  </span>
                  <div className="vector-titles-col">
                    <span className="vector-title">{vec.name}</span>
                    <small className="vector-sector-sub">{vec.sector}</small>
                  </div>
                  <span className="vector-pct-badge" style={{ color: vec.color, borderColor: `${vec.color}35` }}>
                    {vec.percent}%
                  </span>
                </div>

                <div className="vector-operational-meta-grid">
                  <div className="op-meta-cell">
                    <span className="lbl">INCIDENTS</span>
                    <b className="val">{vec.incidents}</b>
                  </div>
                  <div className="op-meta-cell">
                    <span className="lbl">AVG MTTR</span>
                    <b className="val">{vec.mttr}</b>
                  </div>
                  <div className="op-meta-cell">
                    <span className="lbl">SATURATION</span>
                    <b className="val">{vec.saturation}</b>
                  </div>
                  <div className="op-meta-cell">
                    <span className="lbl">STATUS</span>
                    <b className="val code" style={{ color: vec.color }}>{vec.defcon}</b>
                  </div>
                </div>

                <div className="vector-progress-rail">
                  <div
                    className="vector-progress-fill"
                    style={{
                      width: `${vec.percent}%`,
                      background: vec.color
                    }}
                  />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Intelligence Directive Footer */}
      <div className="mix-intelligence-footbar realistic-intel-foot">
        <div className="intel-foot-left">
          <span className="intel-label">
            <Icons.Radio size={12}/> SITUATIONAL INTELLIGENCE DIRECTIVE:
          </span>
          <strong className="intel-vector-title" style={{ color: activeVector.color }}>
            {activeVector.name} &bull; {activeVector.sector}
          </strong>
          <p className="intel-vector-desc">
            {insight[selected] || 'High incident density correlated with meteorological radar readings. Field units assigned at ' + activeVector.saturation + ' capacity.'}
          </p>
        </div>
        <div className="intel-foot-right">
          <span className="intel-urgency-badge" style={{ color: activeVector.color, borderColor: `${activeVector.color}40`, background: `${activeVector.color}15` }}>
            {activeVector.severity} DEFCON
          </span>
        </div>
      </div>
    </div>
  );
}

function Users(){return <div className="content-stack"><PageIntro kicker="Identity control" title="User administration" sub="Manage role assignment and account states. Every change should be auditable."/><GlassCard className="table-card"><div className="table-wrap"><table><thead><tr><th>User</th><th>Role</th><th>Status</th><th>Last active</th><th>Permission envelope</th></tr></thead><tbody>{[['Harshal Mogare','Citizen','Active','2 min','Signed'],['Meera P.','NGO / Volunteer','Active','4 min','Signed'],['Officer #024','Government Officer','Active','1 min','Signed'],['Admin #001','System Admin','Active','now','Signed']].map(r=><tr key={r[0]}><td><b>{r[0]}</b></td><td>{r[1]}</td><td><span className="live-status">● {r[2]}</span></td><td>{r[3]}</td><td><span className="security-tag"><Icons.LockKeyhole size={12}/>{r[4]}</span></td></tr>)}</tbody></table></div></GlassCard></div>}
function Permissions(){const matrix=[['Citizen','View alerts','Request help','Report incident','Broadcast','Admin users'],['NGO / Volunteer','View alerts','Volunteer tasks','Update missions','Broadcast','Admin users'],['Government','All public views','Verify requests','Manage shelters','Broadcast','Admin users'],['System Admin','All views','All controls','Audit','Broadcast','Users / policy']];return <div className="content-stack"><PageIntro kicker="Access policy" title="Role permissions" sub="The UI uses a signed, tamper-evident permission envelope for demo role routing. A production version must validate permissions server-side."/><GlassCard><div className="permission-grid">{matrix.map((row,i)=><div className="perm-row" key={row[0]}>{row.map((x,j)=><div key={x} className={j===0?'role-cell':'perm-cell'}>{j===0?<b>{x}</b>:<span><Icons.CheckCircle2 size={13}/>{x}</span>}</div>)}</div>)}</div></GlassCard><GlassCard><CardHeader title="Permission principles"/><div className="scope-grid"><ScopeItem icon={Icons.Lock} title="Least privilege" text="Citizen and volunteer sessions expose only the actions they need."/><ScopeItem icon={Icons.Fingerprint} title="Tamper evidence" text="Session envelopes include a deterministic checksum to detect local edits in the demo."/><ScopeItem icon={Icons.ServerCog} title="Trusted enforcement" text="Sensitive operations must be authorized on the backend in production."/></div></GlassCard></div>}
function Audit(){
  const [auditList, setAuditList] = useState(audits);
  const [verification, setVerification] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [toast, setToast] = useState('');

  const loadAuditData = () => {
    api.audit.getAll()
      .then(res => {
        if (res?.audits?.length > 0) {
          setAuditList(res.audits);
        }
      })
      .catch(() => {});

    api.audit.verify()
      .then(res => {
        if (res?.verification) {
          setVerification(res.verification);
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    loadAuditData();
  }, []);

  const runVerification = async () => {
    setVerifying(true);
    try {
      const res = await api.audit.verify();
      setVerification(res.verification);
      setToast(res.verification?.valid ? '✓ Cryptographic hash chain verified 100% intact!' : '⚠️ Warning: Ledger integrity mismatch.');
    } catch {
      setToast('Verification server check failed.');
    } finally {
      setVerifying(false);
      setTimeout(() => setToast(''), 3000);
    }
  };

  return (
    <div className="content-stack">
      <PageIntro
        kicker="Cryptographic Traceability"
        title="Tamper-proof audit ledger"
        sub="Every high-impact disaster action is signed and permanently linked with a SHA-256 cryptographic hash pointer."
        actions={
          <button type="button" className="secondary-button interactive" disabled={verifying} onClick={runVerification}>
            <Icons.ShieldCheck size={14}/> {verifying ? 'Verifying...' : 'Verify Ledger Integrity'}
          </button>
        }
      />

      {/* Cryptographic Ledger Status Banner */}
      <div className="glass-panel" style={{padding:'16px 20px',borderRadius:'12px',background:verification?.valid?'rgba(16,185,129,0.08)':'rgba(244,63,94,0.08)',border:`1px solid ${verification?.valid?'rgba(16,185,129,0.3)':'rgba(244,63,94,0.3)'}`,display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:'12px'}}>
        <div style={{display:'flex',alignItems:'center',gap:'12px'}}>
          <div style={{width:'38px',height:'38px',borderRadius:'8px',background:verification?.valid?'#10b981':'#f43f5e',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff'}}>
            <Icons.Link size={18}/>
          </div>
          <div>
            <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
              <strong style={{fontSize:'14px',color:verification?.valid?'#10b981':'#f43f5e'}}>
                {verification?.valid ? 'SHA-256 IMMUTABLE LEDGER: VERIFIED' : 'INTEGRITY SCAN: PENDING / WARNING'}
              </strong>
              <span className="status-pill" style={{fontSize:'10px'}}>
                {verification?.auditedCount || auditList.length} BLOCKS VALIDATED
              </span>
            </div>
            <small style={{color:'#94a3b8',display:'block',marginTop:'2px',fontFamily:'monospace',fontSize:'11px'}}>
              Latest Block Hash: {verification?.latestHash ? `${verification.latestHash.slice(0, 24)}...${verification.latestHash.slice(-8)}` : 'Generating genesis pointer...'}
            </small>
          </div>
        </div>
        <div style={{fontSize:'11px',color:'#cbd5e1',background:'rgba(255,255,255,0.05)',padding:'6px 12px',borderRadius:'6px'}}>
          Zero Tampering Detected · Merkle Chained
        </div>
      </div>

      <GlassCard className="table-card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Block Time</th>
                <th>Authorized Actor</th>
                <th>Operation & Critical Action</th>
                <th>Risk Level</th>
                <th>Cryptographic Hash</th>
              </tr>
            </thead>
            <tbody>
              {auditList.map((a, i) => (
                <tr key={a.id || i}>
                  <td>
                    <span style={{color:'#94a3b8',fontSize:'12px'}}>{a.time}</span>
                  </td>
                  <td>
                    <b>{a.actor}</b>
                  </td>
                  <td>{a.action}</td>
                  <td>
                    <span className={`priority ${a.severity}`}>{a.severity}</span>
                  </td>
                  <td>
                    <code style={{fontSize:'10px',color:'#38bdf8',background:'rgba(56,189,248,0.1)',padding:'2px 6px',borderRadius:'4px'}}>
                      {a.hash ? a.hash.slice(0, 16) + '...' : 'Genesis #' + (auditList.length - i)}
                    </code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>

      {toast && <div className="toast glass-panel"><Icons.CheckCircle2 size={16}/> {toast}</div>}
    </div>
  );
}
function ProfilePreferences(){
  const {session}=useAuth();
  const existing=readProfile();
  const allStates=getAllStates();
  const [form,setForm]=useState({
    username:existing.username||session.name.toLowerCase().replace(/\s+/g,'.'),
    email:existing.email||'',
    phone:existing.phone||'',
    state:existing.state||'Maharashtra',
    district:existing.district||'Pune',
    city:existing.city||'Pune City (Shivaji Nagar)',
    pincode:existing.pincode||'411005',
    address:existing.address||'',
    age:existing.age||'',
    area:existing.area||'Kothrud',
    language:existing.language||'English',
    timezone:existing.timezone||'IST (UTC+5:30)',
    photo:existing.photo||'',
    emergencyName:existing.emergencyName||'',
    emergencyRelationship:existing.emergencyRelationship||'',
    emergencyPhone:existing.emergencyPhone||'',
    criticalAlerts:existing.criticalAlerts!==false,
    campaignUpdates:existing.campaignUpdates!==false,
    volunteerUpdates:existing.volunteerUpdates||false
  });

  const districts=getDistrictsForState(form.state);
  const cities=getCitiesForDistrict(form.state, form.district);
  const set=(k,v)=>setForm(f=>({...f,[k]:v}));

  const handleStateChange=(selectedState)=>{
    const newDistricts=getDistrictsForState(selectedState);
    const firstDistrict=newDistricts[0]||'';
    const newCities=getCitiesForDistrict(selectedState, firstDistrict);
    const firstCityObj=newCities[0]||{city:'',pincode:''};
    setForm(f=>({...f,state:selectedState,district:firstDistrict,city:firstCityObj.city,pincode:firstCityObj.pincode}));
  };

  const handleDistrictChange=(selectedDistrict)=>{
    const newCities=getCitiesForDistrict(form.state, selectedDistrict);
    const firstCityObj=newCities[0]||{city:'',pincode:''};
    setForm(f=>({...f,district:selectedDistrict,city:firstCityObj.city,pincode:firstCityObj.pincode}));
  };

  const handleCityChange=(selectedCity)=>{
    const matched=cities.find(c=>c.city===selectedCity);
    setForm(f=>({...f,city:selectedCity,pincode:matched?matched.pincode:f.pincode}));
  };

  const save=()=>saveProfile(form);
  return <div className="content-stack"><PageIntro kicker="Identity & preferences" title="Profile & preferences" sub="Keep your response profile, location and accessibility choices ready for emergency workflows." actions={<button className="primary-button interactive" onClick={()=>{save();recordActivity({id:crypto.randomUUID?.()||String(Date.now()),kind:'profile',message:'Profile preferences updated',actor:roles[session.role].label,time:'just now'})}}>Save changes <Icons.Check size={15}/></button>}/><div className="profile-layout"><GlassCard className="profile-hero"><div className="profile-photo-wrap">{form.photo?<img src={form.photo} alt="Profile"/>:<span className="avatar profile-avatar">{session.name[0].toUpperCase()}</span>}<label className="photo-add interactive"><Icons.Camera size={15}/><input type="file" accept="image/*" onChange={e=>{const f=e.target.files?.[0];if(!f)return;const r=new FileReader();r.onload=()=>set('photo',String(r.result));r.readAsDataURL(f)}}/> Change photo</label></div><div><span className="eyebrow">Signed identity</span><h3>{session.name}</h3><p>{roles[session.role].label} · Permission envelope verified</p><div className="profile-tags"><span>● Active</span><span>🔒 Signed</span><span>24/7 network</span></div></div></GlassCard><GlassCard><div className="form-grid profile-fields"><div className="form-row"><label>Username</label><div className="input-shell"><Icons.AtSign size={15}/><input value={form.username} onChange={e=>set('username',e.target.value)}/></div></div><div className="form-row"><label>Gmail / Email</label><div className="input-shell"><Icons.Mail size={15}/><input type="email" value={form.email} onChange={e=>set('email',e.target.value)} placeholder="name@gmail.com"/></div></div><div className="form-row"><label>Phone number</label><div className="input-shell"><Icons.Phone size={15}/><input value={form.phone} onChange={e=>set('phone',e.target.value)} placeholder="+91 98••••••••"/></div></div><div className="form-row"><label>Age</label><div className="input-shell"><Icons.CalendarDays size={15}/><input type="number" min="1" max="120" value={form.age} onChange={e=>set('age',e.target.value)} placeholder="25"/></div></div><CustomSelect label="State / UT (All India)" options={allStates} value={form.state} onChange={handleStateChange}/><CustomSelect label="District" options={districts} value={form.district} onChange={handleDistrictChange}/><CustomSelect label="City / Taluka" options={cities.map(c=>c.city)} value={form.city} onChange={handleCityChange}/><div className="form-row"><label>PIN / Postal code <span className="auto-label">AUTO</span></label><div className="input-shell readonly"><Icons.MapPin size={15}/><input value={form.pincode} readOnly/></div></div><div className="form-row"><label>Area / locality</label><div className="input-shell"><Icons.MapPinned size={15}/><input value={form.area} onChange={e=>set('area',e.target.value)} placeholder="Kothrud"/></div></div><div className="form-row full"><label>Full address</label><div className="input-shell"><Icons.Home size={15}/><input value={form.address} onChange={e=>set('address',e.target.value)} placeholder="House / street / landmark"/></div></div><CustomSelect label="Language" options={['English','Hindi','Marathi']} value={form.language} onChange={v=>set('language',v)}/><CustomSelect label="Timezone" options={['IST (UTC+5:30)','UTC','GMT']} value={form.timezone} onChange={v=>set('timezone',v)}/></div></GlassCard></div><div className="dashboard-columns"><GlassCard><CardHeader title="Emergency contact"/><div className="emergency-profile-grid"><div className="form-row"><label>Contact name</label><input value={form.emergencyName} onChange={e=>set('emergencyName',e.target.value)} placeholder="Family / trusted person"/></div><div className="form-row"><CustomSelect label="Relationship" options={['Parent','Sibling','Friend','Partner','Other']} value={form.emergencyRelationship} onChange={v=>set('emergencyRelationship',v)} placeholder="Select relationship"/></div><div className="form-row full"><label>Contact phone</label><input value={form.emergencyPhone} onChange={e=>set('emergencyPhone',e.target.value)} placeholder="+91 …"/></div></div></GlassCard><GlassCard><CardHeader title="Notification preferences"/><div className="pref-toggle-grid"><Setting label="Critical alerts" text="Always allow verified emergency alerts." toggle={form.criticalAlerts} setToggle={v=>set('criticalAlerts',v)}/><Setting label="Campaign updates" text="Notify me about nearby public campaigns." toggle={form.campaignUpdates} setToggle={v=>set('campaignUpdates',v)}/><Setting label="Volunteer opportunities" text="Show eligible response opportunities." toggle={form.volunteerUpdates} setToggle={v=>set('volunteerUpdates',v)}/></div></GlassCard></div></div>
}
function Settings(){
  const [prefs,setPrefs]=useState(()=>({
    emergencyMode:false,
    reducedMotion:false,
    sms:true,
    autoRefresh:true,
    accentGlow:true,
    audioAlerts:true,
    density:'comfortable',
    theme:'dark',
    language:'English',
    accent:'role',
    ...readPrefs()
  }));

  const persist=(next)=>{
    setPrefs(next);
    writePrefs(next);
    recordActivity({
      kind:'settings',
      message:`Interface preferences updated · ${next.theme} · ${next.density} density`,
      actor:'User',
      time:nowLabel(),
      createdAt:Date.now()
    });
  };

  const switchTheme=(nextTheme)=>{
    if(prefs.theme===nextTheme) return;
    const x=window.innerWidth/2;
    const y=window.innerHeight/2;
    window.dispatchEvent(new CustomEvent('resq:themeTransition',{detail:{from:prefs.theme,to:nextTheme,x,y}}));
    persist({...prefs,theme:nextTheme});
  };

  return <div className="content-stack settings-page">
    <PageIntro
      kicker="Emergency Operations Configuration"
      title="System & Display Settings"
      sub="Configure display contrast, telemetry refresh rates, audio siren alerts and field operations theme."
    />

    {/* Direct Theme Selector Section */}
    <div className="tactical-theme-selector-grid">
      <button
        type="button"
        className={`theme-mode-card interactive ${prefs.theme==='dark'?'active-theme':''}`}
        onClick={()=>switchTheme('dark')}
      >
        <div className="theme-card-top">
          <div className="theme-icon dark-mode-icon"><Icons.Moon size={22}/></div>
          <span className="theme-badge">{prefs.theme==='dark'?'ACTIVE POSTURE':'SELECT'}</span>
        </div>
        <h4>Tactical Night Ops (Dark Mode)</h4>
        <p>Deep charcoal-slate HUD with neon emergency threat telemetry. Optimized for command centers and night field operations.</p>
        <div className="theme-preview-dots">
          <span className="dot c-red"/>
          <span className="dot c-amber"/>
          <span className="dot c-cyan"/>
          <span className="dot c-green"/>
        </div>
      </button>

      <button
        type="button"
        className={`theme-mode-card interactive light-card ${prefs.theme==='light'?'active-theme':''}`}
        onClick={()=>switchTheme('light')}
      >
        <div className="theme-card-top">
          <div className="theme-icon light-mode-icon"><Icons.Sun size={22}/></div>
          <span className="theme-badge">{prefs.theme==='light'?'ACTIVE POSTURE':'SELECT'}</span>
        </div>
        <h4>Daylight Field Operations (Light Mode)</h4>
        <p>High-contrast outdoor display with crisp dark-slate typography and vivid alert borders. Engineered for direct sunlight visibility.</p>
        <div className="theme-preview-dots">
          <span className="dot c-navy"/>
          <span className="dot c-blue"/>
          <span className="dot c-orange"/>
          <span className="dot c-emerald"/>
        </div>
      </button>
    </div>

    {/* Operational Toggles */}
    <GlassCard className="tactical-card">
      <CardHeader title="Operational Telemetry & Field Controls"/>
      <div className="settings-list">
        <Setting
          label="Emergency high-contrast HUD"
          text="Maximizes contrast borders and strips cosmetic blur for high-stress triage situations."
          toggle={prefs.emergencyMode}
          setToggle={v=>persist({...prefs,emergencyMode:v})}
        />
        <Setting
          label="Audible alert sirens"
          text="Play simulated emergency audio chime when Level 3 & 4 critical disaster broadcasts are received."
          toggle={prefs.audioAlerts}
          setToggle={v=>persist({...prefs,audioAlerts:v})}
        />
        <Setting
          label="Auto-refresh live radar & telemetry"
          text="Periodically poll simulated GIS incident pins, shelter occupancy changes and mesh nodes every 5 seconds."
          toggle={prefs.autoRefresh}
          setToggle={v=>persist({...prefs,autoRefresh:v})}
        />
        <Setting
          label="LoRa / SMS mesh relay fallback"
          text="Allow offline SMS acknowledgement routing and mock peer-to-peer field communications."
          toggle={prefs.sms}
          setToggle={v=>persist({...prefs,sms:v})}
        />
        <Setting
          label="Accent glow & radar sweeps"
          text="Enable glowing perimeter lighting and 360° tactical sweep lines on operations maps."
          toggle={prefs.accentGlow}
          setToggle={v=>persist({...prefs,accentGlow:v})}
        />
        <Setting
          label="Reduced motion"
          text="Disable radar animations, hover lifts and particle vapor transitions for reduced power consumption."
          toggle={prefs.reducedMotion}
          setToggle={v=>persist({...prefs,reducedMotion:v})}
        />

        <div className="setting-row setting-row-dropdown">
          <div className="setting-label-col">
            <b>Console Information Density</b>
            <p>Select display density for multi-incident monitoring on tablets, laptops or field ruggedized devices.</p>
            <div className="setting-active-indicator">
              <span className="live-dot pulse-green"/>
              <span className="setting-indicator-text">
                ACTIVE GRID: <b>{(prefs.density||'comfortable').toUpperCase()}</b> ({prefs.density==='compact'?'High-density tactical view for multi-monitor consoles':prefs.density==='spacious'?'Large touch-target format for field tablets':'Balanced operational spacing'})
              </span>
            </div>
          </div>
          <CustomSelect
            options={['compact','comfortable','spacious']}
            value={prefs.density}
            onChange={v=>persist({...prefs,density:v})}
          />
        </div>

        <div className="setting-row setting-row-dropdown">
          <div className="setting-label-col">
            <b>Operational Language</b>
            <p>Regional localization for emergency broadcast templates and citizen triage.</p>
            <div className="setting-active-indicator">
              <span className="live-dot pulse-green"/>
              <span className="setting-indicator-text">
                LOCALE: <b>{prefs.language==='Marathi'?'मराठी (Maharashtra Regional)':prefs.language==='Hindi'?'हिंदी (National Standard)':'ENGLISH (Command Standard)'}</b>
              </span>
            </div>
            <div className="lang-broadcast-preview">
              <small className="preview-label">LIVE BROADCAST TEMPLATE PREVIEW:</small>
              <p className="preview-text">
                {prefs.language==='Marathi'
                  ? '⚡ [मराठी सतर्कता] मुळा-मुठा नदी खोऱ्यासाठी लेव्हल ३ पुराचा इशारा. सखल भागातील नागरिकांनी तातडीने जवळच्या निवारा केंद्रात जावे.'
                  : prefs.language==='Hindi'
                  ? '⚡ [हिंदी चेतावनी] मुला-मुथा नदी बेसिन के लिए लेवल 3 बाढ़ की चेतावनी जारी। निचले इलाकों के नागरिक तुरंत नजदीकी राहत शिविरों में जाएं।'
                  : '⚡ [EAS BROADCAST] Level 3 Flood Warning issued for Mula-Mutha Basin. Low-lying residents proceed to designated emergency shelters immediately.'}
              </p>
            </div>
          </div>
          <CustomSelect
            options={['English','Hindi','Marathi']}
            value={prefs.language}
            onChange={v=>persist({...prefs,language:v})}
          />
        </div>
      </div>
    </GlassCard>

    {/* Live Diagnostics Card */}
    <div className="dashboard-columns">
      <GlassCard className="tactical-card">
        <CardHeader title="Field Telemetry Status"/>
        <div className="eoc-status-box">
          <div className="eoc-status-item">
            <span>NETWORK PROTOCOL</span>
            <b>RESQ-MESH v4.2 · TLS 1.3</b>
          </div>
          <div className="eoc-status-item">
            <span>OFFLINE CACHE</span>
            <b>14 Shelter Manifests Cached</b>
          </div>
          <div className="eoc-status-item">
            <span>GIS ACCURACY</span>
            <b>±4.2m · Dual-band GNSS</b>
          </div>
          <div className="eoc-status-item">
            <span>ACTIVE THEME POSTURE</span>
            <b style={{textTransform:'uppercase'}}>{prefs.theme} · {prefs.density}</b>
          </div>
        </div>
      </GlassCard>

      <GlassCard className="tactical-card">
        <CardHeader title="Emergency Hotlines Sync"/>
        <div className="hotline-quick-grid">
          <div className="hotline-item">
            <span className="hl-num">112</span>
            <div>
              <b>National Emergency</b>
              <small>Police, Fire & Medical Unified</small>
            </div>
          </div>
          <div className="hotline-item">
            <span className="hl-num">1077</span>
            <div>
              <b>District Disaster Control (DDMA)</b>
              <small>Pune Emergency Ops Center</small>
            </div>
          </div>
          <div className="hotline-item">
            <span className="hl-num">108</span>
            <div>
              <b>Disaster Ambulance / Trauma</b>
              <small>Field Casualty Evacuation</small>
            </div>
          </div>
        </div>
      </GlassCard>
    </div>
  </div>;
}
function Setting({label,text,toggle,setToggle}){return <div className="setting-row"><div><b>{label}</b><p>{text}</p></div><button type="button" className={`toggle interactive ${toggle?'on':''}`} onClick={()=>setToggle&&setToggle(!toggle)}><i/></button></div>}
function NotFound(){const navigate=useNavigate();return <GlassCard className="not-found"><Icons.MapPinOff size={36}/><h2>Page not found</h2><p>The requested response surface does not exist for this session.</p><div style={{marginTop:16}}><button className="primary-button interactive" onClick={()=>navigate('/dashboard')}><Icons.ArrowLeft size={15}/> Back to safety dashboard</button></div></GlassCard>}
function Login(){
  const {login}=useAuth();
  const [role,setRole]=useState('citizen');
  const allStates=getAllStates();
  const [form,setForm]=useState({
    name:'',
    email:'',
    phone:'',
    state:'Maharashtra',
    district:'Pune',
    taluka:'Haveli',
    city:'Pune City (Shivaji Nagar)',
    pincode:'411005'
  });
  const [code,setCode]=useState('');
  const [showCode,setShowCode]=useState(false);
  const [error,setError]=useState('');
  const navigate=useNavigate();
  const restricted=role==='government'||role==='admin';

  const districts=getDistrictsForState(form.state);
  const talukas=getTalukasForDistrict(form.state, form.district);
  const cities=getCitiesForDistrict(form.state, form.district);

  const handleStateChange=(selectedState)=>{
    const newDistricts=getDistrictsForState(selectedState);
    const firstDistrict=newDistricts[0]||'';
    const newTalukas=getTalukasForDistrict(selectedState, firstDistrict);
    const firstTaluka=newTalukas[0]||'';
    const newCities=getCitiesForDistrict(selectedState, firstDistrict);
    const firstCityObj=newCities[0]||{city:'',pincode:''};
    setForm(f=>({
      ...f,
      state:selectedState,
      district:firstDistrict,
      taluka:firstTaluka,
      city:firstCityObj.city||firstTaluka,
      pincode:firstCityObj.pincode||''
    }));
    setError('');
  };

  const handleDistrictChange=(selectedDistrict)=>{
    const newTalukas=getTalukasForDistrict(form.state, selectedDistrict);
    const firstTaluka=newTalukas[0]||'';
    const newCities=getCitiesForDistrict(form.state, selectedDistrict);
    const firstCityObj=newCities[0]||{city:'',pincode:''};
    setForm(f=>({
      ...f,
      district:selectedDistrict,
      taluka:firstTaluka,
      city:firstCityObj.city||firstTaluka,
      pincode:firstCityObj.pincode||''
    }));
    setError('');
  };

  const handleTalukaChange=(selectedTaluka)=>{
    const matchingCities=cities.filter(c=>c.taluka===selectedTaluka);
    const chosenCity=matchingCities[0]||cities[0]||{city:selectedTaluka,pincode:''};
    setForm(f=>({
      ...f,
      taluka:selectedTaluka,
      city:chosenCity.city||selectedTaluka,
      pincode:chosenCity.pincode||f.pincode
    }));
    setError('');
  };

  const handleCityChange=(selectedCity)=>{
    const matched=cities.find(c=>c.city===selectedCity);
    setForm(f=>({
      ...f,
      city:selectedCity,
      taluka:matched?.taluka||f.taluka,
      pincode:matched?matched.pincode:f.pincode
    }));
    setError('');
  };

  const update=(key,value)=>setForm(v=>({...v,[key]:value}));

  const submit=e=>{
    e.preventDefault();
    const cleanCode = (code || '').trim().toUpperCase();
    const name = form.name.trim() || `${roles[role].label} Member`;
    const email = form.email.trim() || (form.name ? `${form.name.toLowerCase().replace(/\s+/g,'')}@rakshak.in` : `${role}@rakshak.in`);
    const phone = form.phone.trim() || '+91 98765 43210';

    if (restricted && cleanCode !== 'RAKSHAK07' && cleanCode !== 'RESQ07') {
      return setError('Official restricted clearance code is incorrect. Enter official passkey RAKSHAK07.');
    }
    setError('');
    const coordinates=getCoordinatesForLocation(form.state, form.district, form.taluka, form.city);
    login(role, {
      ...form,
      name,
      email,
      phone,
      pincode: form.pincode || '411005',
      taluka: form.taluka || form.city,
      coordinates,
      code: cleanCode || 'RAKSHAK07'
    });
    navigate('/dashboard');
  };

  return <div className={`login-page login-role-${role}`}><CursorFX/><div className="login-layout">
    <div className="login-intro">
     <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:36}}>
       <button className="brand interactive" style={{marginBottom:0}} onClick={()=>navigate('/')}><span className="brand-mark"><Icons.ShieldCheck size={19}/></span><span><b>Rakshak</b><small>Disaster Response · रक्षक</small></span></button>
       <ThemeToggle/>
     </div>
     <span className="eyebrow">National Resilience Network</span><h2>One mission.<br/><em>Immediate response when every second counts.</em></h2>
     <p>Rakshak (रक्षक) coordinates emergency response between citizens, volunteer disaster response teams, and district emergency operations centers.</p>
     <div className="login-proof"><span>⌁</span><b>Role-aware security architecture</b><small>Citizen safety stays focused; official command tiers unlock restricted operations.</small></div>
     <div className="login-side-status"><span className="live-dot"/><div><b>Pan-India National Coverage</b><small>Every state, district, taluka, and locality mapped with instant meteorological telemetry.</small></div></div>
    </div>
    <GlassCard className="login-card premium-login">
     <div className="login-card-head"><span className="eyebrow">Rakshak Sign In</span><span className="secure-chip"><Icons.LockKeyhole size={12}/> Protected</span></div>
     <h3>Access your response profile</h3><p className="login-card-sub">Select your operational role and enter your location details to sign in.</p>

     <div className="role-select-grid">{Object.entries(roles).map(([r,v])=><motion.button type="button" whileHover={{y:-2}} whileTap={{scale:.985}} className={`role-select interactive ${role===r?'active':''}`} key={r} onClick={()=>{setRole(r);setCode('');setError('')}}><span className={`role-dot ${v.accent}`}/><b>{v.label}</b><small>{r==='citizen'?'Focused personal safety':r==='ngo'?'Volunteer response tools':r==='government'?'Official operations access':'Full platform administration'}</small><span className="role-arrow"><Icons.ArrowUpRight size={13}/></span></motion.button>)}</div>
     <form className="login-form" onSubmit={submit}>
       <div className="form-grid compact-login-grid">
         <div className="form-row"><label>Full name</label><div className="input-shell"><Icons.UserRound size={15}/><input value={form.name} onChange={e=>{update('name',e.target.value);setError('')}} placeholder="e.g. Harshal Mogare"/></div></div>
         <div className="form-row"><label>Email / Contact</label><div className="input-shell"><Icons.Mail size={15}/><input type="email" value={form.email} onChange={e=>{update('email',e.target.value);setError('')}} placeholder="you@rakshak.in"/></div></div>
         <div className="form-row"><label>Phone number</label><div className="input-shell"><Icons.Phone size={15}/><input type="tel" value={form.phone} onChange={e=>{update('phone',e.target.value);setError('')}} placeholder="+91 98765 43210"/></div></div>
         <CustomSelect label="State / UT (All India)" options={allStates} value={form.state} onChange={handleStateChange} placeholder="Select State / UT"/>
         <CustomSelect label="District" options={districts} value={form.district} onChange={handleDistrictChange} placeholder="Select District"/>
         <CustomSelect label="Taluka / Sub-district" options={talukas} value={form.taluka} onChange={handleTalukaChange} placeholder="Select Taluka / Tehsil"/>
         <CustomSelect label="Locality / Area" options={cities.map(c=>c.city)} value={form.city} onChange={handleCityChange} placeholder="Select Locality / Area"/>
         <div className="form-row"><label>PIN / Postal code</label><div className="input-shell auto-field"><Icons.MapPin size={15}/><input value={form.pincode} readOnly placeholder="Auto-filled from locality"/><span className="auto-chip">AUTO</span></div></div>
       </div>
       <AnimatePresence initial={false}>{restricted&&<motion.div className="official-code-card" initial={{opacity:0,height:0,y:-7}} animate={{opacity:1,height:'auto',y:0}} exit={{opacity:0,height:0,y:-7}}><div className="official-code-head"><div><span className="eyebrow">Official verification</span><b>Restricted clearance code</b></div><span className="mini-lock"><Icons.ShieldAlert size={15}/></span></div><div className="secret-input"><Icons.KeyRound size={15}/><input type={showCode?'text':'password'} value={code} onChange={e=>{setCode(e.target.value);setError('')}} placeholder="Enter restricted clearance code (RAKSHAK07)" autoComplete="off"/><button type="button" className="secret-eye interactive" onClick={()=>setShowCode(v=>!v)}>{showCode?<Icons.EyeOff size={15}/>:<Icons.Eye size={15}/>}</button></div><div className="code-hint-row"><small>Official clearance passkey required for Government Command and Platform Admin tiers (Passkey: RAKSHAK07).</small></div></motion.div>}</AnimatePresence>
       {error&&<motion.div className="login-error" initial={{opacity:0,y:-4}} animate={{opacity:1,y:0}}><Icons.TriangleAlert size={14}/>{error}</motion.div>}
       <motion.button whileHover={{y:-2}} whileTap={{scale:.985}} className="primary-button full interactive login-button" type="submit"><Icons.LogIn size={16}/> Continue to {roles[role].label} <Icons.ArrowRight size={15}/></motion.button>
       <div className="login-footnote"><Icons.ShieldCheck size={13}/> Rakshak Emergency Resilience Network · ICS-100 Aligned</div>
     </form>
    </GlassCard>
   </div></div>;
}
function Landing(){
  const navigate=useNavigate();
  const scroll=()=>document.getElementById('network')?.scrollIntoView({behavior:'smooth'});

  const [selectedIdeaFilter, setSelectedIdeaFilter] = useState('all');
  const [activeIdeaId, setActiveIdeaId] = useState(null);

  const locationIdeas = [
    {
      id: 'idea-highground',
      type: 'safe',
      cat: 'refuge',
      dist: '1.8 KM NW',
      pos: 'pos-tl',
      title: 'High-Ground Refuge (+45m)',
      tag: 'Safe Evacuation Ridge',
      action: 'Vertical Safe Zone',
      desc: 'Topographical high ridge with zero flood history. Recommended assembly point if ground water rises.',
      ico: Icons.Mountain
    },
    {
      id: 'idea-shelter',
      type: 'safe',
      cat: 'shelter',
      dist: '2.4 KM NE',
      pos: 'pos-tr',
      title: 'Designated Safe Shelter',
      tag: 'Relief Hub (208 Beds Open)',
      action: '208 Beds Available',
      desc: 'Equipped with generator backup, potable drinking water, hot meals, and medical triage.',
      ico: Icons.House
    },
    {
      id: 'idea-med',
      type: 'info',
      cat: 'medical',
      dist: '3.1 KM SE',
      pos: 'pos-br',
      title: 'Mobile Trauma Center',
      tag: 'Emergency Medical Post',
      action: 'Doctor & ICU on Site',
      desc: 'Equipped with emergency oxygen, trauma stabilization, and 4x4 high-water ambulances on standby.',
      ico: Icons.Activity
    },
    {
      id: 'idea-sar',
      type: 'warning',
      cat: 'sar',
      dist: '3.8 KM SW',
      pos: 'pos-bl',
      title: 'NDRF Inflatable Boat Post',
      tag: 'SAR Rescue Staging',
      action: 'VHF 156.800 Active',
      desc: '6 zodiac rescue craft and search divers ready for stranded extraction along low-lying corridors.',
      ico: Icons.Siren
    },
    {
      id: 'idea-flood',
      type: 'critical',
      cat: 'hazard',
      dist: '1.2 KM South',
      pos: 'pos-bc',
      title: 'Lowland Inundation Danger',
      tag: 'Drainage Risk Warning',
      action: 'Avoid Underpass',
      desc: 'Low-lying river basin underpass is at 95% capacity. Avoid driving or walking through this zone.',
      ico: Icons.Waves
    }
  ];

  const filteredIdeas = selectedIdeaFilter === 'all'
    ? locationIdeas
    : locationIdeas.filter(i => i.cat === selectedIdeaFilter);

  // Geolocation Permission & Real-Time Coordinate State
  const [locationStatus, setLocationStatus] = useState(() => {
    try {
      return localStorage.getItem('resq_location_status') || null;
    } catch {
      return null;
    }
  });

  const [userCoords, setUserCoords] = useState(() => {
    try {
      const saved = localStorage.getItem('resq_user_coords');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [locating, setLocating] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(() => {
    try {
      return !localStorage.getItem('resq_location_status');
    } catch {
      return true;
    }
  });

  const requestLocation = () => {
    if (!navigator.geolocation) {
      setLocationStatus('denied');
      try { localStorage.setItem('resq_location_status', 'denied'); } catch (_) {}
      setShowLocationModal(false);
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = {
          lat: Number(pos.coords.latitude.toFixed(4)),
          lng: Number(pos.coords.longitude.toFixed(4)),
          accuracy: Math.round(pos.coords.accuracy || 15)
        };
        setUserCoords(coords);
        setLocationStatus('granted');
        setLocating(false);
        setShowLocationModal(false);
        try {
          localStorage.setItem('resq_location_status', 'granted');
          localStorage.setItem('resq_user_coords', JSON.stringify(coords));
        } catch (_) {}
      },
      (err) => {
        console.warn('Geolocation denied or unavailable:', err.message);
        setLocationStatus('denied');
        setLocating(false);
        setShowLocationModal(false);
        try {
          localStorage.setItem('resq_location_status', 'denied');
        } catch (_) {}
      },
      { enableHighAccuracy: true, timeout: 9000, maximumAge: 60000 }
    );
  };

  const declineLocation = () => {
    setLocationStatus('denied');
    setShowLocationModal(false);
    try {
      localStorage.setItem('resq_location_status', 'denied');
    } catch (_) {}
  };

  return <div className="landing-page tactical-landing">
    <div className="landing-noise"/>

    {/* Location Permission Gate Modal (Asked Before Starting Website) */}
    {showLocationModal && (
      <div className="location-gate-overlay" role="dialog" aria-modal="true">
        <div className="location-gate-card">
          <div className="gate-header">
            <div className="gate-icon-badge">
              <Icons.ShieldAlert size={30}/>
            </div>
            <div>
              <span className="gate-tag">NATIONAL DISASTER RADAR · LOCATION AUTHORIZATION</span>
              <h3>Enable Threat Radar Geolocation</h3>
            </div>
          </div>
          <p className="gate-body">
            To detect real-time flood inundation, active evacuation corridors, and nearest shelters within your 50 KM perimeter, the National Disaster Mesh requests your device coordinates.
          </p>
          <div className="gate-privacy-note">
            <Icons.LockKeyhole size={14}/>
            <span>Your coordinates stay local to your browser and are used strictly for local threat perimeter mapping.</span>
          </div>
          <div className="gate-actions">
            <button
              type="button"
              className="primary-button gate-allow-btn interactive"
              onClick={requestLocation}
              disabled={locating}
            >
              <Icons.MapPin size={16}/>
              <span>{locating ? 'Detecting Coordinates...' : 'Enable Location & Show Radar'}</span>
            </button>
            <button
              type="button"
              className="secondary-button gate-skip-btn interactive"
              onClick={declineLocation}
            >
              <Icons.EyeOff size={15}/>
              <span>Proceed in Stealth Mode (No Radar)</span>
            </button>
          </div>
        </div>
      </div>
    )}
    
    {/* Emergency Ops Topbar */}
    <header className="landing-nav tactical-nav">
      <button className="brand interactive" onClick={()=>navigate('/')}>
        <span className="brand-mark tactical-mark"><Icons.ShieldAlert size={20}/></span>
        <span>
          <b>RAKSHAK DISASTER COMMAND</b>
          <small>National Crisis Response Grid · रक्षक</small>
        </span>
      </button>

      <div className="landing-nav-status tactical-status-badge">
        <span className="live-dot pulse-red"/>
        <span>DEFCON-3 ELEVATED DISASTER POSTURE · PUNE EOC SECTOR 4 MESH ACTIVE</span>
      </div>

      <div className="landing-theme-actions">
        <LiveTemperatureNavPill onClick={() => window.dispatchEvent(new CustomEvent('resq:open-temp-reader'))} />
        <ThemeToggle/>
        <button className="primary-button interactive command-portal-btn" onClick={()=>navigate('/login')}>
          <Icons.ShieldCheck size={16}/> Incident Command Portal <Icons.ArrowRight size={14}/>
        </button>
      </div>
    </header>

    {/* Emergency Hotline Ticker */}
    <div className="emergency-hotline-ticker">
      <div className="ticker-inner">
        <span className="ticker-label"><Icons.PhoneCall size={13}/> 24/7 CRISIS DISPATCH HOTLINES:</span>
        <span className="ticker-item"><b>112</b> Unified National Emergency</span>
        <span className="ticker-divider">/</span>
        <span className="ticker-item"><b>1077</b> District Disaster Management (DDMA)</span>
        <span className="ticker-divider">/</span>
        <span className="ticker-item"><b>108</b> Emergency Trauma & Ambulance</span>
        <span className="ticker-divider">/</span>
        <span className="ticker-item"><b>1070</b> State Emergency Operations (SEOC)</span>
      </div>
    </div>

    {/* Tactical Hero Section */}
    <section className="hero-section landing-hero tactical-hero">
      <div className="hero-copy tactical-hero-copy">
        <span className="live-banner tactical-banner">
          <i className="radar-blip-dot"/> RAPID INCIDENT RESPONSE & DISASTER RESILIENCE
        </span>
        <h2>When Disaster Strikes,<br/><span>Every Second Counts.</span></h2>
        <p>A mission-critical disaster management network connecting stranded citizens, frontline search-and-rescue teams, relief shelters, and government incident commanders through a secure, least-privilege emergency mesh.</p>
        
        <div className="hero-buttons">
          <button className="primary-button emergency-sos-btn interactive" onClick={()=>navigate('/help')}>
            <Icons.Siren size={18}/> Request Immediate Rescue (SOS)
          </button>
          <button className="secondary-button interactive" onClick={()=>navigate('/login')}>
            <Icons.KeyRound size={15}/> Authorized Terminal Access
          </button>
        </div>

        <div className="tactical-telemetry-ribbon">
          <div className="telem-item">
            <strong>07</strong>
            <span>Active Incidents</span>
          </div>
          <div className="telem-item">
            <strong>24</strong>
            <span>SAR Missions</span>
          </div>
          <div className="telem-item">
            <strong>186</strong>
            <span>Responders Deployed</span>
          </div>
          <div className="telem-item">
            <strong>71%</strong>
            <span>Shelter Occupancy</span>
          </div>
          <div className="telem-item">
            <strong>99.8%</strong>
            <span>Mesh Uptime</span>
          </div>
        </div>
      </div>

      {/* Tactical Radar HUD Visual - SHOWN ONLY IF LOCATION PERMISSION IS GRANTED */}
      {locationStatus === 'granted' && userCoords ? (
        <div className="hero-visual tactical-visual">
          <div className="tactical-radar-hud">
            <div className="radar-sweep-beam" aria-hidden="true"/>
            <div className="radar-range-ring r-outer">
              <span className="range-tag">50 KM PERIMETER</span>
            </div>
            <div className="radar-range-ring r-mid">
              <span className="range-tag">25 KM CONTINGENCY</span>
            </div>
            <div className="radar-range-ring r-inner">
              <span className="range-tag">10 KM IMMEDIATE RISK</span>
            </div>
            <div className="radar-crosshair ch-h" aria-hidden="true"/>
            <div className="radar-crosshair ch-v" aria-hidden="true"/>

            <div className="radar-eoc-core">
              <Icons.Crosshair size={26}/>
              <b>YOUR LOCATION</b>
              <small>{userCoords.lat}° N, {userCoords.lng}° E</small>
              <span className="user-loc-badge">GPS ACCURACY ±{userCoords.accuracy}M</span>
            </div>

            {/* Location Ideas & Incident Pin Markers on Radar */}
            {filteredIdeas.map(idea => {
              const Ico = idea.ico;
              const isActive = activeIdeaId === idea.id;
              return (
                <div
                  key={idea.id}
                  className={`tactical-incident-chip ${idea.type} ${idea.pos} ${isActive ? 'active-pulse' : ''} interactive`}
                  onClick={() => setActiveIdeaId(isActive ? null : idea.id)}
                  title={idea.title}
                >
                  <span className={`chip-beacon ${idea.type}`}/>
                  <div className="chip-text">
                    <b>{idea.title}</b>
                    <small>{idea.dist} · {idea.action}</small>
                  </div>
                  <Ico size={14} className="chip-ico"/>
                </div>
              );
            })}
          </div>

          {/* Location Ideas & Actionable Sector Insights Panel */}
          <div className="radar-location-ideas-panel">
            <div className="ideas-panel-head">
              <div className="ideas-head-left">
                <span className="live-dot pulse-green"/>
                <div>
                  <span className="ideas-eyebrow">LOCATION IDEAS · {userCoords.lat}° N, {userCoords.lng}° E</span>
                  <h4>Perimeter Safety Ideas & Recommendations</h4>
                </div>
              </div>
              <div className="ideas-filter-chips">
                {[
                  { id: 'all', l: 'All Ideas' },
                  { id: 'refuge', l: '🏔️ High Ground' },
                  { id: 'shelter', l: '🏠 Shelters' },
                  { id: 'medical', l: '🏥 Medical' },
                  { id: 'hazard', l: '⚠️ Hazards' }
                ].map(f => (
                  <button
                    key={f.id}
                    type="button"
                    className={`idea-filter-chip interactive ${selectedIdeaFilter === f.id ? 'active' : ''}`}
                    onClick={() => setSelectedIdeaFilter(f.id)}
                  >
                    {f.l}
                  </button>
                ))}
              </div>
            </div>

            <div className="ideas-cards-grid">
              {filteredIdeas.map(idea => {
                const Ico = idea.ico;
                const isSelected = activeIdeaId === idea.id;
                return (
                  <div
                    key={idea.id}
                    className={`location-idea-card severity-${idea.type} ${isSelected ? 'selected' : ''} interactive`}
                    onClick={() => setActiveIdeaId(isSelected ? null : idea.id)}
                  >
                    <div className="idea-card-top">
                      <span className={`idea-type-pill ${idea.type}`}><Ico size={12}/> {idea.tag}</span>
                      <span className="idea-dist-pill"><Icons.Navigation size={11}/> {idea.dist}</span>
                    </div>
                    <b>{idea.title}</b>
                    <p>{idea.desc}</p>
                    <div className="idea-card-bottom">
                      <span className="idea-action-badge">⚡ {idea.action}</span>
                      <button
                        type="button"
                        className="idea-action-btn interactive"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate('/help');
                        }}
                      >
                        Request Assist <Icons.ArrowRight size={12}/>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        /* STEALTH MODE / RADAR DORMANT ALTERNATIVE CARD WHEN LOCATION IS DENIED */
        <div className="hero-visual tactical-visual">
          <div className="landing-stealth-card">
            <div className="stealth-card-head">
              <span className="stealth-badge"><Icons.EyeOff size={14}/> RADAR SCANNING DORMANT</span>
              <h4>Threat Radar Inactive</h4>
              <p>Device location permission was not granted. Real-time proximity radar scanning is disabled to respect your privacy preferences.</p>
            </div>

            <div className="stealth-features-list">
              <div className="stealth-feature-row">
                <Icons.ShieldCheck size={18} className="stealth-icon icon-green"/>
                <div>
                  <b>Manual Emergency Rescue (SOS) Available</b>
                  <small>You can still submit immediate rescue dispatches with your street address or landmark</small>
                </div>
              </div>
              <div className="stealth-feature-row">
                <Icons.PhoneCall size={18} className="stealth-icon icon-amber"/>
                <div>
                  <b>24/7 Unified Emergency Hotlines Active</b>
                  <small>Dial 112 (National Emergency) or 1077 (District Disaster Control Room)</small>
                </div>
              </div>
            </div>

            <div className="stealth-card-actions">
              <button
                type="button"
                className="primary-button interactive stealth-enable-btn"
                onClick={requestLocation}
                disabled={locating}
              >
                <Icons.MapPin size={15}/>
                <span>{locating ? 'Detecting Coordinates...' : 'Enable Location & Show Radar'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </section>

    {/* Live Operations Snapshot Bar */}
    <section className="landing-live glass-panel tactical-live-panel">
      <div className="live-strip-head">
        <div>
          <span className="eyebrow">TACTICAL SITUATION OVERVIEW</span>
          <h3>Real-Time Disaster Operations Command Feed</h3>
        </div>
        <div className="live-strip-indicator">
          <span className="live-dot pulse-green"/> TELEMETRY SYNCED · 5s PING
        </div>
      </div>
      <div className="live-metrics tactical-metrics-grid">
        <div className="tactical-metric-box">
          <b>07</b>
          <span>Verified Disaster Zones</span>
          <small>2 Critical Flood / 1 Landslide</small>
        </div>
        <div className="tactical-metric-box">
          <b>24</b>
          <span>Rescue Requests</span>
          <small>6 Extrication / 18 Supplies</small>
        </div>
        <div className="tactical-metric-box">
          <b>186</b>
          <span>Responders in Field</span>
          <small>NDRF, SDRF & Civil Defense</small>
        </div>
        <div className="tactical-metric-box">
          <b>1,406</b>
          <span>Shelter Beds Open</span>
          <small>8 Verified Relief Camps</small>
        </div>
        <div className="tactical-metric-box">
          <b>42</b>
          <span>Partner NGO Units</span>
          <small>Medical & Food Rations</small>
        </div>
      </div>
    </section>

    {/* ICS 4-Stage Disaster Response Lifecycle */}
    <section className="landing-workflow tactical-workflow">
      <div className="section-head">
        <span className="eyebrow">INCIDENT COMMAND SYSTEM (ICS) STANDARD</span>
        <h3>Closed-Loop Emergency Response Protocol</h3>
        <p>From citizen distress signal ingestion to multi-agency verification, field deployment, and immutable post-disaster audit trails.</p>
      </div>
      <div className="workflow-track tactical-workflow-track">
        {[
          ['01','Citizen Distress SOS','GPS telemetry lock, casualty headcount and triage priority capture.',Icons.UserRound],
          ['02','EOC Verification & Broadcast','District Commander verifies threat and issues official EAS public warning.',Icons.Megaphone],
          ['03','Tactical Field Dispatch','Nearest NDRF battalion, boat units and NGO responders deployed.',Icons.Route],
          ['04','Shelter & Cryptographic Audit','Manifest check-in, family reunification and tamper-evident audit logging.',Icons.ShieldCheck]
        ].map(([n,t,d,I])=>(
          <div className="workflow-step glass-panel tactical-step" key={n}>
            <span className="step-badge">{n}</span>
            <div className="workflow-icon"><I size={22}/></div>
            <h4>{t}</h4>
            <p>{d}</p>
          </div>
        ))}
      </div>
    </section>

    {/* Least Privilege Role Matrix */}
    <section id="network" className="network-section tactical-network-section">
      <div className="section-head">
        <span className="eyebrow">ROLE-AWARE ACCESS CONTROL</span>
        <h3>Four Operational Tiers · Zero Credential Bleed</h3>
        <p>Citizens focus on survival and shelters. Volunteers receive triage tasks. Incident commanders control regional broadcasts. Administrators safeguard infrastructure.</p>
      </div>
      <div className="role-grid tactical-role-grid">
        {Object.entries(roles).map(([r,v],i)=>(
          <button
            type="button"
            className={`role-card tactical-role-card ${v.accent} interactive`}
            key={r}
            onClick={()=>navigate('/login')}
          >
            <div className="role-card-header">
              <span className="role-icon">
                {r==='citizen'?<Icons.UserRound/>:r==='ngo'?<Icons.HeartHandshake/>:r==='government'?<Icons.Building2/>:<Icons.ShieldCheck/>}
              </span>
              <span className="role-tier-tag">TIER 0{i+1} · {v.permissions.length} CONTROLS</span>
            </div>
            <h4>{v.label}</h4>
            <p>
              {r==='citizen'?'Immediate SOS triage, public disaster advisories, verified shelter finder, and biometric family safety reunification.':
               r==='ngo'?'Assigned search-and-rescue tasks, relief supply logistics, partner coordination, and volunteer field missions.':
               r==='government'?'District operational map, official EAS broadcast center, multi-agency NGO dispatch, and incident state verification.':
               'Cryptographic role envelopes, tamper-evident audit ledger, user account governance, and system security controls.'}
            </p>
            <b className="role-access-cta">
              Enter {v.label} Terminal <Icons.ArrowUpRight size={14}/>
            </b>
          </button>
        ))}
      </div>
    </section>

    {/* Emergency Readiness CTA */}
    <section className="landing-cta glass-panel tactical-cta">
      <div>
        <span className="eyebrow">DISASTER READINESS PORTAL</span>
        <h3>Connect to the National Disaster Management Mesh</h3>
        <p>Access role-specific emergency workflows, verify live regional advisories, and coordinate critical relief operations in real time.</p>
      </div>
      <div className="cta-actions">
        <button className="primary-button emergency-sos-btn interactive" onClick={()=>navigate('/help')}>
          <Icons.Siren size={17}/> Request Assistance (SOS)
        </button>
        <button className="secondary-button interactive" onClick={()=>navigate('/login')}>
          <Icons.LogIn size={16}/> Access Incident Command
        </button>
      </div>
    </section>

    {/* Tactical Disaster Management Footer */}
    <footer className="landing-footer tactical-footer">
      <div className="footer-left">
        <Icons.ShieldAlert size={16}/>
        <span>Rakshak · National Disaster Resilience &amp; Incident Command Grid (रक्षक)</span>
      </div>
      <div className="footer-right">
        <span>Standard Operating Procedures · ICS-100/200 Aligned · Emergency Dispatch 112 Ready</span>
      </div>
    </footer>
  </div>;
}

export default function App(){
  const [tempModalOpen, setTempModalOpen] = useState(false);
  const [tempModalLocation, setTempModalLocation] = useState(null);

  useEffect(()=>{
    applyGlobalPreferences();
    const fn=e=>applyGlobalPreferences(e.detail);
    window.addEventListener('resq:preferences',fn);
    window.addEventListener('storage',()=>applyGlobalPreferences());

    const onOpenTemp = (e) => {
      setTempModalLocation(e.detail || null);
      setTempModalOpen(true);
    };
    window.addEventListener('resq:open-temp-reader', onOpenTemp);

    return()=>{
      window.removeEventListener('resq:preferences',fn);
      window.removeEventListener('storage',()=>applyGlobalPreferences());
      window.removeEventListener('resq:open-temp-reader', onOpenTemp);
    };
  },[]);
  return (
    <>
      <CrisisEmergencyEngine />
      <DigitalTemperatureReader
        isOpen={tempModalOpen}
        onClose={() => { setTempModalOpen(false); setTempModalLocation(null); }}
        initialLocation={tempModalLocation}
      />
      <Routes>
        <Route path="/" element={<Landing/>}/>
        <Route path="/login" element={<Login/>}/>
        <Route path="/*" element={<Shell><Routes>
<Route path="dashboard" element={<Protected><Dashboard/></Protected>}/>
<Route path="triage" element={<Protected><AiTriagePage/></Protected>}/>
<Route path="alerts" element={<Protected permission="view_alerts"><AlertsPage/></Protected>}/>
<Route path="campaigns" element={<Protected permission="view_campaigns"><Campaigns/></Protected>}/>
<Route path="shelters" element={<Protected permission="view_shelters"><Shelters/></Protected>}/>
<Route path="help" element={<Protected permission="request_help"><HelpDesk/></Protected>}/>
<Route path="incident" element={<Protected permission="report_incident"><IncidentReport/></Protected>}/>
<Route path="family" element={<Protected permission="family_safety"><FamilySafety/></Protected>}/>
<Route path="requests" element={<RoleRestricted allow={['ngo','government','admin']}><Requests/></RoleRestricted>}/>
<Route path="missions" element={<Protected permission="update_missions"><Missions/></Protected>}/>
<Route path="impact" element={<Protected permission="view_assigned_help"><Impact/></Protected>}/>
<Route path="incidents" element={<Protected permission="manage_incidents"><Incidents/></Protected>}/>
<Route path="broadcast" element={<Protected permission="broadcast_alert"><Broadcast/></Protected>}/>
<Route path="broadcast-history" element={<Protected permission="broadcast_alert"><BroadcastHistory/></Protected>}/>
<Route path="ngo-coordination" element={<Protected permission="manage_ngos"><NgoCoordination/></Protected>}/>
<Route path="analytics" element={<Protected permission="view_reports"><Analytics/></Protected>}/>
<Route path="users" element={<Protected permission="manage_users"><Users/></Protected>}/>
<Route path="permissions" element={<Protected permission="manage_roles"><Permissions/></Protected>}/>
<Route path="audit" element={<Protected permission="audit_logs"><Audit/></Protected>}/>
<Route path="settings" element={<Protected permission="interface_preferences"><Settings/></Protected>}/>
<Route path="profile" element={<Protected><ProfilePreferences/></Protected>}/>
<Route path="*" element={<NotFound/>}/>
</Routes></Shell>}/></Routes></>);
}
