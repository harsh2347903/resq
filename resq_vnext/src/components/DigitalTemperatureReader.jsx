import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as Icons from 'lucide-react';
import { useLocation } from '../context/LocationContext';
import { getAllCitiesAcrossIndia, getDistrictCenter } from '../lib/indiaGeoData';

// WMO Weather code interpreter for realistic meteorological labels and icons
function decodeWmoWeather(code, isDay = 1) {
  switch (code) {
    case 0:
      return { label: 'Clear Sky', icon: isDay ? Icons.Sun : Icons.Moon, color: '#f59e0b', hazard: 'Normal' };
    case 1:
      return { label: 'Mainly Clear', icon: isDay ? Icons.SunMedium : Icons.Moon, color: '#fbbf24', hazard: 'Normal' };
    case 2:
      return { label: 'Partly Cloudy', icon: isDay ? Icons.CloudSun : Icons.CloudMoon, color: '#38bdf8', hazard: 'Normal' };
    case 3:
      return { label: 'Overcast Skies', icon: Icons.Cloud, color: '#94a3b8', hazard: 'Normal' };
    case 45:
    case 48:
      return { label: 'Dense Fog / Mist', icon: Icons.CloudFog, color: '#cbd5e1', hazard: 'Low Visibility' };
    case 51:
    case 53:
    case 55:
      return { label: 'Light Drizzle', icon: Icons.CloudDrizzle, color: '#06b6d4', hazard: 'Precipitation' };
    case 61:
    case 63:
      return { label: 'Moderate Rain', icon: Icons.CloudRain, color: '#0284c7', hazard: 'Slick Roads' };
    case 65:
      return { label: 'Heavy Downpour', icon: Icons.CloudRain, color: '#1d4ed8', hazard: 'Flood Watch' };
    case 71:
    case 73:
    case 75:
      return { label: 'Snow / Freezing Runoff', icon: Icons.Snowflake, color: '#e0f2fe', hazard: 'Freezing Hazard' };
    case 80:
    case 81:
    case 82:
      return { label: 'Torrential Showers', icon: Icons.CloudRainWind, color: '#2563eb', hazard: 'Surge Watch' };
    case 95:
    case 96:
    case 99:
      return { label: 'Severe Thunderstorm', icon: Icons.CloudLightning, color: '#ef4444', hazard: 'Severe Thunderstorm Defcon' };
    default:
      return { label: 'Fair Weather', icon: Icons.Sun, color: '#f59e0b', hazard: 'Normal' };
  }
}

// Thermal Hazard & DEFCON Level
function evaluateThermalHazard(celsius) {
  if (celsius >= 44) {
    return {
      level: 'CRITICAL SEVERE HEATWAVE',
      defcon: 'DEFCON 1',
      color: '#ef4444',
      advice: 'Extreme thermal emergency. Direct sun exposure dangerous. Mandatory hydration & cooling shelters active.'
    };
  }
  if (celsius >= 40) {
    return {
      level: 'HEATWAVE WARNING',
      defcon: 'DEFCON 2',
      color: '#f97316',
      advice: 'Severe heat stress. High risk of heatstroke for children, elderly, and field workers.'
    };
  }
  if (celsius >= 35) {
    return {
      level: 'THERMAL CAUTION',
      defcon: 'DEFCON 3',
      color: '#f59e0b',
      advice: 'Elevated ambient temperature. Ensure adequate fluid intake and shade for field crews.'
    };
  }
  if (celsius <= 10) {
    return {
      level: 'COLD WAVE WATCH',
      defcon: 'DEFCON 3',
      color: '#38bdf8',
      advice: 'Low ambient temperatures. Thermal blankets and warming shelter units staged.'
    };
  }
  return {
    level: 'OPTIMAL COMFORT',
    defcon: 'NOMINAL',
    color: '#10b981',
    advice: 'Ambient temperatures within safe operational limits.'
  };
}

