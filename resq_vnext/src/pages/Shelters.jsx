import React, { useMemo, useState } from 'react';
import { BedDouble, Check, Droplets, HeartPulse, MapPin, Navigation, Search, Users, Wifi, Zap } from 'lucide-react';
import { shelters as seed } from '../lib/mockData';
import { useAuth } from '../context/AuthContext';

export default function Shelters(){
 const {can}=useAuth(); const [q,setQ]=useState(''); const [saved,setSaved]=useState([]); const [toast,setToast]=useState('');
 const list=useMemo(()=>seed.filter(s=>`${s.name} ${s.city}`.toLowerCase().includes(q.toLowerCase())),[q]);
 const save=(id)=>{setSaved(v=>v.includes(id)?v.filter(x=>x!==id):[...v,id]);setToast('Shelter preference updated.');setTimeout(()=>setToast(''),2200)};
 return <div className="content-stack"><div className="page-intro"><div><span className="eyebrow">Verified relief locations</span><h2>Find a safer place to go.</h2><p>Live occupancy is shown for the prototype. In production, this would sync from district control rooms and partner NGOs.</p></div>{can('manage_shelters')&&<button className="glass-cta"><BedDouble size={16}/> Manage shelters</button>}</div>
 <div className="shelter-top"><div className="search-box glass-panel"><Search size={16}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search by city or shelter"/></div><div className="map-preview glass-panel"><div className="map-glow"/><Navigation size={18}/><div><strong>Map view</strong><span>4 verified centres nearby</span></div></div></div>
 <div className="shelter-grid">{list.map(s=>{const pct=Math.round((s.occupied/s.capacity)*100); return <article className="shelter-card glass-panel" key={s.id}><div className="shelter-head"><div><span className="tag info">Verified</span><h3>{s.name}</h3><span><MapPin size={13}/> {s.city}</span></div><button className={saved.includes(s.id)?'save active':'save'} onClick={()=>save(s.id)}>{saved.includes(s.id)?<Check size={16}/>:<Navigation size={16}/>}</button></div><div className="occupancy"><div><span>Occupancy</span><strong>{s.occupied} / {s.capacity}</strong></div><div className="occupancy-bar"><i style={{width:`${pct}%`}}/></div><small>{pct}% occupied · estimated arrival {s.eta}</small></div><div className="service-row">{s.services.map(x=><span key={x}>{x==='Food'?<Droplets size={13}/>:x==='Medical'?<HeartPulse size={13}/>:x==='Wi-Fi'?<Wifi size={13}/>:<Zap size={13}/>} {x}</span>)}</div><button className="glass-cta full" onClick={()=>setToast(`Directions to ${s.name} opened in demo mode.`)}><Navigation size={15}/> Get directions</button></article>})}</div>
 {toast&&<div className="inline-toast glass-panel">{toast}</div>}
 </div>
}
