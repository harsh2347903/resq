import React, { useState } from 'react';
import { ArrowUpRight, CheckCircle2, HeartHandshake, Megaphone, Plus, Search, Users } from 'lucide-react';
import { campaigns as seed } from '../lib/mockData';
import { useAuth } from '../context/AuthContext';

export default function Campaigns(){
 const {can}=useAuth(); const [items,setItems]=useState(seed); const [q,setQ]=useState(''); const [joined,setJoined]=useState([]); const [toast,setToast]=useState('');
 const filtered=items.filter(c=>`${c.name} ${c.tag}`.toLowerCase().includes(q.toLowerCase()));
 const join=(id)=>{setJoined(v=>v.includes(id)?v.filter(x=>x!==id):[...v,id]);setToast('Campaign response saved.');setTimeout(()=>setToast(''),2200)};
 return <div className="content-stack"><div className="page-intro"><div><span className="eyebrow">Public information + action</span><h2>Campaigns turn awareness into response.</h2><p>Government programs and NGO drives are surfaced in one place so people can learn, join or share verified help.</p></div>{can('manage_campaigns')&&<button className="glass-cta"><Plus size={16}/> Create campaign</button>}</div>
 <div className="search-row"><div className="search-box glass-panel"><Search size={16}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search campaigns, topics or services"/></div><span className="result-count">{filtered.length} active campaigns</span></div>
 <div className="campaign-grid">{filtered.map(c=><article className="campaign-card glass-panel" key={c.id}><div className="campaign-top"><span className="tag info">{c.tag}</span><span className="campaign-live"><span className="live-dot"/> {c.status}</span></div><div className="campaign-icon"><Megaphone size={21}/></div><h3>{c.name}</h3><p>{c.copy}</p><div className="campaign-metric"><div><strong>{c.reach}</strong><span>people reached</span></div><div><strong>4.8k</strong><span>participants</span></div></div><div className="campaign-actions"><button className={`glass-cta tiny ${joined.includes(c.id)?'success':''}`} onClick={()=>join(c.id)}>{joined.includes(c.id)?<><CheckCircle2 size={14}/> Joined</>:<><HeartHandshake size={14}/> Join campaign</>}</button><button className="link-button">View details <ArrowUpRight size={14}/></button></div></article>)}</div>
 {can('view_reports')&&<section className="report-strip glass-panel"><div><span className="eyebrow">For response teams</span><h3>Campaign performance snapshot</h3><p>Reach, volunteers and engagement can be audited alongside incident activity.</p></div><div className="report-stats"><span><Users size={15}/> 3,860 volunteers</span><span><Megaphone size={15}/> 82% message completion</span><span><CheckCircle2 size={15}/> 91% verified links</span></div></section>}
 {toast&&<div className="inline-toast glass-panel">{toast}</div>}
 </div>
}
