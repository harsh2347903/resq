import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as Icons from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { api } from '../lib/apiClient';
import { useLocation } from '../context/LocationContext';
import {
  getTalukasForDistrict,
  getCitiesForDistrict,
  getDistrictCenter,
  getDistrictBounds,
  getAllLocationsForDistrict,
  getAllCitiesAcrossIndia
} from '../lib/indiaGeoData';
import { LocationSwitcherBadge } from './LocationSwitcherModal';

// Haversine distance in kilometers
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

// Available high-fidelity basemap providers
const BASEMAP_TILES = {
  satellite: {
    name: 'Satellite (Realistic)',
    icon: Icons.Globe,
    desc: 'High-resolution aerial satellite photography with terrain relief & road labels',
    base: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    overlay: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
    maxZoom: 19,
    attribution: '&copy; Esri &mdash; Earthstar Geographics'
  },
  streets: {
    name: 'Street Navigation',
    icon: Icons.Navigation,
    desc: 'Detailed street cartography, highways, local transit & municipal corridors',
    base: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  },
  topo: {
    name: 'Topographic Relief',
    icon: Icons.Mountain,
    desc: 'Elevation contour lines, mountain passes, drainage basins & shaded relief',
    base: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
    maxZoom: 19,
    attribution: '&copy; Esri Topo &mdash; USGS & GIS Community'
  },
  dark: {
    name: 'Tactical Night Mode',
    icon: Icons.Moon,
    desc: 'High-contrast monochrome GIS basemap optimized for low-light command ops',
    base: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    subdomains: 'abcd',
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap &copy; CARTO'
  }
};

