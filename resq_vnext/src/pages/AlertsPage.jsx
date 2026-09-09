import React, { useMemo, useState } from 'react';
import { Bell, Check, ChevronRight, Filter, MapPin, RadioTower, ShieldAlert, Volume2 } from 'lucide-react';
import { alerts as initial } from '../lib/mockData';
import { useAuth } from '../context/AuthContext';

export default function AlertsPage(){
  const { can } = useAuth(); const [items,setItems]=useState(initial); const [filter,setFilter]=useState('all'); const [toast,setToast]=useState('');
  const list=useMemo(()=>filter==='all'?items:items.filter(x=>x.level===filter),[items,filter]);
  const mark=()=>{setItems(v=>v.map(x=>({...x,read:true})));setToast('All visible alerts marked as read.');setTimeout(()=>setToast(''),2400)};
  return <div className="content-stack"><div className="page-intro"><div><span className="eyebrow">Real-time notifications</span><h2>Know what is happening around you.</h2><p>Critical warnings stay visually distinct. Government operators can publish a new alert from the same surface.</p></div>{can('broadcast_alert')&&<button className="glass-cta" onClick={()=>setToast('Demo broadcast composer opened.') }><RadioTower size={16}/> Broadcast alert</button>}</div>
    <div className="filter-bar glass-panel"><div><Filter size={16}/><span>Filter severity</span>{['all','critical','warning','info'].map(k=><button key={k} className={filter===k?'active':''} onClick={()=>setFilter(k)}>{k}</button>)}</div><button className="soft-button" onClick={mark}><Check size={15}/> Mark all read</button></div>
    <div className="alert-page-grid"><div className="alert-feed">{list.map(a=><div className={`big-alert ${a.level}`} key={a.id}><div className="alert-accent"/><div className="alert-main"><div className="alert-top"><span className={`tag ${a.level}`}>{a.level}</span><small>{a.time}</small></div><h3>{a.title}</h3><span className="location"><MapPin size={14}/> {a.region}</span><p>{a.body}</p><div className="alert-actions"><button className="glass-cta tiny"><Volume2 size={14}/> Read aloud</button><button className="link-button">Open safety guide <ChevronRight size={15}/></button></div></div><div className="alert-mark"><Bell size={18}/>{a.read?'':'NEW'}</div></div>)}</div>
      <aside className="alert-side"><section className="glass-panel safety-score"><span className="eyebrow">Readiness</span><div className="score-ring"><strong>82</strong><small>/100</small></div><h3>Good readiness</h3><p>Save one nearby shelter and keep your emergency contacts current.</p><div className="score-list"><span><i/>Emergency contacts</span><span><i/>Nearest shelter</span><span><i className="off"/>Go-bag checklist</span></div></section><section className="glass-panel hotline"><div><ShieldAlert size={18}/><strong>Need urgent help?</strong></div><h3>112</h3><p>Use the emergency line for immediate danger, medical emergencies or rescue.</p><button className="glass-cta full" onClick={()=>setToast('112 call action ready on a real mobile device.')}>Call emergency line</button></section></aside></div>
    {toast&&<div className="inline-toast glass-panel">{toast}</div>}
  </div>
}
