/**
 * RESQ AI & NLP Emergency Triage Engine
 * Multilingual distress processing across English, Hindi, and Marathi.
 * Automatically classifies triage urgency, detects casualty/trapped counts,
 * identifies required rescue equipment, and synthesizes operational summaries.
 */

const CRITICAL_KEYWORDS = [
  // English
  'unconscious', 'bleeding', 'collapsed', 'cardiac', 'heart attack', 'drowning', 'submerged',
  'suffocating', 'trapped under', 'crushed', 'gas leak', 'fire', 'explosion', 'infant', 'pregnant', 'stroke',
  // Hindi
  'बेहोश', 'खून', 'डूब', 'सांस', 'दबे हुए', 'आग', 'विस्फोट', 'बच्चा', 'गर्भवती', 'तुरंत', 'मदद',
  // Marathi
  'बेशुद्ध', 'रक्तस्त्राव', 'बुडत', 'श्वास', 'खाली अडकले', 'आग', 'स्फोट', 'बाळ', 'गरोदर', 'त्वरित', 'जीव धोक्यात'
];

const HIGH_KEYWORDS = [
  // English
  'fracture', 'broken bone', 'chest pain', 'flooding inside', 'water rising', 'roof trapped', 'no food 2 days',
  'diabetic insulin', 'oxygen low', 'landslide blocking',
  // Hindi
  'हड्डी टूट', 'पानी बढ़ रहा', 'छत पर', 'खाना नहीं', 'ऑक्सीजन', 'रास्ता बंद',
  // Marathi
  'हाड मोडले', 'पाणी वाढत आहे', 'छतावर', 'अन्न नाही', 'ऑक्सिजन', 'रस्ता बंद'
];

const CATEGORY_MAP = {
  medical: ['medical', 'blood', 'doctor', 'hospital', 'injury', 'wound', 'heart', 'stroke', 'दवा', 'डॉक्टर', 'इलाज', 'रुग्णालय', 'औषध'],
  flood: ['flood', 'water', 'river', 'drowning', 'submerged', 'inundation', 'पूर', 'पाणी', 'नदी', 'डूबना', 'सैलाब'],
  fire: ['fire', 'burn', 'smoke', 'explosion', 'gas', 'सिलेंडर', 'आग', 'धूर', 'स्फोट', 'गॅस'],
  evacuation: ['trapped', 'evacuate', 'rescue', 'collapsed', 'landslide', 'stuck', 'अडकले', 'बचाव', 'काढा', 'फंसे हुए', 'भूस्खलन'],
  food_water: ['food', 'water', 'starving', 'ration', 'drinking', 'भूख', 'राशन', 'अन्न', 'पाणी', 'जेवण']
};

export function triageDistressMessage(text = '', userPriority = 'High') {
  const normalized = String(text).toLowerCase();
  let urgency = userPriority || 'Medium';
  const tags = [];
  const requiredEquipment = [];

  // 1. Detect Urgency Level
  let criticalMatches = 0;
  for (const word of CRITICAL_KEYWORDS) {
    if (normalized.includes(word.toLowerCase())) {
      criticalMatches++;
    }
  }

  let highMatches = 0;
  for (const word of HIGH_KEYWORDS) {
    if (normalized.includes(word.toLowerCase())) {
      highMatches++;
    }
  }

  if (criticalMatches > 0 || userPriority === 'Critical') {
    urgency = 'Critical';
    tags.push('Immediate-Life-Threat');
  } else if (highMatches > 0 || userPriority === 'High') {
    urgency = 'High';
    tags.push('Urgent-Priority');
  } else {
    urgency = 'Medium';
    tags.push('Standard-Relief');
  }

  // 2. Identify Category
  let detectedCategory = 'General';
  for (const [cat, kws] of Object.entries(CATEGORY_MAP)) {
    if (kws.some(kw => normalized.includes(kw))) {
      detectedCategory = cat.charAt(0).toUpperCase() + cat.slice(1);
      tags.push(detectedCategory);
      break;
    }
  }

  // 3. Extract Trapped / People Count
  let estimatedPersons = 1;
  const countMatch = normalized.match(/(\d+)\s*(people|persons|folks|members|family|मुले|लोक|माणसे|लोग)/);
  if (countMatch && countMatch[1]) {
    estimatedPersons = parseInt(countMatch[1], 10);
    tags.push(`${estimatedPersons}-Individuals`);
  }

  // 4. Equipment & Asset Recommendation
  if (normalized.includes('flood') || normalized.includes('water') || normalized.includes('river') || normalized.includes('पाणी') || normalized.includes('पूर')) {
    requiredEquipment.push('Inflatable Zodiac Boat', 'High-Buoyancy Life Vests');
  }
  if (normalized.includes('bleeding') || normalized.includes('unconscious') || normalized.includes('wound') || normalized.includes('fracture') || normalized.includes('heart') || normalized.includes('डॉक्टर')) {
    requiredEquipment.push('Advanced Life Support (ALS) Ambulance', 'Trauma Resuscitation Kit');
  }
  if (normalized.includes('trapped') || normalized.includes('collapsed') || normalized.includes('crushed') || normalized.includes('अडकले')) {
    requiredEquipment.push('Hydraulic Rescue Spreader (Jaws of Life)', 'Acoustic Search Sensor');
  }
  if (normalized.includes('fire') || normalized.includes('smoke') || normalized.includes('गॅस') || normalized.includes('आग')) {
    requiredEquipment.push('Self-Contained Breathing Apparatus (SCBA)', 'Class B Foam Extinguisher');
  }
  if (requiredEquipment.length === 0) {
    requiredEquipment.push('Standard First-Responder Relief Kit');
  }

  // 5. Synthesize Multilingual Operational Summary
  let summary = `Triage (${urgency}): ${detectedCategory} assistance requested. Estimated ${estimatedPersons} person(s). Units needed: ${requiredEquipment[0]}.`;

  return {
    urgency,
    category: detectedCategory,
    estimatedPersons,
    tags,
    requiredEquipment,
    summary,
    processedAt: new Date().toISOString()
  };
}
