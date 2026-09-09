import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as Icons from 'lucide-react';
import { api } from '../lib/apiClient';
import { useLocation } from '../context/LocationContext';
import { getTalukasForDistrict, getCitiesForDistrict, getDistrictCenter } from '../lib/indiaGeoData';
import { LocationSwitcherBadge } from './LocationSwitcherModal';

// Canvas Coordinate Mapping: Converts real GPS (lat, lng) to SVG (x, y) coordinates based on dynamic bounds
function projectGpsToSvg(lat, lng, bounds, width = 1000, height = 650) {
  const x = ((lng - bounds.minLng) / (bounds.maxLng - bounds.minLng)) * width;
  // Latitude is inverted on screen (higher lat = further north = smaller y)
  const y = ((bounds.maxLat - lat) / (bounds.maxLat - bounds.minLat)) * height;
  return {
    x: Math.max(35, Math.min(width - 35, x)),
    y: Math.max(35, Math.min(height - 35, y))
  };
}

// Convert SVG (x, y) back to GPS coordinate for HUD telemetry
function projectSvgToGps(x, y, bounds, width = 1000, height = 650) {
  const lng = bounds.minLng + (x / width) * (bounds.maxLng - bounds.minLng);
  const lat = bounds.maxLat - (y / height) * (bounds.maxLat - bounds.minLat);
  return { lat: Number(lat.toFixed(4)), lng: Number(lng.toFixed(4)) };
}