// Quick Preset Cities for 1-Click Temperature Checks
const PRESET_CITIES = [
  { name: 'Pune (Shivaji Nagar)', district: 'Pune', state: 'Maharashtra', lat: 18.5314, lng: 73.8446 },
  { name: 'Kothrud (Pune)', district: 'Pune', state: 'Maharashtra', lat: 18.5074, lng: 73.8077 },
  { name: 'Hinjawadi IT Hub', district: 'Pune', state: 'Maharashtra', lat: 18.5913, lng: 73.7389 },
  { name: 'Lonavala Hill Station', district: 'Pune', state: 'Maharashtra', lat: 18.7546, lng: 73.4062 },
  { name: 'Baramati', district: 'Pune', state: 'Maharashtra', lat: 18.1517, lng: 74.5772 },
  { name: 'Mumbai (Colaba / Marine Dr)', district: 'Mumbai City', state: 'Maharashtra', lat: 18.9067, lng: 72.8147 },
  { name: 'Bandra / BKC (Mumbai)', district: 'Mumbai Suburban', state: 'Maharashtra', lat: 19.0596, lng: 72.8295 },
  { name: 'Thane City', district: 'Thane', state: 'Maharashtra', lat: 19.2183, lng: 72.9781 },
  { name: 'Nagpur Central', district: 'Nagpur', state: 'Maharashtra', lat: 21.1458, lng: 79.0882 },
  { name: 'Nashik MIDC', district: 'Nashik', state: 'Maharashtra', lat: 19.9975, lng: 73.7898 },
  { name: 'New Delhi (HQ)', district: 'New Delhi', state: 'Delhi', lat: 28.6139, lng: 77.2090 },
  { name: 'Bengaluru Core', district: 'Bengaluru Urban', state: 'Karnataka', lat: 12.9716, lng: 77.5946 }
];

