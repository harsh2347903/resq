import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as Icons from 'lucide-react';
import { api } from '../lib/apiClient';
import { useLocation } from '../context/LocationContext';
import {
  getTalukasForDistrict,
  getCitiesForDistrict,
  getDistrictCenter,
  getDistrictBounds,
  getAllLocationsForDistrict
} from '../lib/indiaGeoData';
import { LocationSwitcherBadge } from './LocationSwitcherModal';

// Canvas Coordinate Mapping: Converts real GPS (lat, lng) to SVG (x, y) coordinates based on dynamic bounds
function projectGpsToSvg(lat, lng, bounds, width = 1000, height = 650) {
  const spanLng = bounds.maxLng - bounds.minLng || 0.1;
  const spanLat = bounds.maxLat - bounds.minLat || 0.1;
  const x = ((lng - bounds.minLng) / spanLng) * width;
  // Latitude is inverted on screen (higher lat = further north = smaller y)
  const y = ((bounds.maxLat - lat) / spanLat) * height;
  return {
    x: Math.max(35, Math.min(width - 35, x)),
    y: Math.max(45, Math.min(height - 45, y))
  };
}

// Convert SVG (x, y) back to GPS coordinate for HUD telemetry
function projectSvgToGps(x, y, bounds, width = 1000, height = 650) {
  const lng = bounds.minLng + (x / width) * (bounds.maxLng - bounds.minLng);
  const lat = bounds.maxLat - (y / height) * (bounds.maxLat - bounds.minLat);
  return { lat: Number(lat.toFixed(4)), lng: Number(lng.toFixed(4)) };
}

