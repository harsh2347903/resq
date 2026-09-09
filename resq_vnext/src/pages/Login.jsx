import React, { useState } from 'react';
import { ArrowLeft, ArrowRight, KeyRound, ShieldCheck, MapPin, UserRound } from 'lucide-react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { roles, useAuth } from '../context/AuthContext';
import { getAllStates, getDistrictsForState, getCitiesForDistrict } from '../lib/indiaGeoData';

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [role, setRole] = useState('citizen');
  const allStates = getAllStates();
  const [form, setForm] = useState({
    name: '',
    state: 'Maharashtra',
    district: 'Pune',
    city: 'Pune City (Shivaji Nagar)',
    pincode: '411005'
  });
  const [error, setError] = useState('');

  const districts = getDistrictsForState(form.state);
  const cities = getCitiesForDistrict(form.state, form.district);

  const handleStateChange = (selectedState) => {
    const newDistricts = getDistrictsForState(selectedState);
    const firstDistrict = newDistricts[0] || '';
    const newCities = getCitiesForDistrict(selectedState, firstDistrict);
    const firstCityObj = newCities[0] || { city: '', pincode: '' };
    setForm(f => ({ ...f, state: selectedState, district: firstDistrict, city: firstCityObj.city, pincode: firstCityObj.pincode }));
    setError('');
  };

  const handleDistrictChange = (selectedDistrict) => {
    const newCities = getCitiesForDistrict(form.state, selectedDistrict);
    const firstCityObj = newCities[0] || { city: '', pincode: '' };
    setForm(f => ({ ...f, district: selectedDistrict, city: firstCityObj.city, pincode: firstCityObj.pincode }));
    setError('');
  };

  const handleCityChange = (selectedCity) => {
    const matched = cities.find(c => c.city === selectedCity);
    setForm(f => ({ ...f, city: selectedCity, pincode: matched ? matched.pincode : f.pincode }));
    setError('');
  };

  const submit = (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setError('Enter a display name for the demo session.'); return; }
    login(role, form);
    navigate('/dashboard');
  };

  return <div className="login-page"><div className="login-backdrop"/><button className="back-link" onClick={() => navigate('/')}><ArrowLeft size={16}/> Back to home</button>
    <div className="login-layout"><motion.div className="login-intro" initial={{opacity:0,x:-16}} animate={{opacity:1,x:0}} transition={{duration:.45}}><div className="brand dark"><div className="brand-mark"><ShieldCheck size={20}/></div><div><strong>RESQ</strong><span>Disaster Response</span></div></div><span className="eyebrow">Role-based access</span><h2>One platform.<br/><em>Different responsibilities.</em></h2><p>Choose a demo role to experience the permissions, dashboards and workflows designed for disaster response.</p><div className="login-note"><KeyRound size={16}/><span>No real credentials required · prototype mode</span></div></motion.div>
      <motion.form className="login-card glass-panel" onSubmit={submit} initial={{opacity:0,y:18}} animate={{opacity:1,y:0}} transition={{duration:.45,delay:.08}}><div className="card-kicker">Sign in</div><h3>Choose your response role</h3><p className="muted">The navigation and actions update automatically.</p>
        <div className="role-select-grid">{Object.entries(roles).map(([key,r])=><button type="button" key={key} className={`login-role ${key===role?'selected':''} ${r.accent}`} onClick={() => setRole(key)}><span className="role-mini-dot"/><div><strong>{r.label}</strong><small>{r.permissions.length} permissions</small></div></button>)}</div>
        <label>Display name<input value={form.name} onChange={e => {setForm(f=>({...f, name: e.target.value}));setError('')}} placeholder="e.g. Harshal" autoFocus /></label>
        <label>State / UT (All India)
          <select value={form.state} onChange={e => handleStateChange(e.target.value)}>
            {allStates.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label>District
          <select value={form.district} onChange={e => handleDistrictChange(e.target.value)}>
            {districts.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
        <label>City / Taluka
          <select value={form.city} onChange={e => handleCityChange(e.target.value)}>
            {cities.map(c => <option key={c.city} value={c.city}>{c.city}</option>)}
          </select>
        </label>
        <label>PIN / Postal code (Auto)
          <input value={form.pincode} readOnly placeholder="Auto-filled PIN" />
        </label>
        {error && <div className="form-error">{error}</div>}
        <button className="glass-cta full" type="submit">Enter {roles[role].label} workspace <ArrowRight size={17}/></button>
        <div className="permission-strip"><span>Current access</span>{roles[role].permissions.slice(0,4).map(p=><b key={p}>{p.replaceAll('_',' ')}</b>)}</div>
      </motion.form></div>
  </div>;
}