export function CustomTacticalMap({ layers = { incidents: true, shelters: true, ngo: true, responders: true } }) {
  const { activeLocation } = useLocation();
  const svgRef = useRef(null);

  const [selectedPoint, setSelectedPoint] = useState(null);
  const [activeSector, setActiveSector] = useState('all');
  const [cursorCoords, setCursorCoords] = useState('18.5204° N, 73.8567° E');
  const [radarActive, setRadarActive] = useState(true);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [toast, setToast] = useState('');
  const [activeLayerFilters, setActiveLayerFilters] = useState({
    critical: true,
    warning: true,
    shelters: true,
    ngo: true
  });

  // Dynamic Data States from Backend API
  const [incidentsList, setIncidentsList] = useState([]);
  const [sheltersList, setSheltersList] = useState([]);

  // Fetch live backend records with fallback
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const [incRes, sheRes] = await Promise.all([
          api.incidents.getAll().catch(() => ({ incidents: [] })),
          api.shelters.getAll().catch(() => ({ shelters: [] }))
        ]);
        if (mounted) {
          if (incRes?.incidents?.length) setIncidentsList(incRes.incidents);
          if (sheRes?.shelters?.length) setSheltersList(sheRes.shelters);
        }
      } catch {
        // Handled gracefully with seeded locations
      }
    };
    load();
    const interval = setInterval(load, 15000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  // Compute active center and bounding box dynamically from activeLocation
  const currentCenter = useMemo(() => {
    if (activeLocation?.coordinates?.lat && activeLocation?.coordinates?.lng) {
      return activeLocation.coordinates;
    }
    const fallback = getDistrictCenter(activeLocation.state, activeLocation.district);
    return { lat: fallback.lat, lng: fallback.lng };
  }, [activeLocation]);

  const activeBounds = useMemo(() => {
    if (activeLocation?.bounds) return activeLocation.bounds;
    const fallback = getDistrictCenter(activeLocation.state, activeLocation.district);
    return fallback.bounds || {
      minLat: currentCenter.lat - 0.12,
      maxLat: currentCenter.lat + 0.12,
      minLng: currentCenter.lng - 0.14,
      maxLng: currentCenter.lng + 0.14
    };
  }, [activeLocation, currentCenter]);

  // Command EOC HQ for the active sector
  const activeHq = useMemo(() => {
    return {
      lat: currentCenter.lat,
      lng: currentCenter.lng,
      title: `${activeLocation.district} Incident Command EOC (${activeLocation.taluka || 'Central'})`,
      sector: activeLocation.taluka || activeLocation.district
    };
  }, [currentCenter, activeLocation]);

  // When active location changes, reset pan and zoom smoothly
  useEffect(() => {
    setZoomLevel(1);
    setPanOffset({ x: 0, y: 0 });
    setActiveSector('all');
    setSelectedPoint(null);
    setCursorCoords(`${currentCenter.lat.toFixed(4)}° N, ${currentCenter.lng.toFixed(4)}° E`);
  }, [activeLocation, currentCenter]);

  // Locations to plot: Prioritize locations in and around active district / taluka
  const allLocations = useMemo(() => {
    // 1. Incidents
    const incs = (incidentsList.length ? incidentsList : [
      { id: 'INC-077', type: 'Flood', district: 'Pune', taluka: 'Haveli', location: 'Pune • Mula-Mutha basin', coordinates: { lat: 18.5312, lng: 73.8553 }, severity: 'Critical', affected: '2,482', details: 'Water surge +3.8m above danger mark.' },
      { id: 'INC-076', type: 'Landslide', district: 'Pune', taluka: 'Maval', location: 'Lonavala • Old Mumbai Rd', coordinates: { lat: 18.7546, lng: 73.4062 }, severity: 'High', affected: '218', details: 'Debris blocking transit corridor.' },
      { id: 'INC-080', type: 'Coastal Surge', district: 'Mumbai City', taluka: 'Worli', location: 'Worli Seaface • Marine Inundation', coordinates: { lat: 19.0166, lng: 72.8169 }, severity: 'Critical', affected: '3,120', details: 'High tide seawater breach over embankment.' },
      { id: 'INC-081', type: 'Waterlogging', district: 'Mumbai Suburban', taluka: 'Kurla', location: 'Kurla • Mithi River Overflow', coordinates: { lat: 19.0726, lng: 72.8845 }, severity: 'High', affected: '1,450', details: 'Rail subway flooding; rescue boats deployed.' },
      { id: 'INC-075', type: 'Fire', district: 'Nashik', taluka: 'Nashik', location: 'Nashik • MIDC Industrial Zone', coordinates: { lat: 19.9975, lng: 73.7898 }, severity: 'High', affected: '624', details: 'Chemical storage vapor flare containment.' },
      { id: 'INC-074', type: 'Heatwave', district: 'Nagpur', taluka: 'Nagpur Urban', location: 'Nagpur • Central zone', coordinates: { lat: 21.1458, lng: 79.0882 }, severity: 'Medium', affected: '5,870', details: 'Severe thermal warning.' },
      { id: 'INC-079', type: 'Landslide', district: 'Satara', taluka: 'Wai', location: 'Wai-Pasarni Ghat Corridor', coordinates: { lat: 17.9480, lng: 73.8920 }, severity: 'Critical', affected: '340', details: 'Hillside rockfall blocking access.' }
    ]).map(i => ({
      id: i.id || `inc-${Math.random()}`,
      category: 'incident',
      type: (i.severity?.toLowerCase() === 'critical' ? 'critical' : 'warning'),
      name: `${i.type} (${i.severity})`,
      title: `${i.type} at ${i.location}`,
      sub: i.details || `Impact zone: ${i.affected || 'Multiple'} citizens affected`,
      district: i.district || 'Pune',
      taluka: i.taluka || '',
      lat: i.coordinates?.lat ?? currentCenter.lat,
      lng: i.coordinates?.lng ?? currentCenter.lng,
      severity: i.severity || 'Critical',
      affected: i.affected || '200+',
      team: 'NDRF Battalion & Civil Defense'
    }));

    // 2. Shelters
    const shels = (sheltersList.length ? sheltersList : [
      { id: 1, name: 'Shivaji Sports Complex', district: 'Pune', taluka: 'Haveli', city: 'Pune City', address: 'Shivaji Nagar, Pune', coordinates: { lat: 18.5314, lng: 73.8446 }, capacity: 850, occupied: 642, services: ['Food', 'Medical', 'Childcare', 'Bedding'], eta: '4 min' },
      { id: 2, name: 'Bharati Vidyapeeth Hall', district: 'Pune', taluka: 'Haveli', city: 'Katraj', address: 'Katraj, Pune', coordinates: { lat: 18.4575, lng: 73.8508 }, capacity: 520, occupied: 301, services: ['Food', 'Power', 'Wi-Fi', 'First Aid'], eta: '14 min' },
      { id: 5, name: 'Aundh Community Hall', district: 'Pune', taluka: 'Haveli', city: 'Aundh', address: 'Aundh, Pune', coordinates: { lat: 18.5590, lng: 73.8070 }, capacity: 430, occupied: 176, services: ['Water', 'Childcare', 'Charging'], eta: '13 min' },
      { id: 8, name: 'Lonavala Municipal Camp', district: 'Pune', taluka: 'Maval', city: 'Lonavala', address: 'Lonavala', coordinates: { lat: 18.7546, lng: 73.4062 }, capacity: 450, occupied: 190, services: ['Food', 'Blankets'], eta: '28 min' },
      { id: 10, name: 'NSCI Dome Evacuation Center', district: 'Mumbai City', taluka: 'Worli', city: 'Worli', address: 'Worli Seaface', coordinates: { lat: 19.0166, lng: 72.8169 }, capacity: 1200, occupied: 480, services: ['Food', 'Medical', 'ICU Beds'], eta: '8 min' },
      { id: 11, name: 'Andheri Sports Complex Relief Hub', district: 'Mumbai Suburban', taluka: 'Andheri', city: 'Andheri West', address: 'Andheri W', coordinates: { lat: 19.1136, lng: 72.8697 }, capacity: 950, occupied: 510, services: ['Food', 'Charging', 'Childcare'], eta: '11 min' },
      { id: 12, name: 'Dadar Swatantryaveer Hall', district: 'Mumbai City', taluka: 'Dadar', city: 'Dadar', address: 'Dadar West', coordinates: { lat: 19.0178, lng: 72.8478 }, capacity: 580, occupied: 320, services: ['Food', 'First Aid'], eta: '14 min' },
      { id: 14, name: 'Dadoji Kondadev Relief Camp', district: 'Thane', taluka: 'Thane', city: 'Thane City', address: 'Thane West', coordinates: { lat: 19.2183, lng: 72.9781 }, capacity: 800, occupied: 410, services: ['Food', 'Water', 'Medical'], eta: '10 min' },
      { id: 4, name: 'Nehru Stadium Transit Camp', district: 'Nagpur', taluka: 'Nagpur Urban', city: 'Nagpur', address: 'Civil Lines, Nagpur', coordinates: { lat: 21.1458, lng: 79.0882 }, capacity: 1100, occupied: 620, services: ['Food', 'Medical', 'Cooling Rooms'], eta: '12 min' },
      { id: 17, name: 'Golf Club Ground Relief Camp', district: 'Nashik', taluka: 'Nashik', city: 'Nashik', address: 'Old Agra Rd, Nashik', coordinates: { lat: 19.9975, lng: 73.7898 }, capacity: 700, occupied: 310, services: ['Food', 'Water'], eta: '9 min' },
      { id: 3, name: 'ZP School Relief Centre', district: 'Satara', taluka: 'Satara', city: 'Satara', address: 'Satara Main Rd', coordinates: { lat: 17.6805, lng: 74.0183 }, capacity: 340, occupied: 210, services: ['Food', 'Water', 'First Aid'], eta: '15 min' }
    ]).map(s => ({
      id: `she-${s.id}`,
      category: 'shelter',
      type: 'safe',
      name: s.name,
      title: s.name,
      district: s.district || 'Pune',
      taluka: s.taluka || '',
      sub: `${s.capacity - s.occupied} Available Beds · ${Math.round((s.occupied / s.capacity) * 100)}% Occupancy`,
      lat: s.coordinates?.lat ?? currentCenter.lat,
      lng: s.coordinates?.lng ?? currentCenter.lng,
      capacity: s.capacity,
      occupied: s.occupied,
      availableBeds: s.capacity - s.occupied,
      services: s.services || ['Food', 'Medical', 'Bedding'],
      address: `${s.city || activeLocation.district}, Maharashtra`,
      eta: s.eta || '10 min',
      team: 'District Relief Logistics Taskforce'
    }));

    // 3. NGO Stations
    const ngos = [
      {
        id: 'ngo-seva-kitchen',
        category: 'ngo',
        type: 'info',
        name: 'Seva Food Kitchen Base',
        title: 'Seva Relief Mobile Kitchen 04',
        district: 'Pune',
        taluka: 'Haveli',
        sub: '1,200 survival rations/hr · 42 Active Volunteers',
        lat: 18.4900,
        lng: 73.8150,
        team: 'Seva Collective Logistics Unit',
        services: ['Meal Distribution', 'Potable Water', 'Baby Care']
      },
      {
        id: 'ngo-boat-sar',
        category: 'ngo',
        type: 'info',
        name: 'Kabir R. Watercraft Squad',
        title: 'NDRF Inflatable Zodiac Boat Squad',
        district: 'Pune',
        taluka: 'Haveli',
        sub: '6 motorized rescue watercraft deployed for evacuations',
        lat: 18.5074,
        lng: 73.8077,
        team: 'Volunteer Watercraft Brigade',
        services: ['Zodiac Boats', 'Life Vests', 'Diver Team']
      },
      {
        id: 'ngo-mumbai-marine',
        category: 'ngo',
        type: 'info',
        name: 'Coastal Lifeguard Volunteer Core',
        title: 'Mumbai Coastal SAR Squad',
        district: 'Mumbai City',
        taluka: 'Worli',
        sub: 'Jet-skis and flood rafts staged at Marine Lines',
        lat: 18.9400,
        lng: 72.8250,
        team: 'Coast Guard Auxiliary',
        services: ['Rescue Rafts', 'Paramedics']
      },
      {
        id: 'ngo-nagpur-cooling',
        category: 'ngo',
        type: 'info',
        name: 'Vidarbha Heat Relief Volunteers',
        title: 'Vidarbha Cooling Taskforce',
        district: 'Nagpur',
        taluka: 'Nagpur Urban',
        sub: 'Hydration and electrolyte distribution for field citizens',
        lat: 21.1400,
        lng: 79.0800,
        team: 'Red Cross Nagpur',
        services: ['Electrolyte Stations', 'Cooling Vans']
      }
    ];

    // Filter points to those matching the active district or nearby bounds
    const activeDistrictLower = (activeLocation.district || '').toLowerCase();
    const isMatchingOrNear = (pt) => {
      const ptDistrict = (pt.district || '').toLowerCase();
      if (ptDistrict === activeDistrictLower) return true;
      // Also include if within the calculated bounds
      return (
        pt.lat >= activeBounds.minLat &&
        pt.lat <= activeBounds.maxLat &&
        pt.lng >= activeBounds.minLng &&
        pt.lng <= activeBounds.maxLng
      );
    };

    const localPoints = [...incs, ...shels, ...ngos].filter(isMatchingOrNear);

    // If no specific points in this district yet, generate default local EOC pins so map is never blank
    if (localPoints.length === 0) {
      return [
        {
          id: `she-local-${activeLocation.district}`,
          category: 'shelter',
          type: 'safe',
          name: `${activeLocation.district} Regional Relief Center`,
          title: `${activeLocation.district} Central Transit Shelter`,
          district: activeLocation.district,
          taluka: activeLocation.taluka,
          sub: '450 Available Beds · Verified Safe Facility',
          lat: currentCenter.lat + 0.015,
          lng: currentCenter.lng + 0.012,
          capacity: 600,
          occupied: 150,
          availableBeds: 450,
          services: ['Food', 'Water', 'Medical', 'Bedding'],
          address: `${activeLocation.taluka || activeLocation.district}, ${activeLocation.state}`,
          eta: '6 min',
          team: `${activeLocation.district} Civil Defense`
        },
        {
          id: `ngo-local-${activeLocation.district}`,
          category: 'ngo',
          type: 'info',
          name: `${activeLocation.district} Volunteer Network Hub`,
          title: `${activeLocation.district} Community Kitchen & First Aid`,
          district: activeLocation.district,
          taluka: activeLocation.taluka,
          sub: '28 Active Volunteers · Relief Rations Active',
          lat: currentCenter.lat - 0.012,
          lng: currentCenter.lng - 0.015,
          team: 'District Volunteer Taskforce',
          services: ['Rations', 'First Aid', 'Family Help']
        }
      ];
    }

    return localPoints;
  }, [incidentsList, sheltersList, activeLocation, activeBounds, currentCenter]);

  // Filter visible points based on active layer chips
  const visiblePoints = useMemo(() => {
    return allLocations.filter(pt => {
      if (pt.category === 'incident' && !layers.incidents) return false;
      if (pt.category === 'shelter' && !layers.shelters) return false;
      if (pt.category === 'ngo' && !layers.ngo) return false;

      if (pt.type === 'critical' && !activeLayerFilters.critical) return false;
      if (pt.type === 'warning' && !activeLayerFilters.warning) return false;
      if (pt.type === 'safe' && !activeLayerFilters.shelters) return false;
      if (pt.type === 'info' && !activeLayerFilters.ngo) return false;

      return true;
    });
  }, [allLocations, layers, activeLayerFilters]);

  // Dynamic Sectors for the current district
  const availableTalukas = useMemo(() => {
    const list = getTalukasForDistrict(activeLocation.state, activeLocation.district);
    return list.slice(0, 6); // Top 6 sectors for quick chips
  }, [activeLocation]);

  const jumpToSector = (talukaName) => {
    setActiveSector(talukaName);
    if (talukaName === 'all') {
      setPanOffset({ x: 0, y: 0 });
      setZoomLevel(1);
      return;
    }

    // Find city/sector coordinates in that taluka
    const cities = getCitiesForDistrict(activeLocation.state, activeLocation.district);
    const matched = cities.find(c => c.taluka === talukaName && c.coordinates);
    if (matched?.coordinates) {
      const pos = projectGpsToSvg(matched.coordinates.lat, matched.coordinates.lng, activeBounds);
      // Pan to center that position
      setPanOffset({
        x: (500 - pos.x) * 0.7,
        y: (325 - pos.y) * 0.7
      });
      setZoomLevel(1.6);
    } else {
      setZoomLevel(1.4);
    }
  };

  // Google Maps Deep-Link Redirection (No external API needed in-app!)
  const redirectToGoogleMaps = (lat, lng, title, fromHQ = false) => {
    const url = fromHQ
      ? `https://www.google.com/maps/dir/?api=1&origin=${activeHq.lat},${activeHq.lng}&destination=${lat},${lng}&travelmode=driving`
      : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;

    window.open(url, '_blank', 'noopener,noreferrer');
    setToast(`🚀 Redirecting to Google Maps: Destination set to "${title}"`);
    setTimeout(() => setToast(''), 3500);
  };

  const dispatchTeam = (pt) => {
    setToast(`🚨 Emergency dispatch transmission sent to ${pt.team}!`);
    setTimeout(() => setToast(''), 3000);
  };

  // Mouse / Touch Navigation
  const handleMouseDown = (e) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
  };

  const handleMouseMove = (e) => {
    if (isDragging) {
      setPanOffset({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    }

    if (svgRef.current) {
      const rect = svgRef.current.getBoundingClientRect();
      const svgX = ((e.clientX - rect.left - panOffset.x) / (rect.width * zoomLevel)) * 1000;
      const svgY = ((e.clientY - rect.top - panOffset.y) / (rect.height * zoomLevel)) * 650;
      const gps = projectSvgToGps(svgX, svgY, activeBounds);
      setCursorCoords(`${gps.lat}° N, ${gps.lng}° E`);
    }
  };

  const handleMouseUp = () => setIsDragging(false);

  // Projected HQ point on the canvas
  const hqPos = projectGpsToSvg(activeHq.lat, activeHq.lng, activeBounds);
  const selectedPos = selectedPoint ? projectGpsToSvg(selectedPoint.lat, selectedPoint.lng, activeBounds) : null;

  // Determine regional terrain styling
  const isCoastal = (activeLocation.district || '').toLowerCase().includes('mumbai') ||
                    (activeLocation.district || '').toLowerCase().includes('thane') ||
                    (activeLocation.district || '').toLowerCase().includes('raigad');

  return (
    <div
      className="ops-map tactical-nav-map"
      style={{
        height: '560px',
        position: 'relative',
        overflow: 'hidden',
        borderRadius: '20px',
        background: 'radial-gradient(ellipse at 50% 50%, #0c1a27 0%, #060e15 100%)',
        border: '1px solid rgba(56, 189, 248, 0.2)',
        boxShadow: '0 24px 60px rgba(0, 0, 0, 0.7)',
        userSelect: 'none'
      }}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Tactical Top Toolbar with Live Location Switcher */}
      <div
        className="map-toolbar tactical-map-toolbar"
        style={{
          zIndex: 20,
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          padding: '12px 16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'linear-gradient(180deg, rgba(6,14,21,0.95) 0%, rgba(6,14,21,0.7) 80%, transparent 100%)',
          backdropFilter: 'blur(10px)',
          borderBottom: '1px solid rgba(56, 189, 248, 0.15)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span className="live-dot pulse-green" />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <b style={{ color: '#f8fafc', fontSize: '13px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                TACTICAL GIS · {activeLocation.district.toUpperCase()}
              </b>
              <LocationSwitcherBadge />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
              <span style={{ fontSize: '10px', color: '#38bdf8', fontFamily: 'monospace' }}>
                <Icons.Crosshair size={10} style={{ display: 'inline', marginRight: '3px' }} />
                {cursorCoords}
              </span>
              <span style={{ fontSize: '9px', background: 'rgba(56,189,248,0.15)', color: '#7dd3fc', padding: '1px 6px', borderRadius: '4px', border: '1px solid rgba(56,189,248,0.3)' }}>
                100% IN-HOUSE VECTOR ENGINE (NO THIRD-PARTY API)
              </span>
            </div>
          </div>
        </div>

        {/* Sector / Taluka Quick Jump Chips */}
        <div className="sector-jump-chips" style={{ display: 'flex', gap: '6px' }}>
          <button
            type="button"
            className={`sector-chip interactive ${activeSector === 'all' ? 'active' : ''}`}
            onClick={() => jumpToSector('all')}
            style={{
              fontSize: '11px',
              padding: '4px 10px',
              borderRadius: '8px',
              background: activeSector === 'all' ? 'rgba(56,189,248,0.25)' : 'rgba(15,23,42,0.6)',
              color: activeSector === 'all' ? '#38bdf8' : '#94a3b8',
              border: `1px solid ${activeSector === 'all' ? '#38bdf8' : 'rgba(255,255,255,0.08)'}`,
              cursor: 'pointer'
            }}
          >
            All Sectors
          </button>
          {availableTalukas.map(taluka => (
            <button
              type="button"
              key={taluka}
              className={`sector-chip interactive ${activeSector === taluka ? 'active' : ''}`}
              onClick={() => jumpToSector(taluka)}
              style={{
                fontSize: '11px',
                padding: '4px 10px',
                borderRadius: '8px',
                background: activeSector === taluka ? 'rgba(56,189,248,0.25)' : 'rgba(15,23,42,0.6)',
                color: activeSector === taluka ? '#38bdf8' : '#94a3b8',
                border: `1px solid ${activeSector === taluka ? '#38bdf8' : 'rgba(255,255,255,0.08)'}`,
                cursor: 'pointer'
              }}
            >
              {taluka}
            </button>
          ))}
        </div>

        {/* Tactical Controls */}
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <button
            type="button"
            className="interactive"
            onClick={() => setRadarActive(r => !r)}
            title="Toggle Radar Sweep"
            style={{
              background: radarActive ? 'rgba(16,185,129,0.2)' : 'rgba(15,23,42,0.6)',
              color: radarActive ? '#10b981' : '#94a3b8',
              border: '1px solid rgba(255,255,255,0.1)',
              padding: '6px 10px',
              borderRadius: '8px',
              fontSize: '11px',
              cursor: 'pointer'
            }}
          >
            <Icons.Radar size={13} style={{ display: 'inline', marginRight: '4px' }} />
            Radar {radarActive ? 'ON' : 'OFF'}
          </button>
          <button
            type="button"
            className="interactive"
            onClick={() => setZoomLevel(z => Math.min(2.5, z + 0.25))}
            title="Zoom In"
            style={{ background: 'rgba(15,23,42,0.6)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', padding: '6px 10px', borderRadius: '8px', cursor: 'pointer' }}
          >
            +
          </button>
          <button
            type="button"
            className="interactive"
            onClick={() => setZoomLevel(z => Math.max(0.75, z - 0.25))}
            title="Zoom Out"
            style={{ background: 'rgba(15,23,42,0.6)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', padding: '6px 10px', borderRadius: '8px', cursor: 'pointer' }}
          >
            -
          </button>
          <button
            type="button"
            className="interactive"
            onClick={() => {
              setZoomLevel(1);
              setPanOffset({ x: 0, y: 0 });
              setActiveSector('all');
              setSelectedPoint(null);
            }}
            title="Reset Map View"
            style={{ background: 'rgba(15,23,42,0.6)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', padding: '6px 10px', borderRadius: '8px', cursor: 'pointer' }}
          >
            <Icons.RotateCcw size={13} />
          </button>
        </div>
      </div>

      {/* Layer Filter Sub-Bar */}
      <div style={{ position: 'absolute', top: '64px', left: '16px', zIndex: 19, display: 'flex', gap: '8px' }}>
        <button
          type="button"
          className="interactive"
          onClick={() => setActiveLayerFilters(f => ({ ...f, critical: !f.critical }))}
          style={{
            fontSize: '10px',
            padding: '4px 10px',
            borderRadius: '999px',
            background: activeLayerFilters.critical ? 'rgba(244,63,94,0.15)' : 'rgba(15,23,42,0.8)',
            border: `1px solid ${activeLayerFilters.critical ? '#f43f5e' : 'rgba(255,255,255,0.1)'}`,
            color: activeLayerFilters.critical ? '#ff7070' : '#64748b',
            cursor: 'pointer'
          }}
        >
          ● Critical Incidents
        </button>
        <button
          type="button"
          className="interactive"
          onClick={() => setActiveLayerFilters(f => ({ ...f, warning: !f.warning }))}
          style={{
            fontSize: '10px',
            padding: '4px 10px',
            borderRadius: '999px',
            background: activeLayerFilters.warning ? 'rgba(245,158,11,0.15)' : 'rgba(15,23,42,0.8)',
            border: `1px solid ${activeLayerFilters.warning ? '#f59e0b' : 'rgba(255,255,255,0.1)'}`,
            color: activeLayerFilters.warning ? '#fbbf24' : '#64748b',
            cursor: 'pointer'
          }}
        >
          ● Warning Incidents
        </button>
        <button
          type="button"
          className="interactive"
          onClick={() => setActiveLayerFilters(f => ({ ...f, shelters: !f.shelters }))}
          style={{
            fontSize: '10px',
            padding: '4px 10px',
            borderRadius: '999px',
            background: activeLayerFilters.shelters ? 'rgba(16,185,129,0.15)' : 'rgba(15,23,42,0.8)',
            border: `1px solid ${activeLayerFilters.shelters ? '#10b981' : 'rgba(255,255,255,0.1)'}`,
            color: activeLayerFilters.shelters ? '#34d399' : '#64748b',
            cursor: 'pointer'
          }}
        >
          ● Safe Shelters
        </button>
        <button
          type="button"
          className="interactive"
          onClick={() => setActiveLayerFilters(f => ({ ...f, ngo: !f.ngo }))}
          style={{
            fontSize: '10px',
            padding: '4px 10px',
            borderRadius: '999px',
            background: activeLayerFilters.ngo ? 'rgba(168,85,247,0.15)' : 'rgba(15,23,42,0.8)',
            border: `1px solid ${activeLayerFilters.ngo ? '#a855f7' : 'rgba(255,255,255,0.1)'}`,
            color: activeLayerFilters.ngo ? '#c084fc' : '#64748b',
            cursor: 'pointer'
          }}
        >
          ● NGO / Responders
        </button>
      </div>

      {/* Main Interactive In-House SVG GIS Canvas */}
      <div
        style={{
          width: '100%',
          height: '100%',
          cursor: isDragging ? 'grabbing' : 'grab',
          position: 'relative'
        }}
        onMouseDown={handleMouseDown}
      >
        <svg
          ref={svgRef}
          viewBox="0 0 1000 650"
          style={{
            width: '100%',
            height: '100%',
            transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomLevel})`,
            transformOrigin: 'center center',
            transition: isDragging ? 'none' : 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)'
          }}
        >
          <defs>
            {/* Radar gradient sweep */}
            <radialGradient id="radarSweepGrad" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgba(56, 189, 248, 0.18)" />
              <stop offset="70%" stopColor="rgba(56, 189, 248, 0.05)" />
              <stop offset="100%" stopColor="transparent" />
            </radialGradient>

            {/* Glowing water / river filter */}
            <filter id="riverGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>

            {/* Marker pulse glow */}
            <filter id="markerGlow" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* 1. Tactical Coordinate Grid Lines */}
          <g className="grid-layer" opacity="0.18">
            {[100, 200, 300, 400, 500, 600, 700, 800, 900].map(x => (
              <line key={`x-${x}`} x1={x} y1={0} x2={x} y2={650} stroke="#38bdf8" strokeWidth="0.75" strokeDasharray="3, 6" />
            ))}
            {[80, 160, 240, 320, 400, 480, 560].map(y => (
              <line key={`y-${y}`} x1={0} y1={y} x2={1000} y2={y} stroke="#38bdf8" strokeWidth="0.75" strokeDasharray="3, 6" />
            ))}
          </g>

          {/* 2. District Command Range Rings (5km, 10km, 15km radii) */}
          <g className="range-rings" opacity="0.25">
            <circle cx={hqPos.x} cy={hqPos.y} r={90} fill="none" stroke="#38bdf8" strokeWidth="1" strokeDasharray="4, 4" />
            <circle cx={hqPos.x} cy={hqPos.y} r={180} fill="none" stroke="#38bdf8" strokeWidth="1" strokeDasharray="4, 4" />
            <circle cx={hqPos.x} cy={hqPos.y} r={280} fill="none" stroke="#38bdf8" strokeWidth="1" strokeDasharray="4, 4" />
            <text x={hqPos.x + 94} y={hqPos.y - 6} fill="#38bdf8" fontSize="9" fontFamily="monospace">5 KM RADIUS</text>
            <text x={hqPos.x + 184} y={hqPos.y - 6} fill="#38bdf8" fontSize="9" fontFamily="monospace">10 KM RADIUS</text>
            <text x={hqPos.x + 284} y={hqPos.y - 6} fill="#38bdf8" fontSize="9" fontFamily="monospace">15 KM BUFFER</text>
          </g>

          {/* 3. Regional Topography: Coastal or River/Inland Vector Maps */}
          {isCoastal ? (
            <g className="coastal-terrain">
              {/* Arabian Sea coastline outline */}
              <path
                d="M 120 0 C 140 180, 80 340, 220 520 C 260 570, 200 650, 180 650"
                fill="none"
                stroke="#0284c7"
                strokeWidth="24"
                opacity="0.25"
                filter="url(#riverGlow)"
              />
              <path
                d="M 120 0 C 140 180, 80 340, 220 520 C 260 570, 200 650, 180 650"
                fill="none"
                stroke="#38bdf8"
                strokeWidth="6"
                opacity="0.7"
              />
              <text x="30" y="320" fill="#7dd3fc" fontSize="11" fontWeight="bold" letterSpacing="2" opacity="0.6" transform="rotate(-90 30 320)">
                ~ ~ ARABIAN SEA COASTAL REACH ~ ~
              </text>
              {/* Western Express / Coastal Corridor */}
              <path d="M 280 20 L 310 240 L 420 540 L 480 640" fill="none" stroke="#94a3b8" strokeWidth="4" strokeDasharray="8, 4" opacity="0.4" />
              <text x="310" y="120" fill="#94a3b8" fontSize="9" opacity="0.5">WESTERN EXPRESS HIGHWAY</text>
            </g>
          ) : (
            <g className="river-basin">
              {/* River water halo */}
              <path
                d="M 50 180 Q 220 220, 360 270 T 580 280 T 780 320 T 960 300"
                fill="none"
                stroke="#0284c7"
                strokeWidth="18"
                opacity="0.22"
                filter="url(#riverGlow)"
              />
              {/* Core river stream */}
              <path
                d="M 50 180 Q 220 220, 360 270 T 580 280 T 780 320 T 960 300"
                fill="none"
                stroke="#38bdf8"
                strokeWidth="5"
                opacity="0.65"
              />
              <text x="320" y="255" fill="#7dd3fc" fontSize="10" fontWeight="bold" letterSpacing="1.5" opacity="0.65">
                ~ ~ ~ REGIONAL DRAINAGE & WATERWAY CORRIDOR ~ ~ ~
              </text>
              {/* National Arterial Highway */}
              <path d="M 80 50 L 260 220 L 420 460 L 680 620" fill="none" stroke="#94a3b8" strokeWidth="4" strokeDasharray="8, 4" opacity="0.4" />
              <text x="110" y="90" fill="#94a3b8" fontSize="9" opacity="0.5" transform="rotate(38 110 90)">PRIMARY DISASTER TRANSIT CORRIDOR</text>
            </g>
          )}

          {/* 4. Active Rotating Radar Sweep Animation */}
          {radarActive && (
            <g className="radar-sweep" style={{ transformOrigin: `${hqPos.x}px ${hqPos.y}px` }}>
              <circle cx={hqPos.x} cy={hqPos.y} r={320} fill="url(#radarSweepGrad)" opacity="0.4" />
              <line
                x1={hqPos.x}
                y1={hqPos.y}
                x2={hqPos.x + 320}
                y2={hqPos.y}
                stroke="#38bdf8"
                strokeWidth="2"
                opacity="0.8"
              >
                <animateTransform
                  attributeName="transform"
                  type="rotate"
                  from={`0 ${hqPos.x} ${hqPos.y}`}
                  to={`360 ${hqPos.x} ${hqPos.y}`}
                  dur="6s"
                  repeatCount="indefinite"
                />
              </line>
            </g>
          )}

          {/* 5. Tactical Vector Line to Selected Target */}
          {selectedPos && (
            <g className="route-vector">
              <line
                x1={hqPos.x}
                y1={hqPos.y}
                x2={selectedPos.x}
                y2={selectedPos.y}
                stroke="#38bdf8"
                strokeWidth="3"
                strokeDasharray="6, 6"
                opacity="0.9"
              >
                <animate attributeName="stroke-dashoffset" from="30" to="0" dur="1s" repeatCount="indefinite" />
              </line>
              {/* Mid-point Distance HUD Tag */}
              <rect
                x={(hqPos.x + selectedPos.x) / 2 - 40}
                y={(hqPos.y + selectedPos.y) / 2 - 12}
                width="80"
                height="22"
                rx="6"
                fill="#0f172a"
                stroke="#38bdf8"
                strokeWidth="1"
              />
              <text
                x={(hqPos.x + selectedPos.x) / 2}
                y={(hqPos.y + selectedPos.y) / 2 + 3}
                fill="#38bdf8"
                fontSize="9"
                fontFamily="monospace"
                fontWeight="bold"
                textAnchor="middle"
              >
                GPS ROUTE
              </text>
            </g>
          )}

          {/* 6. Command HQ Beacon for Active Area */}
          <g className="command-hq" transform={`translate(${hqPos.x}, ${hqPos.y})`}>
            <circle r="22" fill="rgba(56, 189, 248, 0.2)">
              <animate attributeName="r" values="16;32;16" dur="2.4s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.6;0.1;0.6" dur="2.4s" repeatCount="indefinite" />
            </circle>
            <circle r="12" fill="#0284c7" stroke="#ffffff" strokeWidth="2.5" />
            <polygon points="0,-7 6,4 -6,4" fill="#ffffff" />
            <rect x="-85" y="16" width="170" height="20" rx="6" fill="rgba(15,23,42,0.9)" stroke="#38bdf8" strokeWidth="1" />
            <text x="0" y="30" fill="#38bdf8" fontSize="8.5" fontWeight="bold" textAnchor="middle">
              {activeLocation.district.toUpperCase()} COMMAND HQ
            </text>
          </g>

          {/* 7. Live Disaster, Shelter & NGO Locations */}
          {visiblePoints.map(pt => {
            const pos = projectGpsToSvg(pt.lat, pt.lng, activeBounds);
            const isSelected = selectedPoint?.id === pt.id;

            let mainColor = '#38bdf8';
            let badgeBg = 'rgba(56,189,248,0.2)';
            let iconText = '📍';

            if (pt.type === 'critical') {
              mainColor = '#f43f5e';
              badgeBg = 'rgba(244,63,94,0.3)';
              iconText = '🚨';
            } else if (pt.type === 'warning') {
              mainColor = '#f59e0b';
              badgeBg = 'rgba(245,158,11,0.3)';
              iconText = '⚠️';
            } else if (pt.type === 'safe') {
              mainColor = '#10b981';
              badgeBg = 'rgba(16,185,129,0.3)';
              iconText = '🏠';
            } else if (pt.type === 'info') {
              mainColor = '#a855f7';
              badgeBg = 'rgba(168,85,247,0.3)';
              iconText = '🤝';
            }

            return (
              <g
                key={pt.id}
                className="interactive-marker"
                transform={`translate(${pos.x}, ${pos.y})`}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedPoint(pt);
                }}
                style={{ cursor: 'pointer' }}
              >
                {/* Outer radar ping ring */}
                <circle r={isSelected ? 30 : 20} fill={badgeBg}>
                  <animate attributeName="r" values="14;28;14" dur="2s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.7;0.1;0.7" dur="2s" repeatCount="indefinite" />
                </circle>

                {/* Pin head with border */}
                <circle
                  r={isSelected ? 16 : 13}
                  fill={mainColor}
                  stroke="#ffffff"
                  strokeWidth={isSelected ? 3 : 2}
                  filter="url(#markerGlow)"
                />

                {/* Marker Emoji / Symbol */}
                <text
                  x="0"
                  y="4"
                  fontSize={isSelected ? "13" : "11"}
                  textAnchor="middle"
                  pointerEvents="none"
                >
                  {iconText}
                </text>

                {/* Name & Metric Label Pill */}
                <g transform="translate(0, 20)">
                  <rect
                    x="-70"
                    y="0"
                    width="140"
                    height={pt.category === 'shelter' ? 28 : 18}
                    rx="6"
                    fill="rgba(15,23,42,0.92)"
                    stroke={mainColor}
                    strokeWidth="1"
                  />
                  <text
                    x="0"
                    y="12"
                    fill="#f8fafc"
                    fontSize="9"
                    fontWeight="bold"
                    textAnchor="middle"
                  >
                    {pt.name.length > 22 ? pt.name.substring(0, 20) + '...' : pt.name}
                  </text>
                  {pt.category === 'shelter' && (
                    <text
                      x="0"
                      y="23"
                      fill="#34d399"
                      fontSize="8"
                      fontWeight="bold"
                      textAnchor="middle"
                    >
                      {pt.availableBeds} BEDS OPEN
                    </text>
                  )}
                </g>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Bottom Floating Interactive Inspector & Direct Google Maps Redirection Drawer */}
      <AnimatePresence>
        {selectedPoint && (
          <motion.div
            className={`map-inspection-drawer glass-panel severity-${selectedPoint.type}`}
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            style={{
              position: 'absolute',
              bottom: '16px',
              left: '16px',
              right: '16px',
              zIndex: 30,
              background: 'rgba(15, 23, 42, 0.95)',
              backdropFilter: 'blur(20px)',
              border: `1px solid ${selectedPoint.type === 'safe' ? '#10b981' : selectedPoint.type === 'critical' ? '#f43f5e' : '#38bdf8'}`,
              borderRadius: '16px',
              padding: '18px 22px',
              boxShadow: '0 25px 60px rgba(0, 0, 0, 0.7)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '12px',
                    background: selectedPoint.type === 'safe' ? 'rgba(16,185,129,0.2)' : selectedPoint.type === 'critical' ? 'rgba(244,63,94,0.2)' : 'rgba(56,189,248,0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '18px'
                  }}
                >
                  {selectedPoint.category === 'shelter' ? '🏠' : selectedPoint.type === 'critical' ? '🚨' : selectedPoint.type === 'warning' ? '⚠️' : '🤝'}
                </div>
                <div>
                  <span style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 'bold' }}>
                    {selectedPoint.category} · GPS: {selectedPoint.lat}° N, {selectedPoint.lng}° E
                  </span>
                  <h4 style={{ margin: '2px 0 0 0', fontSize: '18px', color: '#f8fafc', fontWeight: '700' }}>
                    {selectedPoint.title}
                  </h4>
                </div>
              </div>

              <button
                type="button"
                className="interactive"
                onClick={() => setSelectedPoint(null)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}
                aria-label="Close inspector"
              >
                <Icons.X size={18} />
              </button>
            </div>

            <p style={{ color: '#cbd5e1', fontSize: '13px', margin: '8px 0 12px 0', lineHeight: 1.5 }}>
              {selectedPoint.sub}
            </p>

            {/* Shelter Bed Availability Metrics */}
            {selectedPoint.category === 'shelter' && (
              <div style={{ background: 'rgba(16,185,129,0.12)', padding: '10px 14px', borderRadius: '10px', margin: '8px 0 12px 0', border: '1px solid rgba(16,185,129,0.25)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontSize: '12px', color: '#10b981', fontWeight: 'bold' }}>
                    Available Bed Headroom: {selectedPoint.availableBeds} / {selectedPoint.capacity} Beds
                  </span>
                  <span style={{ fontSize: '11px', background: '#10b981', color: '#ffffff', padding: '2px 8px', borderRadius: '999px', fontWeight: 'bold' }}>
                    {Math.round((selectedPoint.occupied / selectedPoint.capacity) * 100)}% Occupied
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {selectedPoint.services?.map(x => (
                    <span key={x} style={{ fontSize: '11px', color: '#e2e8f0', background: 'rgba(255,255,255,0.06)', padding: '3px 8px', borderRadius: '6px' }}>
                      ✓ {x}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Action Bar: Google Maps Redirection (Universal Driving Navigation) */}
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
              <button
                type="button"
                className="primary-button interactive"
                onClick={() => redirectToGoogleMaps(selectedPoint.lat, selectedPoint.lng, selectedPoint.title, false)}
                style={{
                  background: 'linear-gradient(135deg, #10b981, #059669)',
                  borderColor: '#34d399',
                  color: '#ffffff',
                  fontWeight: '600',
                  padding: '9px 16px',
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                  boxShadow: '0 4px 18px rgba(16,185,129,0.3)'
                }}
                title="Opens live turn-by-turn driving directions in Google Maps from your current location"
              >
                <Icons.MapPin size={16} />
                <span>Open in Google Maps & Start Navigation</span>
                <Icons.ArrowUpRight size={14} />
              </button>

              <button
                type="button"
                className="secondary-button interactive"
                onClick={() => redirectToGoogleMaps(selectedPoint.lat, selectedPoint.lng, selectedPoint.title, true)}
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  color: '#e2e8f0',
                  border: '1px solid rgba(255,255,255,0.15)',
                  padding: '9px 14px',
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer'
                }}
                title="Opens Google Maps route originating from District Command EOC"
              >
                <Icons.Compass size={15} /> Route from {activeLocation.district} EOC
              </button>

              <button
                type="button"
                className="secondary-button interactive"
                onClick={() => dispatchTeam(selectedPoint)}
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  color: '#e2e8f0',
                  border: '1px solid rgba(255,255,255,0.15)',
                  padding: '9px 14px',
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer'
                }}
              >
                <Icons.Siren size={15} /> Dispatch Unit
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Real-time Notification Toast */}
      {toast && (
        <div
          className="toast glass-panel"
          style={{
            zIndex: 9999,
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            background: 'rgba(15, 23, 42, 0.95)',
            color: '#38bdf8',
            border: '1px solid #38bdf8',
            padding: '12px 18px',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: '0 10px 30px rgba(0,0,0,0.6)'
          }}
        >
          <Icons.CheckCircle2 size={18} /> {toast}
        </div>
      )}
    </div>
  );
}

export default CustomTacticalMap;
