/**
 * RESQ Intelligent Volunteer & Resource Dispatch Matcher
 * Analyzes disaster request requirements, volunteer skill taxonomies,
 * real-time availability, and geographic proximity to compute optimal dispatch scores.
 */

import { calculateDistance, calculateETA } from './geoService.js';

const SKILL_COMPATIBILITY = {
  medical: ['first aid', 'paramedic', 'nursing', 'doctor', 'triage', 'cpr'],
  evacuation: ['driving', 'boat', 'logistics', 'search and rescue', 'heavy vehicle', 'navigation'],
  flood: ['boat', 'swimming', 'water rescue', 'logistics'],
  fire: ['firefighting', 'first aid', 'evacuation', 'hazmat'],
  food: ['logistics', 'distribution', 'driving', 'cooking', 'inventory'],
  water: ['logistics', 'distribution', 'driving'],
  missing_family: ['translation', 'coordination', 'first aid', 'social work'],
  general: ['first aid', 'logistics', 'driving', 'translation']
};

export function matchVolunteersToRequest(request, volunteers = []) {
  if (!request) return [];

  const reqType = String(request.type || 'general').toLowerCase();
  const reqLat = request.coordinates?.lat ?? 18.5204;
  const reqLng = request.coordinates?.lng ?? 73.8567;

  const compatibleSkills = SKILL_COMPATIBILITY[reqType] || SKILL_COMPATIBILITY.general;

  return volunteers
    .map(vol => {
      let score = 50; // base score

      // 1. Availability check
      const isAvailable = vol.status?.toLowerCase() === 'available';
      if (!isAvailable) {
        score -= 40;
      } else {
        score += 20;
      }

      // 2. Skill alignment check
      const volSkill = String(vol.skill || '').toLowerCase();
      const hasSkill = compatibleSkills.some(s => volSkill.includes(s));
      if (hasSkill) {
        score += 30;
      }

      // 3. Proximity score
      const volLat = vol.coordinates?.lat ?? 18.5314;
      const volLng = vol.coordinates?.lng ?? 73.8446;
      const distanceKm = calculateDistance(reqLat, reqLng, volLat, volLng) || 4.2;

      // Deduct score as distance increases (max -30 for > 30km)
      const distancePenalty = Math.min(30, Math.floor(distanceKm));
      score = Math.max(10, Math.min(99, score - distancePenalty));

      const eta = calculateETA(distanceKm, volSkill.includes('boat') ? 'boat' : 'ambulance');

      return {
        volunteerId: vol.id,
        name: vol.name,
        skill: vol.skill,
        area: vol.area,
        status: vol.status,
        missions: vol.missions || 0,
        distanceKm,
        eta,
        matchScore: score,
        isOptimal: score >= 75
      };
    })
    .sort((a, b) => b.matchScore - a.matchScore);
}
