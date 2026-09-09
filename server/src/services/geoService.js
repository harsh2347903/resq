/**
 * RESQ Geospatial Proximity & Routing Service
 * Implements high-precision Haversine calculations, bounding box searches,
 * and terrain-adjusted emergency response ETA estimation.
 */

const EARTH_RADIUS_KM = 6371;

/**
 * Calculates distance between two GPS coordinates in kilometers
 */
export function calculateDistance(lat1, lon1, lat2, lon2) {
  if ([lat1, lon1, lat2, lon2].some(v => v === undefined || v === null || isNaN(v))) {
    return null;
  }

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = EARTH_RADIUS_KM * c;

  return Math.round(d * 100) / 100; // 2 decimal places
}

function toRad(degrees) {
  return (degrees * Math.PI) / 180;
}

/**
 * Calculates estimated response time based on distance and vehicle type
 * Takes into account disaster zone road speed reductions (avg 30 km/h in floods/debris)
 */
export function calculateETA(distanceKm, mode = 'ambulance') {
  if (!distanceKm && distanceKm !== 0) return 'Unknown';
  if (distanceKm === 0) return 'Immediate (< 1 min)';

  // Speeds in km/h under disaster conditions
  const speeds = {
    walking: 4,
    boat: 18,
    ambulance: 32, // reduced due to flooding/traffic
    air_rescue: 160
  };

  const speed = speeds[mode] || speeds.ambulance;
  const hours = distanceKm / speed;
  const minutes = Math.ceil(hours * 60);

  if (minutes < 60) {
    return `${minutes} min`;
  }
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h} hr ${m > 0 ? m + ' min' : ''}`.trim();
}

/**
 * Filters and sorts items with coordinates by distance from origin
 */
export function findNearby(items, originLat, originLng, maxRadiusKm = 25) {
  const originLatNum = Number(originLat);
  const originLngNum = Number(originLng);

  if (isNaN(originLatNum) || isNaN(originLngNum)) {
    return items;
  }

  return items
    .map(item => {
      const lat = item.coordinates?.lat ?? item.lat;
      const lng = item.coordinates?.lng ?? item.lng;
      if (lat === undefined || lng === undefined) {
        return { ...item, distanceKm: null, eta: null };
      }

      const dist = calculateDistance(originLatNum, originLngNum, Number(lat), Number(lng));
      return {
        ...item,
        distanceKm: dist,
        eta: calculateETA(dist, 'ambulance')
      };
    })
    .filter(item => item.distanceKm === null || item.distanceKm <= maxRadiusKm)
    .sort((a, b) => {
      if (a.distanceKm === null) return 1;
      if (b.distanceKm === null) return -1;
      return a.distanceKm - b.distanceKm;
    });
}