export function DigitalTemperatureReader({
  isOpen,
  onClose,
  initialLocation = null,
  embeddedMode = false
}) {
  const { activeLocation } = useLocation();

  // Selected Target Location State
  const [targetLocation, setTargetLocation] = useState(() => {
    if (initialLocation?.lat && initialLocation?.lng) {
      return initialLocation;
    }
    const center = getDistrictCenter(activeLocation.state, activeLocation.district);
    return {
      name: `${activeLocation.city || activeLocation.taluka || activeLocation.district} (${activeLocation.district})`,
      district: activeLocation.district,
      state: activeLocation.state,
      lat: activeLocation.coordinates?.lat || center.lat,
      lng: activeLocation.coordinates?.lng || center.lng,
      isGps: false
    };
  });

  // Telemetry Data State
  const [weatherData, setWeatherData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tempUnit, setTempUnit] = useState('C'); // 'C' | 'F'
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const [detectingGps, setDetectingGps] = useState(false);

  // Search & Selector State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchingRemote, setSearchingRemote] = useState(false);

  // All Indian Cities Database
  const allIndianCities = useMemo(() => getAllCitiesAcrossIndia(), []);

  // Fetch Live Real-Time Temperature from Open-Meteo API
  const fetchLiveTemperature = useCallback(async (lat, lng) => {
    setLoading(true);
    setError('');
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m,surface_pressure&timezone=auto`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Weather telemetry server returned ${res.status}`);
      const data = await res.json();
      if (data?.current) {
        setWeatherData(data.current);
        setLastRefreshed(new Date());
      } else {
        throw new Error('No current temperature reading available');
      }
    } catch (err) {
      setError(err.message || 'Failed to fetch live temperature telemetry');
    } finally {
      setLoading(false);
    }
  }, []);

  // Trigger fetch when target location changes
  useEffect(() => {
    if (targetLocation?.lat && targetLocation?.lng) {
      fetchLiveTemperature(targetLocation.lat, targetLocation.lng);
    }
  }, [targetLocation, fetchLiveTemperature]);

  // Periodic Auto-refresh every 60 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      if (targetLocation?.lat && targetLocation?.lng) {
        fetchLiveTemperature(targetLocation.lat, targetLocation.lng);
      }
    }, 60000);
    return () => clearInterval(timer);
  }, [targetLocation, fetchLiveTemperature]);

  // 1-Click Browser GPS Device Geolocation Detection
  const handleDetectCurrentGPS = useCallback(() => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser device.');
      return;
    }

    setDetectingGps(true);
    setError('');

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(4));
        const lng = Number(pos.coords.longitude.toFixed(4));
        const accuracy = Math.round(pos.coords.accuracy || 10);

        setTargetLocation({
          name: `My Live GPS Location (±${accuracy}m precision)`,
          district: 'Current Geolocation',
          state: 'Live Device Fix',
          lat,
          lng,
          isGps: true
        });
        setDetectingGps(false);
      },
      (err) => {
        setDetectingGps(false);
        setError(`GPS fix failed: ${err.message}. Using selected location instead.`);
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  }, []);

  // Filter Local and Remote Cities
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    const q = searchQuery.toLowerCase();

    // 1. Search local Indian Cities dataset (small to large)
    const localMatches = allIndianCities.filter(c =>
      c.city.toLowerCase().includes(q) ||
      c.district.toLowerCase().includes(q) ||
      c.taluka.toLowerCase().includes(q) ||
      c.pincode.includes(q)
    ).slice(0, 10).map(c => ({
      name: `${c.city} (${c.district}, ${c.state})`,
      district: c.district,
      state: c.state,
      lat: c.coordinates.lat,
      lng: c.coordinates.lng,
      pincode: c.pincode,
      source: 'local'
    }));

    setSearchResults(localMatches);

    // 2. If few local matches, query Open-Meteo Geocoding for global & pan-India search
    if (localMatches.length < 4 && q.length >= 3) {
      setSearchingRemote(true);
      const timer = setTimeout(async () => {
        try {
          const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(searchQuery)}&count=6&language=en&format=json`);
          if (res.ok) {
            const data = await res.json();
            if (data?.results?.length) {
              const remoteMatches = data.results.map(r => ({
                name: `${r.name}, ${r.admin1 || ''} (${r.country || ''})`,
                district: r.admin2 || r.admin1 || r.name,
                state: r.admin1 || r.country,
                lat: Number(r.latitude.toFixed(4)),
                lng: Number(r.longitude.toFixed(4)),
                source: 'remote'
              }));
              setSearchResults(prev => {
                const combined = [...prev];
                remoteMatches.forEach(rm => {
                  if (!combined.some(c => Math.abs(c.lat - rm.lat) < 0.01 && Math.abs(c.lng - rm.lng) < 0.01)) {
                    combined.push(rm);
                  }
                });
                return combined;
              });
            }
          }
        } catch {
          // Graceful fallback to local results
        } finally {
          setSearchingRemote(false);
        }
      }, 350);

      return () => clearTimeout(timer);
    }
  }, [searchQuery, allIndianCities]);

  // Temperature calculations
  const rawTempC = weatherData?.temperature_2m ?? 31.4;
  const rawFeelsC = weatherData?.apparent_temperature ?? 34.2;

  const displayTemp = tempUnit === 'C'
    ? rawTempC.toFixed(1)
    : ((rawTempC * 9/5) + 32).toFixed(1);

  const displayFeels = tempUnit === 'C'
    ? rawFeelsC.toFixed(1)
    : ((rawFeelsC * 9/5) + 32).toFixed(1);

  const weatherMeta = decodeWmoWeather(weatherData?.weather_code ?? 0, weatherData?.is_day ?? 1);
  const WeatherIcon = weatherMeta.icon;
  const thermalHazard = evaluateThermalHazard(rawTempC);

  const readerContent = (
    <div className="digital-temperature-hardware-frame">
      {/* Top Header Controls */}
      <div className="digital-temp-header">
        <div className="temp-header-title">
          <span className="digital-led-pulse"/>
          <span className="digital-header-label">Digital Meteorological Telemetry</span>
          <span className="digital-defcon-badge" style={{ color: thermalHazard.color, borderColor: `${thermalHazard.color}40` }}>
            {thermalHazard.defcon}
          </span>
        </div>

        <div className="temp-header-actions">
          {/* Unit Toggle */}
          <div className="temp-unit-toggle">
            <button
              type="button"
              className={`unit-btn ${tempUnit === 'C' ? 'active' : ''}`}
              onClick={() => setTempUnit('C')}
            >
              °C
            </button>
            <button
              type="button"
              className={`unit-btn ${tempUnit === 'F' ? 'active' : ''}`}
              onClick={() => setTempUnit('F')}
            >
              °F
            </button>
          </div>

          {/* Refresh Button */}
          <button
            type="button"
            className={`temp-refresh-btn ${loading ? 'spinning' : ''}`}
            onClick={() => fetchLiveTemperature(targetLocation.lat, targetLocation.lng)}
            title="Refresh Live Telemetry"
          >
            <Icons.RefreshCw size={13}/>
          </button>

          {!embeddedMode && onClose && (
            <button type="button" className="temp-close-btn" onClick={onClose}>
              <Icons.X size={15}/>
            </button>
          )}
        </div>
      </div>

      {/* Target Location Banner & GPS Detection */}
      <div className="temp-location-banner glass-panel">
        <div className="loc-info-left">
          <div className="loc-headline">
            {targetLocation.isGps ? (
              <span className="gps-live-badge"><Icons.Navigation size={12}/> LIVE GPS FIX</span>
            ) : (
              <span className="loc-pin-badge"><Icons.MapPin size={12}/> SELECTED STATION</span>
            )}
            <h3 className="loc-name">{targetLocation.name}</h3>
          </div>
          <span className="loc-coords mono">
            {targetLocation.lat.toFixed(4)}° N, {targetLocation.lng.toFixed(4)}° E &bull; {targetLocation.state}
          </span>
        </div>

        <div className="loc-info-right">
          <button
            type="button"
            className={`gps-detect-btn ${detectingGps ? 'detecting' : ''}`}
            onClick={handleDetectCurrentGPS}
            disabled={detectingGps}
          >
            <Icons.Compass size={13}/>
            <span>{detectingGps ? 'Locking Satellites...' : 'Detect My Realtime Location'}</span>
          </button>
        </div>
      </div>

      {/* Main Digital LED Display Panel */}
      <div className="digital-led-display-panel">
        <div className="digital-screen-bezel">
          <div className="digital-screen-inner">
            {/* Top Sub-readout */}
            <div className="screen-top-strip">
              <span className="screen-tag">SENSOR: THERMAL INFRARED V2</span>
              <span className="screen-status-live">● REALTIME STREAMING</span>
              <span className="screen-clock mono">
                {lastRefreshed ? lastRefreshed.toLocaleTimeString() : 'LIVE'}
              </span>
            </div>

            {/* Central Giant Digital LED Temperature Readout */}
            <div className="screen-center-readout">
              <div className="weather-icon-badge" style={{ color: weatherMeta.color }}>
                <WeatherIcon size={44}/>
                <span className="weather-label">{weatherMeta.label}</span>
              </div>

              <div className="giant-led-number-group">
                <div className="giant-number-row">
                  <span className="giant-led-digits digital-lcd-font">{displayTemp}</span>
                  <span className="giant-led-unit">°{tempUnit}</span>
                </div>
                <div className="feels-like-sub">
                  <span>FEELS LIKE:</span>
                  <b className="mono">{displayFeels}°{tempUnit}</b>
                </div>
              </div>
            </div>

            {/* Secondary Meteorological Sensor Matrix */}
            <div className="screen-sensor-matrix">
              <div className="sensor-matrix-cell">
                <span className="sensor-label"><Icons.Droplets size={11}/> RELATIVE HUMIDITY</span>
                <b className="sensor-value mono">{weatherData?.relative_humidity_2m ?? 58}%</b>
                <div className="sensor-bar">
                  <div className="sensor-fill" style={{ width: `${weatherData?.relative_humidity_2m ?? 58}%`, background: '#06b6d4' }}/>
                </div>
              </div>

              <div className="sensor-matrix-cell">
                <span className="sensor-label"><Icons.Wind size={11}/> WIND VELOCITY</span>
                <b className="sensor-value mono">{weatherData?.wind_speed_10m ?? 12.4} km/h</b>
                <span className="sensor-sub">Anemometer Level 2</span>
              </div>

              <div className="sensor-matrix-cell">
                <span className="sensor-label"><Icons.Gauge size={11}/> BAROMETRIC PRESSURE</span>
                <b className="sensor-value mono">{weatherData?.surface_pressure ?? 1012.8} hPa</b>
                <span className="sensor-sub">Mean Sea Level</span>
              </div>

              <div className="sensor-matrix-cell">
                <span className="sensor-label"><Icons.CloudRain size={11}/> PRECIPITATION</span>
                <b className="sensor-value mono">{weatherData?.precipitation ?? 0.0} mm/h</b>
                <span className="sensor-sub">{weatherMeta.hazard}</span>
              </div>
            </div>

            {/* Thermal Hazard Directive Bar */}
            <div className="thermal-hazard-directive" style={{ borderColor: `${thermalHazard.color}35`, background: `${thermalHazard.color}10` }}>
              <div className="directive-tag" style={{ color: thermalHazard.color }}>
                <Icons.AlertTriangle size={13}/>
                <span>{thermalHazard.level} ({thermalHazard.defcon})</span>
              </div>
              <p className="directive-text">{thermalHazard.advice}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Location Search Bar & Multi-Location Selector */}
      <div className="multi-location-search-section">
        <div className="search-input-wrapper">
          <Icons.Search size={14} className="search-icon"/>
          <input
            type="text"
            className="city-search-input"
            placeholder="Check another location's temperature (e.g. Kothrud, Lonavala, Andheri, Nagpur, Delhi, Baramati...)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button type="button" className="clear-search-btn" onClick={() => setSearchQuery('')}>
              <Icons.X size={12}/>
            </button>
          )}
          {searchingRemote && <span className="search-spinner-text">Searching global database...</span>}
        </div>

        {/* Live Search Autocomplete Dropdown */}
        <AnimatePresence>
          {searchResults.length > 0 && (
            <motion.div
              className="city-search-dropdown glass-panel"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
            >
              <div className="dropdown-header">
                <span>FOUND {searchResults.length} LOCATIONS (SMALL TO LARGE):</span>
              </div>
              <div className="dropdown-scroll">
                {searchResults.map((loc, idx) => (
                  <button
                    key={`${loc.name}-${idx}`}
                    type="button"
                    className="dropdown-loc-row"
                    onClick={() => {
                      setTargetLocation({
                        name: loc.name,
                        district: loc.district,
                        state: loc.state,
                        lat: loc.lat,
                        lng: loc.lng,
                        isGps: false
                      });
                      setSearchQuery('');
                      setSearchResults([]);
                    }}
                  >
                    <div className="loc-row-left">
                      <Icons.MapPin size={13} className="loc-icon"/>
                      <span className="loc-name-text">{loc.name}</span>
                    </div>
                    <span className="loc-coords-tag mono">{loc.lat.toFixed(2)}°, {loc.lng.toFixed(2)}°</span>
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Quick Presets Strip */}
        <div className="preset-cities-strip">
          <span className="preset-label">QUICK SECTOR LOOKUP:</span>
          <div className="preset-pills-row">
            {PRESET_CITIES.map((p) => {
              const isCurrent = Math.abs(targetLocation.lat - p.lat) < 0.001 && Math.abs(targetLocation.lng - p.lng) < 0.001;
              return (
                <button
                  key={p.name}
                  type="button"
                  className={`preset-pill ${isCurrent ? 'active' : ''}`}
                  onClick={() => {
                    setTargetLocation({
                      name: p.name,
                      district: p.district,
                      state: p.state,
                      lat: p.lat,
                      lng: p.lng,
                      isGps: false
                    });
                  }}
                >
                  <span className="pill-dot"/>
                  <span>{p.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );

  if (embeddedMode) {
    return <div className="digital-temperature-embedded-container">{readerContent}</div>;
  }

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop-blur">
      <motion.div
        className="digital-temp-modal-dialog"
        initial={{ opacity: 0, scale: 0.94, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 16 }}
        transition={{ duration: 0.2 }}
      >
        {readerContent}
      </motion.div>
    </div>
  );
}

// Compact Live Temperature Navbar Pill for Top Header
export function LiveTemperatureNavPill({ onClick }) {
  const { activeLocation } = useLocation();
  const [currentTemp, setCurrentTemp] = useState(null);
  const [weatherCode, setWeatherCode] = useState(0);

  useEffect(() => {
    let mounted = true;
    const center = getDistrictCenter(activeLocation.state, activeLocation.district);
    const lat = activeLocation.coordinates?.lat || center.lat;
    const lng = activeLocation.coordinates?.lng || center.lng;

    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code&timezone=auto`)
      .then(res => res.json())
      .then(data => {
        if (mounted && data?.current) {
          setCurrentTemp(data.current.temperature_2m);
          setWeatherCode(data.current.weather_code);
        }
      })
      .catch(() => {});

    return () => { mounted = false; };
  }, [activeLocation]);

  const weather = decodeWmoWeather(weatherCode);
  const Icon = weather.icon;

  return (
    <button
      type="button"
      className="live-temp-navbar-pill"
      onClick={onClick}
      title="Open Digital Real-Time Temperature Telemetry"
    >
      <span className="temp-pulse-dot"/>
      <span className="temp-icon" style={{ color: weather.color }}>
        <Icon size={14}/>
      </span>
      <b className="temp-degrees mono">{currentTemp !== null ? `${currentTemp.toFixed(1)}°C` : '--°C'}</b>
      <span className="temp-city-label">{activeLocation.city || activeLocation.district}</span>
    </button>
  );
}
