import React from 'react';
import { ArrowRight, Bell, ChevronRight, HeartHandshake, MapPin, ShieldAlert, UsersRound } from 'lucide-react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

export default function Landing() {
  const navigate = useNavigate();
  const scroll = () => document.getElementById('network')?.scrollIntoView({behavior:'smooth'});
  return <div className="landing">
    <div className="landing-grid"/><div className="ambient landing-a"/><div className="ambient landing-b"/>
    <header className="landing-nav">
      <div className="brand dark" onClick={() => window.scrollTo({top:0,behavior:'smooth'})}><div className="brand-mark"><ShieldAlert size={20}/></div><div><strong>RESQ</strong><span>Disaster Response</span></div></div>
      <div className="landing-actions"><button className="text-button" onClick={scroll}>How it works</button><button className="glass-cta small" onClick={() => navigate('/login')}>Enter platform <ArrowRight size={15}/></button></div>
    </header>
    <section className="hero-section">
      <div className="hero-copy">
        <div className="pill-label"><span className="live-dot"/> Live response network</div>
        <h2>When every second matters, <em>people connect.</em></h2>
        <p>One clear platform for citizens, government teams and NGOs to coordinate warnings, emergency requests, shelters and relief campaigns.</p>
        <div className="hero-actions"><button className="glass-cta" onClick={() => navigate('/login')}>Access your role <ArrowRight size={18}/></button><button className="link-button" onClick={scroll}>Explore the network <ChevronRight size={17}/></button></div>
        <div className="hero-stats"><div><strong>112</strong><span>National emergency</span></div><div><strong>24/7</strong><span>Response network</span></div><div><strong>4</strong><span>Roles, one mission</span></div></div>
      </div>
      <motion.div className="hero-orbit glass-panel" initial={{opacity:0, scale:.9}} animate={{opacity:1,scale:1}} transition={{duration:.7}}>
        <div className="orbit-ring ring-1"/><div className="orbit-ring ring-2"/><div className="orbit-core"><ShieldAlert size={42}/><span>RESQ</span></div>
        <div className="orbit-card c1"><Bell size={15}/><span>Flood warning</span><strong>2 min ago</strong></div>
        <div className="orbit-card c2"><HeartHandshake size={15}/><span>Volunteer matched</span><strong>Camp 04</strong></div>
        <div className="orbit-card c3"><MapPin size={15}/><span>Safe shelter</span><strong>642 / 850</strong></div>
      </motion.div>
    </section>
    <section id="network" className="network-section">
      <div className="section-head"><span className="eyebrow">One system · clear permissions</span><h3>Built around the person who needs help.</h3><p>Every role sees only the controls they need, while critical information travels instantly across the response network.</p></div>
      <div className="role-grid">
        {[['Citizen','Request help, track assistance, find shelters and receive location-aware advisories.','aqua',UsersRound],['NGO / Volunteer','Accept response tasks, coordinate supplies and support relief campaigns.','violet',HeartHandshake],['Government Officer','Verify requests, broadcast alerts, manage shelters and coordinate agencies.','amber',ShieldAlert],['System Admin','Manage roles, system settings, audit activity and response operations.','rose',ShieldAlert]].map(([title,desc,accent,Icon],i)=><motion.button key={title} className={`role-card ${accent}`} onClick={() => navigate('/login')} whileHover={{y:-5}}><div className="role-icon"><Icon size={19}/></div><span>{String(i+1).padStart(2,'0')}</span><h4>{title}</h4><p>{desc}</p><b>Continue <ArrowRight size={15}/></b></motion.button>)}
      </div>
    </section>
    <footer className="landing-footer"><span>Rakshak · National Disaster Resilience &amp; Emergency Response Coordination (रक्षक)</span><button onClick={() => navigate('/login')}>Sign in <ArrowRight size={14}/></button></footer>
  </div>;
}
