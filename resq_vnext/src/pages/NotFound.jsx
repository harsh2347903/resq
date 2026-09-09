import React from 'react';
import { ArrowLeft, ShieldAlert } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
export default function NotFound(){const n=useNavigate();return <div className="not-found glass-panel"><ShieldAlert size={28}/><h2>That route is outside the response map.</h2><p>Use the navigation to return to your role workspace.</p><button className="glass-cta" onClick={()=>n('/dashboard')}><ArrowLeft size={15}/> Back to dashboard</button></div>}
