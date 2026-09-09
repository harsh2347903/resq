import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as Icons from 'lucide-react';
import { useLocation } from '../context/LocationContext';
import {
  getAllStates,
  getDistrictsForState,
  getCitiesForDistrict,
  getTalukasForDistrict,
  getCoordinatesForLocation
} from '../lib/indiaGeoData';

export function LocationSwitcherBadge() {
  const { activeLocation, switchLocation } = useLocation();
  const [isOpen, setIsOpen] = useState(false);

  const [selectedState, setSelectedState] = useState(activeLocation.state);
  const [selectedDistrict, setSelectedDistrict] = useState(activeLocation.district);
  const [selectedTaluka, setSelectedTaluka] = useState(activeLocation.taluka);
  const [selectedCity, setSelectedCity] = useState(activeLocation.city);

  const allStates = getAllStates();
  const districts = getDistrictsForState(selectedState);
  const talukas = getTalukasForDistrict(selectedState, selectedDistrict);
  const cities = getCitiesForDistrict(selectedState, selectedDistrict);

  const handleStateChange = (st) => {
    setSelectedState(st);
    const newDistricts = getDistrictsForState(st);
    const firstDist = newDistricts[0] || '';
    setSelectedDistrict(firstDist);

    const newTalukas = getTalukasForDistrict(st, firstDist);
    setSelectedTaluka(newTalukas[0] || '');

    const newCities = getCitiesForDistrict(st, firstDist);
    setSelectedCity(newCities[0]?.city || '');
  };

  const handleDistrictChange = (dist) => {
    setSelectedDistrict(dist);
    const newTalukas = getTalukasForDistrict(selectedState, dist);
    setSelectedTaluka(newTalukas[0] || '');

    const newCities = getCitiesForDistrict(selectedState, dist);
    setSelectedCity(newCities[0]?.city || '');
  };

  const applyLocation = () => {
    const coords = getCoordinatesForLocation(selectedState, selectedDistrict, selectedTaluka, selectedCity);
    const matchedCity = cities.find(c => c.city === selectedCity || c.taluka === selectedTaluka);

    switchLocation({
      state: selectedState,
      district: selectedDistrict,
      taluka: selectedTaluka || matchedCity?.taluka || selectedCity,
      city: selectedCity || matchedCity?.city || selectedDistrict,
      pincode: matchedCity?.pincode || '',
      coordinates: coords
    });
    setIsOpen(false);
  };

  const quickJump = (state, district, taluka, city) => {
    const coords = getCoordinatesForLocation(state, district, taluka, city);
    const citiesList = getCitiesForDistrict(state, district);
    const matched = citiesList.find(c => c.city === city || c.taluka === taluka);
    switchLocation({
      state,
      district,
      taluka,
      city,
      pincode: matched?.pincode || '',
      coordinates: coords
    });
    setIsOpen(false);
  };


  return (
    <>
      {/* Top Bar Location Badge Pill */}
      <button
        type="button"
        className="interactive"
        onClick={() => {
          setSelectedState(activeLocation.state);
          setSelectedDistrict(activeLocation.district);
          setSelectedTaluka(activeLocation.taluka);
          setSelectedCity(activeLocation.city);
          setIsOpen(true);
        }}
        title="Click to switch active state, city, and taluka"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          background: 'rgba(56, 189, 248, 0.1)',
          border: '1px solid rgba(56, 189, 248, 0.3)',
          color: '#e2e8f0',
          padding: '5px 12px',
          borderRadius: '999px',
          fontSize: '12px',
          fontWeight: '500',
          cursor: 'pointer',
          backdropFilter: 'blur(10px)',
          boxShadow: '0 2px 10px rgba(0,0,0,0.2)'
        }}
      >
        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', boxShadow: '0 0 8px #10b981' }} />
        <span style={{ color: '#94a3b8', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>SECTOR:</span>
        <b style={{ color: '#38bdf8' }}>
          {activeLocation.district}
        </b>
        {activeLocation.taluka && activeLocation.taluka !== activeLocation.district && (
          <span style={{ color: '#cbd5e1' }}>• {activeLocation.taluka}</span>
        )}
        <Icons.ChevronDown size={14} style={{ color: '#38bdf8', marginLeft: '2px' }} />
      </button>

      {/* Location Switcher Modal */}
      <AnimatePresence>
        {isOpen && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 99999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(3, 7, 18, 0.75)',
              backdropFilter: 'blur(12px)',
              padding: '16px'
            }}
            onClick={() => setIsOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 14 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 14 }}
              onClick={e => e.stopPropagation()}
              style={{
                width: '100%',
                maxWidth: '560px',
                background: '#0c1622',
                border: '1px solid rgba(56, 189, 248, 0.25)',
                borderRadius: '20px',
                padding: '24px',
                boxShadow: '0 30px 80px rgba(0,0,0,0.8)',
                color: '#f8fafc'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(56, 189, 248, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#38bdf8' }}>
                    <Icons.MapPin size={20} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold' }}>Select Operational Location</h3>
                    <small style={{ color: '#94a3b8' }}>Tactical map, shelters, and campaigns adapt to this area</small>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
                >
                  <Icons.X size={18} />
                </button>
              </div>

              {/* Quick Jump Sectors */}
              <div style={{ marginBottom: '18px' }}>
                <span style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: '600', display: 'block', marginBottom: '8px' }}>
                  ⚡ Quick Regional Hot-Jumps
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {[
                    { s: 'Maharashtra', d: 'Pune', t: 'Haveli', c: 'Kothrud' },
                    { s: 'Maharashtra', d: 'Pune', t: 'Maval', c: 'Lonavala' },
                    { s: 'Maharashtra', d: 'Mumbai Suburban', t: 'Andheri', c: 'Andheri West' },
                    { s: 'Maharashtra', d: 'Mumbai City', t: 'Colaba', c: 'Fort / Colaba' },
                    { s: 'Maharashtra', d: 'Thane', t: 'Thane', c: 'Navi Mumbai (Vashi)' },
                    { s: 'Maharashtra', d: 'Nagpur', t: 'Nagpur Urban', c: 'Nagpur City (Civil Lines)' },
                    { s: 'Maharashtra', d: 'Nashik', t: 'Nashik', c: 'Nashik City (CIDCO)' },
                    { s: 'Maharashtra', d: 'Satara', t: 'Satara', c: 'Satara City' },
                    { s: 'Delhi', d: 'New Delhi', t: 'New Delhi', c: 'Connaught Place / Central' },
                    { s: 'Karnataka', d: 'Bengaluru Urban', t: 'Bangalore South', c: 'Jayanagar / Koramangala' }
                  ].map(item => (
                    <button
                      type="button"
                      key={`${item.d}-${item.t}`}
                      onClick={() => quickJump(item.s, item.d, item.t, item.c)}
                      style={{
                        fontSize: '11px',
                        padding: '4px 10px',
                        borderRadius: '8px',
                        background: activeLocation.district === item.d && activeLocation.taluka === item.t ? 'rgba(56, 189, 248, 0.25)' : 'rgba(255,255,255,0.05)',
                        border: `1px solid ${activeLocation.district === item.d && activeLocation.taluka === item.t ? '#38bdf8' : 'rgba(255,255,255,0.1)'}`,
                        color: activeLocation.district === item.d && activeLocation.taluka === item.t ? '#38bdf8' : '#cbd5e1',
                        cursor: 'pointer'
                      }}
                    >
                      {item.d} ({item.t})
                    </button>
                  ))}
                </div>
              </div>

              {/* 3-Tier Cascading Selector */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                {/* 1. State */}
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '4px', fontWeight: '500' }}>
                    State / Union Territory
                  </label>
                  <select
                    value={selectedState}
                    onChange={e => handleStateChange(e.target.value)}
                    style={{
                      width: '100%',
                      background: 'rgba(15,23,42,0.8)',
                      border: '1px solid rgba(255,255,255,0.12)',
                      borderRadius: '8px',
                      color: '#f8fafc',
                      padding: '8px 10px',
                      fontSize: '12px'
                    }}
                  >
                    {allStates.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                {/* 2. District / City */}
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '4px', fontWeight: '500' }}>
                    District / City
                  </label>
                  <select
                    value={selectedDistrict}
                    onChange={e => handleDistrictChange(e.target.value)}
                    style={{
                      width: '100%',
                      background: 'rgba(15,23,42,0.8)',
                      border: '1px solid rgba(255,255,255,0.12)',
                      borderRadius: '8px',
                      color: '#f8fafc',
                      padding: '8px 10px',
                      fontSize: '12px'
                    }}
                  >
                    {districts.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>

                {/* 3. Taluka / Sub-district */}
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '4px', fontWeight: '500' }}>
                    Taluka / Tehsil / Area
                  </label>
                  <select
                    value={selectedTaluka}
                    onChange={e => {
                      setSelectedTaluka(e.target.value);
                      const match = cities.find(c => c.taluka === e.target.value);
                      if (match) setSelectedCity(match.city);
                    }}
                    style={{
                      width: '100%',
                      background: 'rgba(15,23,42,0.8)',
                      border: '1px solid rgba(255,255,255,0.12)',
                      borderRadius: '8px',
                      color: '#f8fafc',
                      padding: '8px 10px',
                      fontSize: '12px'
                    }}
                  >
                    {talukas.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>

                {/* 4. City / Local Sector */}
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '4px', fontWeight: '500' }}>
                    Town / Sector / Zone
                  </label>
                  <select
                    value={selectedCity}
                    onChange={e => {
                      setSelectedCity(e.target.value);
                      const match = cities.find(c => c.city === e.target.value);
                      if (match?.taluka) setSelectedTaluka(match.taluka);
                    }}
                    style={{
                      width: '100%',
                      background: 'rgba(15,23,42,0.8)',
                      border: '1px solid rgba(255,255,255,0.12)',
                      borderRadius: '8px',
                      color: '#f8fafc',
                      padding: '8px 10px',
                      fontSize: '12px'
                    }}
                  >
                    {cities.map(c => <option key={c.city} value={c.city}>{c.city} ({c.pincode})</option>)}
                  </select>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: '#94a3b8',
                    padding: '8px 14px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={applyLocation}
                  style={{
                    background: 'linear-gradient(135deg, #0284c7, #0369a1)',
                    border: '1px solid #38bdf8',
                    color: '#ffffff',
                    padding: '8px 18px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    boxShadow: '0 4px 14px rgba(2,132,199,0.4)'
                  }}
                >
                  Set Active Location
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

export default LocationSwitcherBadge;
