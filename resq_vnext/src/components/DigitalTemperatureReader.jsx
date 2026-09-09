import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as Icons from 'lucide-react';
import { useLocation } from '../context/LocationContext';
import { getDistrictCenter } from '../lib/indiaGeoData';

// Focused, Minimalist Real-Time Temperature Component for Currently Selected Location
export function DigitalTemperatureReader({ isOpen, onClose, initialLocation }) {
  const { activeLocation } = useLocation();
  const [tempC, setTempC] = useState(null);
  const [scale, setScale] = useState('C');
  const [loading, setLoading] = useState(true);

  // Target the currently selected location
  const loc = initialLocation || activeLocation;
  const cityName = loc.city || loc.name || loc.district || 'Pune';
  const districtName = loc.district || 'Pune';
  const stateName = loc.state || 'Maharashtra';

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    const center = getDistrictCenter(stateName, districtName);
    const lat = loc.lat || loc.coordinates?.lat || center.lat;
    const lng = loc.lng || loc.coordinates?.lng || center.lng;

    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m&timezone=auto`)
      .then(res => res.json())
      .then(data => {
        if (mounted && data?.current) {
          setTempC(data.current.temperature_2m);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => { mounted = false; };
  }, [cityName, districtName, stateName, loc.lat, loc.lng, loc.coordinates]);

  if (!isOpen) return null;

  const displayVal = tempC !== null
    ? (scale === 'C' ? `${tempC.toFixed(1)}°C` : `${((tempC * 9 / 5) + 32).toFixed(1)}°F`)
    : '--°C';

  return (
    <div className="modal-backdrop-blur" onClick={onClose}>
      <motion.div
        className="focused-temperature-modal glass-panel"
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ duration: 0.18 }}
      >
        <div className="focused-temp-header">
          <div className="focused-temp-title">
            <Icons.Thermometer size={18} className="temp-header-ico"/>
            <strong>CURRENT LOCATION TEMPERATURE</strong>
          </div>
          <button type="button" className="focused-temp-close" onClick={onClose}>
            <Icons.X size={15}/>
          </button>
        </div>

        <div className="focused-temp-body">
          <div className="focused-location-tag">
            <Icons.MapPin size={14}/>
            <span>{cityName}, {districtName} ({stateName})</span>
          </div>

          <div className="focused-temp-display-row">
            <div className="focused-giant-degrees">
              {loading ? (
                <span className="loading-temp-text">Detecting...</span>
              ) : (
                <b className="degrees-number mono">{displayVal}</b>
              )}
            </div>

            <div className="focused-scale-toggle">
              <button
                type="button"
                className={`scale-btn ${scale === 'C' ? 'active' : ''}`}
                onClick={() => setScale('C')}
              >
                °C
              </button>
              <button
                type="button"
                className={`scale-btn ${scale === 'F' ? 'active' : ''}`}
                onClick={() => setScale('F')}
              >
                °F
              </button>
            </div>
          </div>

          <div className="focused-temp-footer-note">
            <Icons.CheckCircle2 size={13}/>
            <span>Live meteorological reading for currently selected sector · Rakshak Telemetry</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// Compact Live Temperature Navbar Pill for Top Header
export function LiveTemperatureNavPill({ onClick }) {
  const { activeLocation } = useLocation();
  const [currentTemp, setCurrentTemp] = useState(null);

  useEffect(() => {
    let mounted = true;
    const center = getDistrictCenter(activeLocation.state, activeLocation.district);
    const lat = activeLocation.coordinates?.lat || center.lat;
    const lng = activeLocation.coordinates?.lng || center.lng;

    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m&timezone=auto`)
      .then(res => res.json())
      .then(data => {
        if (mounted && data?.current) {
          setCurrentTemp(data.current.temperature_2m);
        }
      })
      .catch(() => {});

    return () => { mounted = false; };
  }, [activeLocation]);

  return (
    <button
      type="button"
      className="live-temp-navbar-pill interactive"
      onClick={onClick}
      title="Currently Selected Location Temperature"
    >
      <span className="temp-pulse-dot"/>
      <Icons.Thermometer size={14} className="temp-icon"/>
      <b className="temp-degrees mono">{currentTemp !== null ? `${currentTemp.toFixed(1)}°C` : '--°C'}</b>
      <span className="temp-city-label">{activeLocation.city || activeLocation.district}</span>
    </button>
  );
}

export default DigitalTemperatureReader;