// Haversine distance calculator in kilometers
function calculateHaversineKm(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

export function CustomTacticalMap({ layers = { incidents: true, shelters: true, ngo: true, responders: true } }) {
  const { activeLocation, switchLocation } = useLocation();
  const svgRef = useRef(null);

  const [selectedPoint, setSelectedPoint] = useState(null);
  const [activeSector, setActiveSector] = useState('all');
  const [cursorCoords, setCursorCoords] = useState('');
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
    ngo: true,
    localities: true
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

  // Compute active district's bounding box encompassing all city areas
  const activeBounds = useMemo(() => {
    return getDistrictBounds(activeLocation.state, activeLocation.district);
  }, [activeLocation.state, activeLocation.district]);

  // Compute active center coordinates
  const currentCenter = useMemo(() => {
    if (activeLocation?.coordinates?.lat && activeLocation?.coordinates?.lng) {
      return activeLocation.coordinates;
    }
    const fallback = getDistrictCenter(activeLocation.state, activeLocation.district);
    return { lat: fallback.lat, lng: fallback.lng };
  }, [activeLocation]);

  // All distinct localities and areas in the active district
  const districtLocations = useMemo(() => {
    return getAllLocationsForDistrict(activeLocation.state, activeLocation.district);
  }, [activeLocation.state, activeLocation.district]);

  // Command EOC HQ for the active sector
  const activeHq = useMemo(() => {
    return {
      lat: currentCenter.lat,
      lng: currentCenter.lng,
      title: `${activeLocation.district} Incident Command EOC (${activeLocation.taluka || 'Central'})`,
      sector: activeLocation.taluka || activeLocation.district
    };
  }, [currentCenter, activeLocation]);

  // Master List of Plotted Locations: Locality stations + Incidents + Shelters + NGOs
  const allLocations = useMemo(() => {
    // 1. Every location/area in the selected district is represented
    const localityNodes = districtLocations.map((loc, idx) => {
      const lat = loc.coordinates?.lat || (currentCenter.lat + ((idx % 5) - 2) * 0.025);
      const lng = loc.coordinates?.lng || (currentCenter.lng + (Math.floor(idx / 5) - 1) * 0.025);
      return {
        id: `loc-${loc.city.replace(/[^a-zA-Z0-9]/g, '-')}`,
        category: 'locality',
        type: 'locality',
        name: loc.city,
        title: `${loc.city} (${loc.taluka || 'Sector'})`,
        district: activeLocation.district,
        taluka: loc.taluka || activeLocation.district,
        city: loc.city,
        pincode: loc.pincode || '',
        sub: `Sector Operations Base · PIN ${loc.pincode || 'Active'} · Quick Response Hub`,
        lat,
        lng,
        team: `${loc.city} Disaster Cell & Civil Defense`,
        services: ['Local Command Post', 'Shelter Access Hub', 'Field Triage Base']
      };
    });

    // 2. Incidents (filter to district or nearby)
    const incs = (incidentsList.length ? incidentsList : [
      { id: 'INC-077', type: 'Flood', district: 'Pune', taluka: 'Haveli', location: 'Pune • Mula-Mutha basin', coordinates: { lat: 18.5312, lng: 73.8553 }, severity: 'Critical', affected: '2,482', details: 'Water surge +3.8m above danger mark.' },
      { id: 'INC-076', type: 'Landslide', district: 'Pune', taluka: 'Maval', location: 'Lonavala • Old Mumbai Rd', coordinates: { lat: 18.7546, lng: 73.4062 }, severity: 'High', affected: '218', details: 'Debris blocking transit corridor.' },
      { id: 'INC-080', type: 'Coastal Surge', district: 'Mumbai City', taluka: 'Worli', location: 'Worli Seaface • Marine Inundation', coordinates: { lat: 19.0166, lng: 72.8169 }, severity: 'Critical', affected: '3,120', details: 'High tide seawater breach over embankment.' },
      { id: 'INC-081', type: 'Waterlogging', district: 'Mumbai Suburban', taluka: 'Kurla', location: 'Kurla • Mithi River Overflow', coordinates: { lat: 19.0726, lng: 72.8845 }, severity: 'High', affected: '1,450', details: 'Rail subway flooding; rescue boats deployed.' },
      { id: 'INC-075', type: 'Fire', district: 'Nashik', taluka: 'Nashik', location: 'Nashik • MIDC Industrial Zone', coordinates: { lat: 19.9975, lng: 73.7898 }, severity: 'High', affected: '624', details: 'Chemical storage vapor flare containment.' },
      { id: 'INC-074', type: 'Heatwave', district: 'Nagpur', taluka: 'Nagpur Urban', location: 'Nagpur • Central zone', coordinates: { lat: 21.1458, lng: 79.0882 }, severity: 'Medium', affected: '5,870', details: 'Severe thermal warning.' },
      { id: 'INC-079', type: 'Landslide', district: 'Satara', taluka: 'Wai', location: 'Wai-Pasarni Ghat Corridor', coordinates: { lat: 17.9480, lng: 73.8920 }, severity: 'Critical', affected: '340', details: 'Hillside rockfall blocking access.' }
    ]).filter(i => (i.district || '').toLowerCase() === (activeLocation.district || '').toLowerCase()).map(i => ({
      id: i.id || `inc-${Math.random()}`,
      category: 'incident',
      type: (i.severity?.toLowerCase() === 'critical' ? 'critical' : 'warning'),
      name: `${i.type} (${i.severity})`,
      title: `${i.type} at ${i.location}`,
      sub: i.details || `Impact zone: ${i.affected || 'Multiple'} citizens affected`,
      district: i.district || activeLocation.district,
      taluka: i.taluka || '',
      lat: i.coordinates?.lat ?? currentCenter.lat,
      lng: i.coordinates?.lng ?? currentCenter.lng,
      severity: i.severity || 'Critical',
      affected: i.affected || '200+',
      team: 'NDRF Battalion & Civil Defense'
    }));

    // 3. Shelters
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
    ]).filter(s => (s.district || '').toLowerCase() === (activeLocation.district || '').toLowerCase()).map(s => ({
      id: `she-${s.id}`,
      category: 'shelter',
      type: 'safe',
      name: s.name,
      title: s.name,
      district: s.district || activeLocation.district,
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

    // 4. NGOs
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
    ].filter(n => (n.district || '').toLowerCase() === (activeLocation.district || '').toLowerCase());

    return [...localityNodes, ...incs, ...shels, ...ngos];
  }, [districtLocations, incidentsList, sheltersList, activeLocation, currentCenter]);

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
      if (pt.type === 'locality' && !activeLayerFilters.localities) return false;

      return true;
    });
  }, [allLocations, layers, activeLayerFilters]);

  // Master Navigator: Centering, smooth panning, and zooming to ANY location in the selected city
  const navigateToLocation = useCallback((targetLoc) => {
    if (!targetLoc) {
      setZoomLevel(1);
      setPanOffset({ x: 0, y: 0 });
      setSelectedPoint(null);
      setActiveSector('all');
      return;
    }

    let point = null;
    if (typeof targetLoc === 'string') {
      point = allLocations.find(p =>
        p.name?.toLowerCase() === targetLoc.toLowerCase() ||
        p.city?.toLowerCase() === targetLoc.toLowerCase() ||
        p.title?.toLowerCase() === targetLoc.toLowerCase()
      ) || districtLocations.find(d => d.city?.toLowerCase() === targetLoc.toLowerCase());
    } else {
      point = targetLoc;
    }

    if (!point) return;

    const lat = point.lat ?? point.coordinates?.lat;
    const lng = point.lng ?? point.coordinates?.lng;

    if (typeof lat === 'number' && typeof lng === 'number') {
      const pos = projectGpsToSvg(lat, lng, activeBounds);
      // Center canvas directly on this point
      setZoomLevel(1.85);
      setPanOffset({
        x: (500 - pos.x) * 1.85,
        y: (325 - pos.y) * 1.85
      });

      const dist = calculateHaversineKm(currentCenter.lat, currentCenter.lng, lat, lng);
      const dynamicEta = dist > 0 ? `${Math.max(3, Math.round(dist * 2.2))} min drive` : 'Immediate sector';

      const normalized = {
        id: point.id || `loc-${point.city || point.name}`,
        category: point.category || 'locality',
        type: point.type || 'locality',
        name: point.name || point.city,
        title: point.title || `${point.city || point.name} (${point.taluka || 'Sector'})`,
        district: point.district || activeLocation.district,
        taluka: point.taluka || '',
        city: point.city || point.name,
        pincode: point.pincode || '',
        sub: point.sub || `Sector Station · PIN ${point.pincode || 'Active'} · ${dist > 0 ? `${dist} km away · ${dynamicEta}` : 'EOC Center'}`,
        lat,
        lng,
        distanceKm: dist,
        eta: dynamicEta,
        team: point.team || `${activeLocation.district} Civil Defense Unit`,
        services: point.services || ['Command Post', 'Relief Staging Base', 'Evacuation Staging']
      };

      setSelectedPoint(normalized);
      setActiveSector(point.taluka || point.name);
      setCursorCoords(`${lat.toFixed(4)}° N, ${lng.toFixed(4)}° E`);
      setToast(`📍 Focused on ${normalized.name} (${normalized.taluka || activeLocation.district})`);
      setTimeout(() => setToast(''), 3000);
    }
  }, [allLocations, districtLocations, activeBounds, currentCenter, activeLocation]);

  // When active location changes, reset and navigate to the selected city if specified
  useEffect(() => {
    setCursorCoords(`${currentCenter.lat.toFixed(4)}° N, ${currentCenter.lng.toFixed(4)}° E`);
    if (activeLocation.city && activeLocation.city !== activeLocation.district) {
      navigateToLocation(activeLocation.city);
    } else {
      setZoomLevel(1);
      setPanOffset({ x: 0, y: 0 });
      setActiveSector('all');
      setSelectedPoint(null);
    }
  }, [activeLocation.district, activeLocation.city]);

  // Google Maps Deep-Link Redirection
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

  // Mouse / Touch Drag Navigation
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

  // Projected SVG coordinates
  const hqPos = projectGpsToSvg(activeHq.lat, activeHq.lng, activeBounds);
  const selectedPos = selectedPoint ? projectGpsToSvg(selectedPoint.lat, selectedPoint.lng, activeBounds) : null;

  // Regional terrain style
  const isCoastal = (activeLocation.district || '').toLowerCase().includes('mumbai') ||
                    (activeLocation.district || '').toLowerCase().includes('thane') ||
                    (activeLocation.district || '').toLowerCase().includes('raigad');

  return (
    <div
      className="ops-map tactical-nav-map"
      style={{
        height: '620px',
        position: 'relative',
        overflow: 'hidden',
        borderRadius: '20px',
        background: 'radial-gradient(ellipse at 50% 50%, #0c1a27 0%, #060e15 100%)',
        border: '1px solid rgba(56, 189, 248, 0.25)',
        boxShadow: '0 24px 60px rgba(0, 0, 0, 0.75)',
        userSelect: 'none'
      }}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* 1. Tactical Top Command Toolbar */}
      <div
        className="map-toolbar tactical-map-toolbar"
        style={{
          zIndex: 25,
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          padding: '10px 16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '8px',
          background: 'linear-gradient(180deg, rgba(6,14,21,0.96) 0%, rgba(6,14,21,0.85) 90%, transparent 100%)',
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid rgba(56, 189, 248, 0.2)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
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
                {cursorCoords || `${currentCenter.lat.toFixed(4)}° N, ${currentCenter.lng.toFixed(4)}° E`}
              </span>
              <span style={{ fontSize: '9px', background: 'rgba(56,189,248,0.15)', color: '#7dd3fc', padding: '1px 6px', borderRadius: '4px', border: '1px solid rgba(56,189,248,0.3)' }}>
                {districtLocations.length} SECTOR LOCATIONS MAPPED
              </span>
            </div>
          </div>
        </div>

        {/* City Location Navigator Dropdown: Instant jump to ANY location in this city */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(56,189,248,0.35)', borderRadius: '8px', padding: '4px 10px' }}>
            <Icons.Navigation size={13} style={{ color: '#38bdf8' }} />
            <select
              className="interactive"
              value={selectedPoint?.name || selectedPoint?.city || ''}
              onChange={(e) => navigateToLocation(e.target.value)}
              style={{
                background: 'transparent',
                color: '#f8fafc',
                border: 'none',
                fontSize: '11px',
                fontWeight: '600',
                cursor: 'pointer',
                outline: 'none',
                maxWidth: '220px'
              }}
              title="Navigate directly to any locality or taluka of the selected city"
            >
              <option value="" style={{ background: '#091924', color: '#94a3b8' }}>
                🎯 Jump to Location ({districtLocations.length} in {activeLocation.district})...
              </option>
              {districtLocations.map(loc => (
                <option key={loc.city} value={loc.city} style={{ background: '#091924', color: '#f8fafc' }}>
                  {loc.city} • {loc.taluka} {loc.pincode ? `(${loc.pincode})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Zoom & Reset Controls */}
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            <button
              type="button"
              className="interactive"
              onClick={() => setRadarActive(r => !r)}
              title="Toggle Radar Sweep"
              style={{
                background: radarActive ? 'rgba(16,185,129,0.2)' : 'rgba(15,23,42,0.6)',
                color: radarActive ? '#10b981' : '#94a3b8',
                border: '1px solid rgba(255,255,255,0.1)',
                padding: '5px 8px',
                borderRadius: '8px',
                fontSize: '11px',
                cursor: 'pointer'
              }}
            >
              <Icons.Radar size={13} />
            </button>
            <button
              type="button"
              className="interactive"
              onClick={() => setZoomLevel(z => Math.min(3.0, z + 0.3))}
              title="Zoom In"
              style={{ background: 'rgba(15,23,42,0.6)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', padding: '5px 9px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}
            >
              +
            </button>
            <button
              type="button"
              className="interactive"
              onClick={() => setZoomLevel(z => Math.max(0.75, z - 0.3))}
              title="Zoom Out"
              style={{ background: 'rgba(15,23,42,0.6)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', padding: '5px 9px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}
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
              title="Reset to Full City Overview"
              style={{ background: 'rgba(15,23,42,0.6)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', padding: '5px 9px', borderRadius: '8px', cursor: 'pointer' }}
            >
              <Icons.RotateCcw size={13} />
            </button>
          </div>
        </div>
      </div>

      {/* 2. Scrollable Quick-Nav Pill Strip for EVERY Location in Selected City */}
      <div
        className="city-locations-nav-strip"
        style={{
          position: 'absolute',
          top: '56px',
          left: '14px',
          right: '14px',
          zIndex: 22,
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          overflowX: 'auto',
          paddingBottom: '6px',
          scrollbarWidth: 'none'
        }}
      >
        <button
          type="button"
          className={`interactive ${!selectedPoint ? 'active' : ''}`}
          onClick={() => {
            setZoomLevel(1);
            setPanOffset({ x: 0, y: 0 });
            setSelectedPoint(null);
            setActiveSector('all');
          }}
          style={{
            flexShrink: 0,
            fontSize: '11px',
            fontWeight: '600',
            padding: '4px 10px',
            borderRadius: '999px',
            background: !selectedPoint ? 'rgba(56,189,248,0.25)' : 'rgba(15,23,42,0.85)',
            color: !selectedPoint ? '#38bdf8' : '#94a3b8',
            border: `1px solid ${!selectedPoint ? '#38bdf8' : 'rgba(255,255,255,0.1)'}`,
            cursor: 'pointer',
            backdropFilter: 'blur(8px)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px'
          }}
        >
          <Icons.Globe size={11} /> All {activeLocation.district} ({districtLocations.length})
        </button>

        {districtLocations.map(loc => {
          const isSelected = selectedPoint?.name === loc.city || selectedPoint?.city === loc.city;
          return (
            <button
              type="button"
              key={loc.city}
              className={`interactive ${isSelected ? 'active' : ''}`}
              onClick={() => navigateToLocation(loc.city)}
              style={{
                flexShrink: 0,
                fontSize: '11px',
                fontWeight: isSelected ? '700' : '500',
                padding: '4px 11px',
                borderRadius: '999px',
                background: isSelected ? 'rgba(16,185,129,0.3)' : 'rgba(15,23,42,0.85)',
                color: isSelected ? '#34d399' : '#cbd5e1',
                border: `1px solid ${isSelected ? '#10b981' : 'rgba(255,255,255,0.1)'}`,
                cursor: 'pointer',
                backdropFilter: 'blur(8px)',
                boxShadow: isSelected ? '0 0 14px rgba(16,185,129,0.45)' : 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <span>📍</span>
              <b>{loc.city}</b>
              {loc.taluka && loc.taluka !== loc.city && (
                <small style={{ color: isSelected ? '#a7f3d0' : '#94a3b8', fontSize: '9.5px' }}>
                  ({loc.taluka})
                </small>
              )}
            </button>
          );
        })}
      </div>

      {/* 3. Layer Filter Sub-Bar */}
      <div style={{ position: 'absolute', top: '96px', left: '16px', zIndex: 20, display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        <button
          type="button"
          className="interactive"
          onClick={() => setActiveLayerFilters(f => ({ ...f, localities: !f.localities }))}
          style={{
            fontSize: '9.5px',
            padding: '3px 8px',
            borderRadius: '999px',
            background: activeLayerFilters.localities ? 'rgba(6,182,212,0.2)' : 'rgba(15,23,42,0.8)',
            border: `1px solid ${activeLayerFilters.localities ? '#06b6d4' : 'rgba(255,255,255,0.1)'}`,
            color: activeLayerFilters.localities ? '#67e8f9' : '#64748b',
            cursor: 'pointer'
          }}
        >
          🎯 City Localities ({districtLocations.length})
        </button>
        <button
          type="button"
          className="interactive"
          onClick={() => setActiveLayerFilters(f => ({ ...f, critical: !f.critical }))}
          style={{
            fontSize: '9.5px',
            padding: '3px 8px',
            borderRadius: '999px',
            background: activeLayerFilters.critical ? 'rgba(244,63,94,0.2)' : 'rgba(15,23,42,0.8)',
            border: `1px solid ${activeLayerFilters.critical ? '#f43f5e' : 'rgba(255,255,255,0.1)'}`,
            color: activeLayerFilters.critical ? '#ff7070' : '#64748b',
            cursor: 'pointer'
          }}
        >
          🚨 Critical Hazards
        </button>
        <button
          type="button"
          className="interactive"
          onClick={() => setActiveLayerFilters(f => ({ ...f, shelters: !f.shelters }))}
          style={{
            fontSize: '9.5px',
            padding: '3px 8px',
            borderRadius: '999px',
            background: activeLayerFilters.shelters ? 'rgba(16,185,129,0.2)' : 'rgba(15,23,42,0.8)',
            border: `1px solid ${activeLayerFilters.shelters ? '#10b981' : 'rgba(255,255,255,0.1)'}`,
            color: activeLayerFilters.shelters ? '#34d399' : '#64748b',
            cursor: 'pointer'
          }}
        >
          🏠 Safe Shelters
        </button>
        <button
          type="button"
          className="interactive"
          onClick={() => setActiveLayerFilters(f => ({ ...f, ngo: !f.ngo }))}
          style={{
            fontSize: '9.5px',
            padding: '3px 8px',
            borderRadius: '999px',
            background: activeLayerFilters.ngo ? 'rgba(168,85,247,0.2)' : 'rgba(15,23,42,0.8)',
            border: `1px solid ${activeLayerFilters.ngo ? '#a855f7' : 'rgba(255,255,255,0.1)'}`,
            color: activeLayerFilters.ngo ? '#c084fc' : '#64748b',
            cursor: 'pointer'
          }}
        >
          🤝 NGOs & Rescue
        </button>
      </div>

      {/* 4. Main Interactive SVG Vector Canvas */}
      <div
        style={{
          width: '100%',
          height: '100%',
          cursor: isDragging ? 'grabbing' : 'grab',
          position: 'relative',
          paddingTop: '60px'
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
            <radialGradient id="radarSweepGrad" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgba(56, 189, 248, 0.18)" />
              <stop offset="70%" stopColor="rgba(56, 189, 248, 0.05)" />
              <stop offset="100%" stopColor="transparent" />
            </radialGradient>

            <filter id="riverGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>

            <filter id="markerGlow" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Grid Lines */}
          <g className="grid-layer" opacity="0.16">
            {[100, 200, 300, 400, 500, 600, 700, 800, 900].map(x => (
              <line key={`x-${x}`} x1={x} y1={0} x2={x} y2={650} stroke="#38bdf8" strokeWidth="0.75" strokeDasharray="3, 6" />
            ))}
            {[80, 160, 240, 320, 400, 480, 560].map(y => (
              <line key={`y-${y}`} x1={0} y1={y} x2={1000} y2={y} stroke="#38bdf8" strokeWidth="0.75" strokeDasharray="3, 6" />
            ))}
          </g>

          {/* Regional Topography: Coast or River */}
          {isCoastal ? (
            <g className="coastal-terrain">
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
                ~ ~ COASTAL DISASTER SECTOR ~ ~
              </text>
            </g>
          ) : (
            <g className="river-basin">
              <path
                d="M 50 180 Q 220 220, 360 270 T 580 280 T 780 320 T 960 300"
                fill="none"
                stroke="#0284c7"
                strokeWidth="18"
                opacity="0.22"
                filter="url(#riverGlow)"
              />
              <path
                d="M 50 180 Q 220 220, 360 270 T 580 280 T 780 320 T 960 300"
                fill="none"
                stroke="#38bdf8"
                strokeWidth="5"
                opacity="0.65"
              />
              <text x="320" y="255" fill="#7dd3fc" fontSize="10" fontWeight="bold" letterSpacing="1.5" opacity="0.65">
                ~ ~ REGIONAL DRAINAGE & WATERWAY CORRIDOR ~ ~
              </text>
            </g>
          )}

          {/* Radar Sweep */}
          {radarActive && (
            <g className="radar-sweep" style={{ transformOrigin: `${hqPos.x}px ${hqPos.y}px` }}>
              <circle cx={hqPos.x} cy={hqPos.y} r={340} fill="url(#radarSweepGrad)" opacity="0.4" />
              <line
                x1={hqPos.x}
                y1={hqPos.y}
                x2={hqPos.x + 340}
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

          {/* Vector Navigation Line to Selected Location Target */}
          {selectedPos && (
            <g className="route-vector">
              <line
                x1={hqPos.x}
                y1={hqPos.y}
                x2={selectedPos.x}
                y2={selectedPos.y}
                stroke="#10b981"
                strokeWidth="3"
                strokeDasharray="6, 6"
                opacity="0.9"
              >
                <animate attributeName="stroke-dashoffset" from="30" to="0" dur="1s" repeatCount="indefinite" />
              </line>
              {/* Midpoint route distance chip */}
              <rect
                x={(hqPos.x + selectedPos.x) / 2 - 45}
                y={(hqPos.y + selectedPos.y) / 2 - 12}
                width="90"
                height="22"
                rx="6"
                fill="#0f172a"
                stroke="#10b981"
                strokeWidth="1"
              />
              <text
                x={(hqPos.x + selectedPos.x) / 2}
                y={(hqPos.y + selectedPos.y) / 2 + 3}
                fill="#34d399"
                fontSize="9"
                fontFamily="monospace"
                fontWeight="bold"
                textAnchor="middle"
              >
                {selectedPoint.distanceKm !== undefined ? `${selectedPoint.distanceKm} KM` : 'GPS ROUTE'}
              </text>
            </g>
          )}

          {/* District Incident Command EOC HQ Point */}
          <g className="command-hq" transform={`translate(${hqPos.x}, ${hqPos.y})`}>
            <circle r="22" fill="rgba(56, 189, 248, 0.2)">
              <animate attributeName="r" values="16;32;16" dur="2.4s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.6;0.1;0.6" dur="2.4s" repeatCount="indefinite" />
            </circle>
            <circle r="12" fill="#0284c7" stroke="#ffffff" strokeWidth="2.5" />
            <polygon points="0,-7 6,4 -6,4" fill="#ffffff" />
            <rect x="-85" y="16" width="170" height="20" rx="6" fill="rgba(15,23,42,0.92)" stroke="#38bdf8" strokeWidth="1" />
            <text x="0" y="30" fill="#38bdf8" fontSize="8.5" fontWeight="bold" textAnchor="middle">
              {activeLocation.district.toUpperCase()} COMMAND EOC
            </text>
          </g>

          {/* All Interactive City Locations, Shelters, Incidents & NGOs */}
          {visiblePoints.map(pt => {
            const pos = projectGpsToSvg(pt.lat, pt.lng, activeBounds);
            const isSelected = selectedPoint?.id === pt.id || selectedPoint?.name === pt.name;

            let mainColor = '#06b6d4';
            let badgeBg = 'rgba(6,182,212,0.25)';
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
            } else if (pt.type === 'locality') {
              mainColor = isSelected ? '#10b981' : '#38bdf8';
              badgeBg = isSelected ? 'rgba(16,185,129,0.3)' : 'rgba(56,189,248,0.2)';
              iconText = '🎯';
            }

            return (
              <g
                key={pt.id}
                className="interactive-marker"
                transform={`translate(${pos.x}, ${pos.y})`}
                onClick={(e) => {
                  e.stopPropagation();
                  navigateToLocation(pt);
                }}
                style={{ cursor: 'pointer' }}
              >
                {/* Targeting Reticle around selected location */}
                {isSelected && (
                  <g className="targeting-reticle">
                    <circle r="34" fill="none" stroke={mainColor} strokeWidth="1.5" strokeDasharray="5, 3">
                      <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="8s" repeatCount="indefinite" />
                    </circle>
                    <line x1="-40" y1="0" x2="-26" y2="0" stroke={mainColor} strokeWidth="2" />
                    <line x1="26" y1="0" x2="40" y2="0" stroke={mainColor} strokeWidth="2" />
                    <line x1="0" y1="-40" x2="0" y2="-26" stroke={mainColor} strokeWidth="2" />
                    <line x1="0" y1="26" x2="0" y2="40" stroke={mainColor} strokeWidth="2" />
                  </g>
                )}

                {/* Radar Ping */}
                <circle r={isSelected ? 26 : 18} fill={badgeBg}>
                  <animate attributeName="r" values="14;28;14" dur="2.2s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.7;0.1;0.7" dur="2.2s" repeatCount="indefinite" />
                </circle>

                {/* Pin Circle */}
                <circle
                  r={isSelected ? 15 : 12}
                  fill={mainColor}
                  stroke="#ffffff"
                  strokeWidth={isSelected ? 2.5 : 1.5}
                  filter="url(#markerGlow)"
                />

                {/* Pin Icon */}
                <text
                  x="0"
                  y="4"
                  fontSize={isSelected ? "12" : "10"}
                  textAnchor="middle"
                  pointerEvents="none"
                >
                  {iconText}
                </text>

                {/* Label Box */}
                <g transform="translate(0, 18)">
                  <rect
                    x="-65"
                    y="0"
                    width="130"
                    height={pt.category === 'shelter' ? 26 : 17}
                    rx="5"
                    fill="rgba(15,23,42,0.92)"
                    stroke={isSelected ? '#10b981' : mainColor}
                    strokeWidth={isSelected ? 1.5 : 1}
                  />
                  <text
                    x="0"
                    y="11"
                    fill={isSelected ? '#34d399' : '#f8fafc'}
                    fontSize="8.5"
                    fontWeight="bold"
                    textAnchor="middle"
                  >
                    {pt.name.length > 18 ? pt.name.substring(0, 16) + '..' : pt.name}
                  </text>
                  {pt.category === 'shelter' && (
                    <text
                      x="0"
                      y="21"
                      fill="#34d399"
                      fontSize="7.5"
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

      {/* 5. Bottom Tactical Inspection & 1-Click Google Maps Navigation Drawer */}
      <AnimatePresence>
        {selectedPoint && (
          <motion.div
            className={`map-inspection-drawer glass-panel severity-${selectedPoint.type}`}
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            style={{
              position: 'absolute',
              bottom: '14px',
              left: '14px',
              right: '14px',
              zIndex: 35,
              background: 'rgba(15, 23, 42, 0.96)',
              backdropFilter: 'blur(20px)',
              border: `1px solid ${selectedPoint.type === 'safe' ? '#10b981' : selectedPoint.type === 'critical' ? '#f43f5e' : '#38bdf8'}`,
              borderRadius: '16px',
              padding: '16px 20px',
              boxShadow: '0 25px 60px rgba(0, 0, 0, 0.8)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '12px',
                    background: selectedPoint.type === 'safe' ? 'rgba(16,185,129,0.2)' : selectedPoint.type === 'critical' ? 'rgba(244,63,94,0.2)' : 'rgba(56,189,248,0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '20px'
                  }}
                >
                  {selectedPoint.category === 'shelter' ? '🏠' : selectedPoint.type === 'critical' ? '🚨' : selectedPoint.type === 'warning' ? '⚠️' : selectedPoint.category === 'ngo' ? '🤝' : '🎯'}
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '10px', color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 'bold' }}>
                      {selectedPoint.category?.toUpperCase()} · GPS: {selectedPoint.lat}° N, {selectedPoint.lng}° E
                    </span>
                    {selectedPoint.distanceKm !== undefined && (
                      <span style={{ fontSize: '10px', background: 'rgba(16,185,129,0.2)', color: '#34d399', padding: '1px 6px', borderRadius: '4px', border: '1px solid rgba(16,185,129,0.3)' }}>
                        {selectedPoint.distanceKm} km · {selectedPoint.eta}
                      </span>
                    )}
                  </div>
                  <h4 style={{ margin: '2px 0 0 0', fontSize: '17px', color: '#f8fafc', fontWeight: '700' }}>
                    {selectedPoint.title || selectedPoint.name}
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

            <p style={{ color: '#cbd5e1', fontSize: '12.5px', margin: '6px 0 10px 0', lineHeight: 1.4 }}>
              {selectedPoint.sub}
            </p>

            {/* Shelter Bed Metrics */}
            {selectedPoint.category === 'shelter' && (
              <div style={{ background: 'rgba(16,185,129,0.12)', padding: '8px 12px', borderRadius: '8px', margin: '6px 0 10px 0', border: '1px solid rgba(16,185,129,0.25)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', color: '#10b981', fontWeight: 'bold' }}>
                    Available Bed Headroom: {selectedPoint.availableBeds} / {selectedPoint.capacity} Beds
                  </span>
                  <span style={{ fontSize: '10px', background: '#10b981', color: '#ffffff', padding: '2px 8px', borderRadius: '999px', fontWeight: 'bold' }}>
                    {Math.round((selectedPoint.occupied / selectedPoint.capacity) * 100)}% Occupied
                  </span>
                </div>
              </div>
            )}

            {/* 1-Click Direct Google Maps Navigation Actions */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              <button
                type="button"
                className="primary-button interactive"
                onClick={() => redirectToGoogleMaps(selectedPoint.lat, selectedPoint.lng, selectedPoint.title || selectedPoint.name, false)}
                style={{
                  background: 'linear-gradient(135deg, #10b981, #059669)',
                  borderColor: '#34d399',
                  color: '#ffffff',
                  fontWeight: '600',
                  padding: '8px 14px',
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  boxShadow: '0 4px 18px rgba(16,185,129,0.3)'
                }}
                title="Open live Google Maps driving navigation directly to this destination"
              >
                <Icons.Navigation size={14} />
                <span>Open in Google Maps & Start Driving Navigation</span>
                <Icons.ArrowUpRight size={13} />
              </button>

              <button
                type="button"
                className="secondary-button interactive"
                onClick={() => redirectToGoogleMaps(selectedPoint.lat, selectedPoint.lng, selectedPoint.title || selectedPoint.name, true)}
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  color: '#e2e8f0',
                  border: '1px solid rgba(255,255,255,0.15)',
                  padding: '8px 12px',
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                  fontSize: '12px'
                }}
                title="Route from District Incident Command EOC"
              >
                <Icons.Compass size={14} /> Route from {activeLocation.district} EOC
              </button>

              {/* Set as Active Application Sector button */}
              <button
                type="button"
                className="secondary-button interactive"
                onClick={() => {
                  switchLocation({
                    state: activeLocation.state,
                    district: activeLocation.district,
                    taluka: selectedPoint.taluka || selectedPoint.name,
                    city: selectedPoint.city || selectedPoint.name,
                    pincode: selectedPoint.pincode,
                    coordinates: { lat: selectedPoint.lat, lng: selectedPoint.lng }
                  });
                  setToast(`⚡ Application sector updated to ${selectedPoint.name}!`);
                  setTimeout(() => setToast(''), 3000);
                }}
                style={{
                  background: 'rgba(56,189,248,0.12)',
                  color: '#38bdf8',
                  border: '1px solid rgba(56,189,248,0.3)',
                  padding: '8px 12px',
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                  fontSize: '12px'
                }}
                title="Sync this location globally so Shelters, Campaigns and Dashboard re-orient around it"
              >
                <Icons.CheckCircle2 size={14} /> Set as Active Sector
              </button>

              <button
                type="button"
                className="secondary-button interactive"
                onClick={() => dispatchTeam(selectedPoint)}
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  color: '#cbd5e1',
                  border: '1px solid rgba(255,255,255,0.15)',
                  padding: '8px 12px',
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                  fontSize: '12px'
                }}
              >
                <Icons.Siren size={14} /> Dispatch Unit
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Real-time Toast Feedback */}
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