export function CustomTacticalMap({
  layers = { incidents: true, shelters: true, ngo: true, responders: true },
  onInspectTemperature
}) {
  const { activeLocation, switchLocation } = useLocation();
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const tileLayersRef = useRef({ base: null, overlay: null });
  const markersLayerRef = useRef(null);

  const [activeBasemap, setActiveBasemap] = useState('satellite');
  const [mapScope, setMapScope] = useState('district'); // 'district' | 'all-cities'
  const [selectedPoint, setSelectedPoint] = useState(null);
  const [searchFilter, setSearchFilter] = useState('');
  const [headerSearchQuery, setHeaderSearchQuery] = useState('');
  const [headerSearchResults, setHeaderSearchResults] = useState([]);
  const [cursorCoords, setCursorCoords] = useState('');
  const [currentZoom, setCurrentZoom] = useState(12);
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

  // Compute active center coordinates
  const currentCenter = useMemo(() => {
    if (activeLocation?.coordinates?.lat && activeLocation?.coordinates?.lng) {
      return activeLocation.coordinates;
    }
    const fallback = getDistrictCenter(activeLocation.state, activeLocation.district);
    return { lat: fallback.lat, lng: fallback.lng };
  }, [activeLocation]);

  // Compute active district's bounding box encompassing all city areas
  const activeBounds = useMemo(() => {
    return getDistrictBounds(activeLocation.state, activeLocation.district);
  }, [activeLocation.state, activeLocation.district]);

  // All distinct localities and areas in the active district
  const districtLocations = useMemo(() => {
    return getAllLocationsForDistrict(activeLocation.state, activeLocation.district);
  }, [activeLocation.state, activeLocation.district]);

  // Nationwide small-to-big cities list
  const allNationwideCities = useMemo(() => {
    return getAllCitiesAcrossIndia();
  }, []);

  // Master List of Plotted Locations: Locality stations + Incidents + Shelters + NGOs
  const allLocations = useMemo(() => {
    // 1. Locality nodes based on mapScope
    let localityNodes = [];

    if (mapScope === 'all-cities') {
      // Map EVERY single city across India (small to large)
      localityNodes = allNationwideCities.map((c, idx) => ({
        id: `city-${c.state}-${c.district}-${c.city.replace(/[^a-zA-Z0-9]/g, '-')}`,
        category: 'locality',
        type: 'locality',
        name: c.city,
        title: `${c.city} (${c.district}, ${c.state})`,
        district: c.district,
        state: c.state,
        taluka: c.taluka || c.district,
        city: c.city,
        pincode: c.pincode || '',
        sub: `${c.district} District &bull; PIN ${c.pincode || 'Active'} &bull; Municipal Sector Hub`,
        lat: c.coordinates.lat,
        lng: c.coordinates.lng,
        team: `${c.city} Civil Defense Core`,
        services: ['Local Station', 'Shelter Hub', 'Field Triage Base']
      }));
    } else {
      // Micro-focus: Every single location in active district
      localityNodes = districtLocations.map((loc, idx) => {
        const lat = loc.coordinates?.lat || (currentCenter.lat + ((idx % 5) - 2) * 0.025);
        const lng = loc.coordinates?.lng || (currentCenter.lng + (Math.floor(idx / 5) - 1) * 0.025);
        return {
          id: `loc-${loc.city.replace(/[^a-zA-Z0-9]/g, '-')}`,
          category: 'locality',
          type: 'locality',
          name: loc.city,
          title: `${loc.city} (${loc.taluka || 'Sector'})`,
          district: activeLocation.district,
          state: activeLocation.state,
          taluka: loc.taluka || activeLocation.district,
          city: loc.city,
          pincode: loc.pincode || '',
          sub: `Sector Operations Base &bull; PIN ${loc.pincode || 'Active'} &bull; Quick Response Hub`,
          lat,
          lng,
          team: `${loc.city} Disaster Cell & Civil Defense`,
          services: ['Local Command Post', 'Shelter Access Hub', 'Field Triage Base']
        };
      });
    }

    // 2. Incidents
    const incs = (incidentsList.length ? incidentsList : [
      { id: 'INC-077', type: 'Flood', district: 'Pune', taluka: 'Haveli', location: 'Pune • Mula-Mutha basin', coordinates: { lat: 18.5312, lng: 73.8553 }, severity: 'Critical', affected: '2,482', details: 'Water surge +3.8m above danger mark.' },
      { id: 'INC-076', type: 'Landslide', district: 'Pune', taluka: 'Maval', location: 'Lonavala • Old Mumbai Rd', coordinates: { lat: 18.7546, lng: 73.4062 }, severity: 'High', affected: '218', details: 'Debris blocking transit corridor.' },
      { id: 'INC-080', type: 'Coastal Surge', district: 'Mumbai City', taluka: 'Worli', location: 'Worli Seaface • Marine Inundation', coordinates: { lat: 19.0166, lng: 72.8169 }, severity: 'Critical', affected: '3,120', details: 'High tide seawater breach over embankment.' },
      { id: 'INC-081', type: 'Waterlogging', district: 'Mumbai Suburban', taluka: 'Kurla', location: 'Kurla • Mithi River Overflow', coordinates: { lat: 19.0726, lng: 72.8845 }, severity: 'High', affected: '1,450', details: 'Rail subway flooding; rescue boats deployed.' },
      { id: 'INC-075', type: 'Fire', district: 'Nashik', taluka: 'Nashik', location: 'Nashik • MIDC Industrial Zone', coordinates: { lat: 19.9975, lng: 73.7898 }, severity: 'High', affected: '624', details: 'Chemical storage vapor flare containment.' },
      { id: 'INC-074', type: 'Heatwave', district: 'Nagpur', taluka: 'Nagpur Urban', location: 'Nagpur • Central zone', coordinates: { lat: 21.1458, lng: 79.0882 }, severity: 'Medium', affected: '5,870', details: 'Severe thermal warning.' },
      { id: 'INC-079', type: 'Landslide', district: 'Satara', taluka: 'Wai', location: 'Wai-Pasarni Ghat Corridor', coordinates: { lat: 17.9480, lng: 73.8920 }, severity: 'Critical', affected: '340', details: 'Hillside rockfall blocking access.' }
    ]).filter(i => mapScope === 'all-cities' || (i.district || '').toLowerCase() === (activeLocation.district || '').toLowerCase()).map(i => ({
      id: i.id || `inc-${Math.random()}`,
      category: 'incident',
      type: (i.severity?.toLowerCase() === 'critical' ? 'critical' : 'warning'),
      name: `${i.type} (${i.severity})`,
      title: `${i.type} at ${i.location}`,
      sub: i.details || `Impact zone: ${i.affected || 'Multiple'} citizens affected`,
      district: i.district || activeLocation.district,
      state: activeLocation.state,
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
    ]).filter(s => mapScope === 'all-cities' || (s.district || '').toLowerCase() === (activeLocation.district || '').toLowerCase()).map(s => ({
      id: `she-${s.id}`,
      category: 'shelter',
      type: 'safe',
      name: s.name,
      title: s.name,
      district: s.district || activeLocation.district,
      state: activeLocation.state,
      taluka: s.taluka || '',
      sub: `${s.capacity - s.occupied} Available Beds &bull; ${Math.round((s.occupied / s.capacity) * 100)}% Occupancy`,
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
        state: 'Maharashtra',
        taluka: 'Haveli',
        sub: '1,200 survival rations/hr &bull; 42 Active Volunteers',
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
        state: 'Maharashtra',
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
        state: 'Maharashtra',
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
        state: 'Maharashtra',
        taluka: 'Nagpur Urban',
        sub: 'Hydration and electrolyte distribution for field citizens',
        lat: 21.1400,
        lng: 79.0800,
        team: 'Nagpur Red Cross Unit',
        services: ['ORAS Pouches', 'Mobile Ambulances']
      }
    ].filter(n => mapScope === 'all-cities' || (n.district || '').toLowerCase() === (activeLocation.district || '').toLowerCase()).map(n => ({
      ...n,
      address: `${n.title}, ${n.district}`
    }));

    return [...incs, ...shels, ...ngos, ...localityNodes];
  }, [mapScope, allNationwideCities, districtLocations, incidentsList, sheltersList, activeLocation, currentCenter]);

  // Filter plotted points based on active layer toggles and search query
  const visibleLocations = useMemo(() => {
    return allLocations.filter(loc => {
      if (loc.category === 'incident') {
        if (loc.type === 'critical' && !activeLayerFilters.critical) return false;
        if (loc.type === 'warning' && !activeLayerFilters.warning) return false;
      }
      if (loc.category === 'shelter' && !activeLayerFilters.shelters) return false;
      if (loc.category === 'ngo' && !activeLayerFilters.ngo) return false;
      if (loc.category === 'locality' && !activeLayerFilters.localities) return false;

      if (searchFilter.trim()) {
        const q = searchFilter.toLowerCase();
        const matches = (
          loc.name.toLowerCase().includes(q) ||
          loc.title.toLowerCase().includes(q) ||
          (loc.city && loc.city.toLowerCase().includes(q)) ||
          (loc.taluka && loc.taluka.toLowerCase().includes(q)) ||
          (loc.pincode && loc.pincode.includes(q))
        );
        if (!matches) return false;
      }

      return true;
    });
  }, [allLocations, activeLayerFilters, searchFilter]);

  // Initialize and manage Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [currentCenter.lat, currentCenter.lng],
        zoom: 12,
        zoomControl: false,
        attributionControl: false
      });

      // Setup layer groups
      markersLayerRef.current = L.layerGroup().addTo(map);

      // Track cursor coordinates
      map.on('mousemove', (e) => {
        setCursorCoords(`${e.latlng.lat.toFixed(4)}° N, ${e.latlng.lng.toFixed(4)}° E`);
      });

      map.on('zoomend', () => {
        setCurrentZoom(map.getZoom());
      });

      mapInstanceRef.current = map;
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Update Basemap Tiles
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (tileLayersRef.current.base) {
      map.removeLayer(tileLayersRef.current.base);
      tileLayersRef.current.base = null;
    }
    if (tileLayersRef.current.overlay) {
      map.removeLayer(tileLayersRef.current.overlay);
      tileLayersRef.current.overlay = null;
    }

    const cfg = BASEMAP_TILES[activeBasemap] || BASEMAP_TILES.satellite;

    const baseLayer = L.tileLayer(cfg.base, {
      maxZoom: cfg.maxZoom,
      subdomains: cfg.subdomains || 'abc',
      attribution: cfg.attribution
    }).addTo(map);
    tileLayersRef.current.base = baseLayer;

    if (cfg.overlay) {
      const overlayLayer = L.tileLayer(cfg.overlay, {
        maxZoom: cfg.maxZoom,
        attribution: ''
      }).addTo(map);
      tileLayersRef.current.overlay = overlayLayer;
    }
  }, [activeBasemap]);

  // Center/Fit map when district or scope changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (mapScope === 'all-cities') {
      // Zoom out to regional / statewide view
      map.setView([19.5, 75.5], 7, { animate: true });
    } else if (activeBounds && activeBounds.minLat && activeBounds.maxLat) {
      map.fitBounds([
        [activeBounds.minLat, activeBounds.minLng],
        [activeBounds.maxLat, activeBounds.maxLng]
      ], { padding: [40, 40], maxZoom: 13, animate: true });
    } else {
      map.setView([currentCenter.lat, currentCenter.lng], 12, { animate: true });
    }
  }, [mapScope, activeLocation.district, activeLocation.state, activeBounds, currentCenter]);

  // Render Realistic Leaflet Markers
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !markersLayerRef.current) return;

    markersLayerRef.current.clearLayers();

    visibleLocations.forEach((loc) => {
      const isSelected = selectedPoint?.id === loc.id;
      const distKm = calculateHaversineKm(currentCenter.lat, currentCenter.lng, loc.lat, loc.lng);

      let iconColor = '#00f0ff';
      let iconBadge = '📍';
      let pinClass = 'pin-locality';

      if (loc.category === 'incident') {
        if (loc.type === 'critical') {
          iconColor = '#ef4444';
          iconBadge = '🚨';
          pinClass = 'pin-critical';
        } else {
          iconColor = '#f59e0b';
          iconBadge = '⚠️';
          pinClass = 'pin-warning';
        }
      } else if (loc.category === 'shelter') {
        iconColor = '#10b981';
        iconBadge = '🏠';
        pinClass = 'pin-shelter';
      } else if (loc.category === 'ngo') {
        iconColor = '#06b6d4';
        iconBadge = '🤝';
        pinClass = 'pin-ngo';
      }

      const customIcon = L.divIcon({
        className: 'custom-resq-div-icon',
        html: `
          <div class="realistic-pin-wrapper ${pinClass} ${isSelected ? 'pin-active' : ''}">
            <div class="pin-radar-pulse" style="--pin-color: ${iconColor};"></div>
            <div class="pin-marker-head" style="background: ${iconColor}; border-color: #ffffff;">
              <span class="pin-emoji">${iconBadge}</span>
            </div>
            <div class="pin-marker-stem"></div>
            <div class="pin-marker-shadow"></div>
            <div class="pin-hover-badge">${loc.name || loc.city}</div>
          </div>
        `,
        iconSize: [36, 44],
        iconAnchor: [18, 42],
        popupAnchor: [0, -42]
      });

      const marker = L.marker([loc.lat, loc.lng], { icon: customIcon });

      // Rich realistic operational popup with 1-click Google Maps Navigation & Temperature Telemetry
      const popupHtml = `
        <div class="resq-leaflet-popup-card">
          <div class="popup-card-header" style="border-left: 4px solid ${iconColor};">
            <span class="popup-type-tag" style="background: ${iconColor}22; color: ${iconColor};">
              ${iconBadge} ${loc.category.toUpperCase()}
            </span>
            <span class="popup-dist-badge">${distKm > 0 ? `${distKm} km away` : 'Active EOC Sector'}</span>
          </div>
          <div class="popup-card-body">
            <h4 class="popup-title">${loc.title || loc.name}</h4>
            <p class="popup-sub">${loc.sub || ''}</p>
            <div class="popup-details-grid">
              <div class="detail-row">
                <span class="label">District / Taluka:</span>
                <span class="val">${loc.district} • ${loc.taluka || loc.city || 'Central'}</span>
              </div>
              ${loc.pincode ? `
                <div class="detail-row">
                  <span class="label">Postal Index:</span>
                  <span class="val">${loc.pincode}</span>
                </div>
              ` : ''}
              ${loc.capacity ? `
                <div class="detail-row">
                  <span class="label">Capacity:</span>
                  <span class="val">${loc.capacity - (loc.occupied || 0)} available / ${loc.capacity}</span>
                </div>
              ` : ''}
              <div class="detail-row">
                <span class="label">GPS Coordinates:</span>
                <span class="val mono">${loc.lat.toFixed(4)}° N, ${loc.lng.toFixed(4)}° E</span>
              </div>
            </div>
          </div>
          <div class="popup-card-footer">
            <button
              type="button"
              class="popup-temp-inspect-btn"
              data-loc-id="${loc.id}"
            >
              🌡️ Check Real-time Temperature Telemetry
            </button>
            <a
              href="https://www.google.com/maps/dir/?api=1&destination=${loc.lat},${loc.lng}&travelmode=driving"
              target="_blank"
              rel="noopener noreferrer"
              class="popup-nav-btn"
            >
              🚗 Navigate via Google Maps
            </a>
          </div>
        </div>
      `;

      marker.bindPopup(popupHtml, {
        className: 'resq-custom-popup',
        maxWidth: 320,
        closeButton: true
      });

      marker.on('popupopen', (e) => {
        const el = e.popup.getElement();
        if (el) {
          const tempBtn = el.querySelector('.popup-temp-inspect-btn');
          if (tempBtn) {
            tempBtn.onclick = () => {
              const locPayload = {
                name: loc.title || loc.name,
                district: loc.district,
                state: loc.state || activeLocation.state,
                lat: loc.lat,
                lng: loc.lng
              };
              if (onInspectTemperature) {
                onInspectTemperature(locPayload);
              }
              window.dispatchEvent(new CustomEvent('resq:open-temp-reader', { detail: locPayload }));
            };
          }
        }
      });

      marker.on('click', () => {
        setSelectedPoint(loc);
      });

      markersLayerRef.current.addLayer(marker);
    });
  }, [visibleLocations, selectedPoint, currentCenter, onInspectTemperature, activeLocation.state]);

  // Fly to specific location
  const handleFlyToLocation = useCallback((loc) => {
    setSelectedPoint(loc);
    const map = mapInstanceRef.current;
    if (map) {
      map.flyTo([loc.lat, loc.lng], 15, {
        duration: 1.2,
        easeLinearity: 0.25
      });
      markersLayerRef.current.eachLayer((marker) => {
        const pos = marker.getLatLng();
        if (Math.abs(pos.lat - loc.lat) < 0.0001 && Math.abs(pos.lng - loc.lng) < 0.0001) {
          setTimeout(() => marker.openPopup(), 400);
        }
      });
    }
  }, []);

  // Fit all locations in the active district
  const handleResetDistrictView = useCallback(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    if (mapScope === 'all-cities') {
      map.setView([19.5, 75.5], 7, { animate: true });
    } else if (activeBounds) {
      map.fitBounds([
        [activeBounds.minLat, activeBounds.minLng],
        [activeBounds.maxLat, activeBounds.maxLng]
      ], { padding: [40, 40], maxZoom: 13, animate: true });
    } else {
      map.setView([currentCenter.lat, currentCenter.lng], 12, { animate: true });
    }
    setSelectedPoint(null);
  }, [mapScope, activeBounds, currentCenter]);

  // Header quick search filter
  useEffect(() => {
    if (!headerSearchQuery.trim()) {
      setHeaderSearchResults([]);
      return;
    }
    const q = headerSearchQuery.toLowerCase();
    const matches = allNationwideCities.filter(c =>
      c.city.toLowerCase().includes(q) ||
      c.district.toLowerCase().includes(q) ||
      c.taluka.toLowerCase().includes(q) ||
      c.pincode.includes(q)
    ).slice(0, 8);
    setHeaderSearchResults(matches);
  }, [headerSearchQuery, allNationwideCities]);

  // Copy GPS to clipboard
  const handleCopyCoords = useCallback((loc) => {
    const text = `${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}`;
    navigator.clipboard?.writeText(text);
    setToast(`Copied ${loc.name} GPS (${text})`);
    setTimeout(() => setToast(''), 3000);
  }, []);

  return (
    <div className="custom-tactical-gis-viewport">
      {/* Top Map Action Bar */}
      <div className="tactical-gis-header glass-panel">
        <div className="gis-header-left">
          <div className="gis-title-group">
            <span className="live-radar-blip"/>
            <span className="gis-system-title">Tactical GIS Master Basemap</span>
            <span className="gis-badge-district">{activeLocation.district} District</span>
          </div>

          <LocationSwitcherBadge/>
        </div>

        {/* Map Scope Toggle (District Micro vs All-India Macro) */}
        <div className="gis-scope-toggle">
          <button
            type="button"
            className={`scope-pill-btn ${mapScope === 'district' ? 'active' : ''}`}
            onClick={() => setMapScope('district')}
            title="Focus on active district and its micro-localities"
          >
            <Icons.MapPin size={12}/>
            <span>{activeLocation.district} Micro-Sectors ({districtLocations.length})</span>
          </button>
          <button
            type="button"
            className={`scope-pill-btn ${mapScope === 'all-cities' ? 'active' : ''}`}
            onClick={() => setMapScope('all-cities')}
            title="Cover every city small to big across the state and country"
          >
            <Icons.Globe size={12}/>
            <span>All Cities Coverage ({allNationwideCities.length}+)</span>
          </button>
        </div>

        {/* Basemap Style Switcher */}
        <div className="gis-basemap-selector">
          {Object.entries(BASEMAP_TILES).map(([key, cfg]) => {
            const Icon = cfg.icon;
            const isActive = activeBasemap === key;
            return (
              <button
                key={key}
                type="button"
                className={`basemap-pill-btn ${isActive ? 'active' : ''}`}
                onClick={() => setActiveBasemap(key)}
                title={cfg.desc}
              >
                <Icon size={13}/>
                <span>{cfg.name}</span>
              </button>
            );
          })}
        </div>

        {/* Right Search & Controls */}
        <div className="gis-header-right">
          {/* Quick City Search Box */}
          <div className="map-header-search-wrap">
            <Icons.Search size={12} className="map-search-ico"/>
            <input
              type="text"
              className="map-header-search-input"
              placeholder="Search any small/big city..."
              value={headerSearchQuery}
              onChange={(e) => setHeaderSearchQuery(e.target.value)}
            />
            {headerSearchQuery && (
              <button type="button" className="clear-map-search" onClick={() => setHeaderSearchQuery('')}>
                <Icons.X size={11}/>
              </button>
            )}

            {/* Quick search dropdown */}
            <AnimatePresence>
              {headerSearchResults.length > 0 && (
                <motion.div
                  className="map-header-search-dropdown glass-panel"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                >
                  {headerSearchResults.map((c) => (
                    <button
                      key={`${c.city}-${c.district}`}
                      type="button"
                      className="map-search-row"
                      onClick={() => {
                        handleFlyToLocation({
                          ...c,
                          id: `city-${c.city}`,
                          category: 'locality',
                          name: c.city,
                          title: `${c.city} (${c.district})`,
                          lat: c.coordinates.lat,
                          lng: c.coordinates.lng,
                          sub: `${c.district} District &bull; PIN ${c.pincode || 'Active'}`
                        });
                        setHeaderSearchQuery('');
                        setHeaderSearchResults([]);
                      }}
                    >
                      <Icons.MapPin size={12}/>
                      <span className="search-city-name">{c.city}</span>
                      <span className="search-dist-tag">{c.district}</span>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <button
            type="button"
            className="gis-action-btn"
            onClick={handleResetDistrictView}
            title="Auto-Fit District Bounds"
          >
            <Icons.Maximize2 size={13}/>
            <span>Fit {mapScope === 'all-cities' ? 'Region' : activeLocation.district}</span>
          </button>
        </div>
      </div>

      {/* Quick Location Nav Strip covering EVERY single location in the selected district */}
      <div className="district-locations-quick-strip glass-panel">
        <div className="quick-strip-label">
          <Icons.MapPin size={12}/>
          <span>ALL {districtLocations.length} SECTOR HUBS IN {activeLocation.district.toUpperCase()}:</span>
        </div>
        <div className="quick-strip-scroll">
          {districtLocations.map((loc) => {
            const isSelected = selectedPoint?.name === loc.city;
            return (
              <button
                type="button"
                key={loc.city}
                className={`quick-loc-chip ${isSelected ? 'active' : ''}`}
                onClick={() => {
                  const target = allLocations.find(l => l.name === loc.city) || {
                    ...loc,
                    name: loc.city,
                    lat: loc.coordinates?.lat || currentCenter.lat,
                    lng: loc.coordinates?.lng || currentCenter.lng
                  };
                  handleFlyToLocation(target);
                }}
              >
                <span className="chip-dot"/>
                <span className="chip-city">{loc.city}</span>
                {loc.pincode && <span className="chip-pin">{loc.pincode}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Realistic Map Viewport */}
      <div className="leaflet-map-wrapper">
        <div ref={mapContainerRef} className="resq-leaflet-container" />

        {/* Floating Layer Visibility Filter */}
        <div className="floating-layer-panel glass-panel">
          <span className="layer-panel-title">
            <Icons.Layers size={12}/> Map Layers
          </span>
          <div className="layer-toggles-row">
            <button
              type="button"
              className={`layer-toggle-btn critical ${activeLayerFilters.critical ? 'active' : ''}`}
              onClick={() => setActiveLayerFilters(f => ({ ...f, critical: !f.critical }))}
            >
              <span className="dot red"/> Critical SOS
            </button>
            <button
              type="button"
              className={`layer-toggle-btn warning ${activeLayerFilters.warning ? 'active' : ''}`}
              onClick={() => setActiveLayerFilters(f => ({ ...f, warning: !f.warning }))}
            >
              <span className="dot amber"/> Warnings
            </button>
            <button
              type="button"
              className={`layer-toggle-btn shelter ${activeLayerFilters.shelters ? 'active' : ''}`}
              onClick={() => setActiveLayerFilters(f => ({ ...f, shelters: !f.shelters }))}
            >
              <span className="dot green"/> Shelters
            </button>
            <button
              type="button"
              className={`layer-toggle-btn ngo ${activeLayerFilters.ngo ? 'active' : ''}`}
              onClick={() => setActiveLayerFilters(f => ({ ...f, ngo: !f.ngo }))}
            >
              <span className="dot cyan"/> NGOs / SAR
            </button>
            <button
              type="button"
              className={`layer-toggle-btn localities ${activeLayerFilters.localities ? 'active' : ''}`}
              onClick={() => setActiveLayerFilters(f => ({ ...f, localities: !f.localities }))}
            >
              <span className="dot blue"/> Localities
            </button>
          </div>
        </div>

        {/* Floating Zoom & Compass Controls */}
        <div className="floating-zoom-controls">
          <button
            type="button"
            className="zoom-btn"
            onClick={() => mapInstanceRef.current?.zoomIn()}
            title="Zoom In"
          >
            <Icons.Plus size={16}/>
          </button>
          <button
            type="button"
            className="zoom-btn"
            onClick={() => mapInstanceRef.current?.zoomOut()}
            title="Zoom Out"
          >
            <Icons.Minus size={16}/>
          </button>
          <button
            type="button"
            className="zoom-btn"
            onClick={handleResetDistrictView}
            title="Reset District View"
          >
            <Icons.Compass size={16}/>
          </button>
        </div>

        {/* Floating Telemetry Readout Bar */}
        <div className="gis-telemetry-statusbar glass-panel">
          <div className="status-item">
            <span className="label">GEO CURSOR:</span>
            <span className="val mono">{cursorCoords || `${currentCenter.lat.toFixed(4)}° N, ${currentCenter.lng.toFixed(4)}° E`}</span>
          </div>
          <div className="status-item">
            <span className="label">SCOPE:</span>
            <span className="val highlight">{mapScope === 'all-cities' ? 'ALL CITIES (STATEWIDE)' : `${activeLocation.district} LOCALITIES`}</span>
          </div>
          <div className="status-item">
            <span className="label">MAPPED HUBS:</span>
            <span className="val highlight">{visibleLocations.length} active hubs</span>
          </div>
          <div className="status-item">
            <span className="label">BASEMAP:</span>
            <span className="val">{BASEMAP_TILES[activeBasemap]?.name}</span>
          </div>
          <div className="status-item">
            <span className="label">ZOOM:</span>
            <span className="val mono">L{currentZoom}</span>
          </div>
        </div>
      </div>

      {/* Selected Location Bottom Drawer / Quick Inspection Bar */}
      <AnimatePresence>
        {selectedPoint && (
          <motion.div
            className="selected-point-drawer glass-panel"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 30 }}
            transition={{ duration: 0.2 }}
          >
            <div className="drawer-header">
              <div className="drawer-title-group">
                <span className={`drawer-cat-badge cat-${selectedPoint.category}`}>
                  {selectedPoint.category.toUpperCase()}
                </span>
                <h3 className="drawer-title">{selectedPoint.title || selectedPoint.name}</h3>
                <span className="drawer-coords mono">{selectedPoint.lat.toFixed(4)}° N, {selectedPoint.lng.toFixed(4)}° E</span>
              </div>
              <button
                type="button"
                className="drawer-close-btn"
                onClick={() => setSelectedPoint(null)}
              >
                <Icons.X size={15}/>
              </button>
            </div>

            <div className="drawer-body">
              <div className="drawer-col">
                <span className="col-label">Taluka & Administrative Area</span>
                <span className="col-val">{selectedPoint.district} • {selectedPoint.taluka || selectedPoint.city || 'District Center'}</span>
                {selectedPoint.pincode && <span className="col-sub">Postal Index Number: {selectedPoint.pincode}</span>}
              </div>
              <div className="drawer-col">
                <span className="col-label">Mission Context & Operational Status</span>
                <span className="col-val">{selectedPoint.sub || 'Active Emergency Support Node'}</span>
                <span className="col-sub">Logistics Team: {selectedPoint.team || 'Civil Defense & NDRF'}</span>
              </div>
              <div className="drawer-col actions-col">
                <button
                  type="button"
                  className="drawer-temp-btn"
                  onClick={() => {
                    const locPayload = {
                      name: selectedPoint.title || selectedPoint.name,
                      district: selectedPoint.district,
                      state: selectedPoint.state || activeLocation.state,
                      lat: selectedPoint.lat,
                      lng: selectedPoint.lng
                    };
                    if (onInspectTemperature) {
                      onInspectTemperature(locPayload);
                    }
                    window.dispatchEvent(new CustomEvent('resq:open-temp-reader', { detail: locPayload }));
                  }}
                >
                  <Icons.Thermometer size={13}/>
                  <span>Live Temp Telemetry</span>
                </button>
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${selectedPoint.lat},${selectedPoint.lng}&travelmode=driving`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="drawer-nav-link"
                >
                  <Icons.Navigation size={13}/>
                  <span>Google Maps</span>
                </a>
                <button
                  type="button"
                  className="drawer-copy-btn"
                  onClick={() => handleCopyCoords(selectedPoint)}
                >
                  <Icons.Copy size={13}/>
                  <span>Copy GPS</span>
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Notification Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            className="tactical-toast"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 15 }}
          >
            <Icons.CheckCircle2 size={14} color="#10b981"/>
            <span>{toast}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
