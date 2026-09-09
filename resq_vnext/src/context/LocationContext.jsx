import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getCoordinatesForLocation, getDistrictCenter, getDistrictBounds } from '../lib/indiaGeoData';

const LOCATION_STORAGE_KEY = 'resq_active_location_v1';

const DEFAULT_LOCATION = {
  state: 'Maharashtra',
  district: 'Pune',
  taluka: 'Haveli',
  city: 'Pune City (Shivaji Nagar)',
  pincode: '411005',
  coordinates: { lat: 18.5314, lng: 73.8446 },
  bounds: { minLat: 18.10, maxLat: 19.30, minLng: 73.35, maxLng: 74.70 }
};

const LocationContext = createContext({
  activeLocation: DEFAULT_LOCATION,
  switchLocation: () => {},
  syncWithProfile: () => {}
});

export function LocationProvider({ children }) {
  const [activeLocation, setActiveLocation] = useState(() => {
    try {
      const stored = localStorage.getItem(LOCATION_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed?.district && parsed?.coordinates) {
          return parsed;
        }
      }
    } catch {
      // Fallback
    }
    return DEFAULT_LOCATION;
  });

  const switchLocation = useCallback((newLoc) => {
    const state = newLoc.state || 'Maharashtra';
    const district = newLoc.district || 'Pune';
    const taluka = newLoc.taluka || '';
    const city = newLoc.city || '';
    const pincode = newLoc.pincode || '';

    let coordinates = newLoc.coordinates;
    if (!coordinates || !coordinates.lat || !coordinates.lng) {
      coordinates = getCoordinatesForLocation(state, district, taluka, city);
    }

    const bounds = newLoc.bounds || getDistrictBounds(state, district);


    const resolved = {
      state,
      district,
      taluka: taluka || city || district,
      city: city || taluka || district,
      pincode,
      coordinates,
      bounds
    };

    setActiveLocation(resolved);
    try {
      localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(resolved));
      window.dispatchEvent(new CustomEvent('resq:location-change', { detail: resolved }));
    } catch {
      // Storage unavailable
    }
  }, []);

  const syncWithProfile = useCallback((profile) => {
    if (!profile) return;
    const state = profile.state || 'Maharashtra';
    const district = profile.district || 'Pune';
    const taluka = profile.taluka || profile.city || '';
    const city = profile.city || profile.taluka || '';
    const pincode = profile.pincode || '';

    const coordinates = profile.coordinates || getCoordinatesForLocation(state, district, taluka, city);
    switchLocation({ state, district, taluka, city, pincode, coordinates });
  }, [switchLocation]);

  return (
    <LocationContext.Provider value={{ activeLocation, switchLocation, syncWithProfile }}>
      {children}
    </LocationContext.Provider>
  );
}

export const useLocation = () => useContext(LocationContext);
export const useSectorLocation = () => useContext(LocationContext);
export default LocationContext;

