/**
 * Rakshak AI & NLP Emergency Triage Engine
 * Multilingual distress processing across English, Hindi, and Marathi.
 * Automatically classifies triage urgency, detects casualty/trapped counts,
 * handles empathetic conversational statements, and coordinates escalation.
 */

const CRITICAL_KEYWORDS = [
  // English
  'unconscious', 'bleeding', 'collapsed', 'cardiac', 'heart attack', 'drowning', 'submerged',
  'suffocating', 'trapped under', 'crushed', 'gas leak', 'fire', 'explosion', 'infant', 'pregnant', 'stroke',
  // Hindi
  'बेहोश', 'खून', 'डूब', 'सांस', 'दबे हुए', 'आग', 'विस्फोट', 'बच्चा', 'गर्भवती', 'तुरंत', 'मदद', 'फंसा', 'फंसे',
  // Marathi
  'बेशुद्ध', 'रक्तस्त्राव', 'बुडत', 'श्वास', 'खाली अडकले', 'आग', 'स्फोट', 'बाळ', 'गरोदर', 'त्वरित', 'जीव धोक्यात', 'अडकलो'
];

const HIGH_KEYWORDS = [
  // English
  'fracture', 'broken bone', 'chest pain', 'flooding inside', 'water rising', 'roof trapped', 'no food 2 days',
  'diabetic insulin', 'oxygen low', 'landslide blocking', 'water entering', 'flood',
  // Hindi
  'हड्डी टूट', 'पानी बढ़ रहा', 'छत पर', 'खाना नहीं', 'ऑक्सीजन', 'रास्ता बंद', 'पानी भर गया',
  // Marathi
  'हाड मोडले', 'पाणी वाढत आहे', 'छतावर', 'अन्न नाही', 'ऑक्सिजन', 'रस्ता बंद', 'पाणी शिरले'
];

const SAFE_GREETING_KEYWORDS = [
  'happy', 'im happy', "i'm happy", 'safe', 'we are safe', 'all good', 'all fine', 'feeling good',
  'good morning', 'good evening', 'hello', 'hi', 'hey', 'namaste', 'thank you', 'thanks', 'cool',
  'no emergency', 'peace', 'doing well',
  // Hindi
  'खुश', 'सुरक्षित', 'सब ठीक', 'नमस्ते', 'धन्यवाद', 'कोई खतरा नहीं', 'राहत', 'नमस्कार',
  // Marathi
  'आनंदी', 'सुरक्षित आहोत', 'सर्व ठीक', 'मजेत', 'नमस्कार', 'धन्यवाद', 'काही अडचण नाही'
];

const CATEGORY_MAP = {
  medical: ['medical', 'blood', 'doctor', 'hospital', 'injury', 'wound', 'heart', 'stroke', 'दवा', 'डॉक्टर', 'इलाज', 'रुग्णालय', 'औषध', 'रक्तस्त्राव', 'चोट'],
  flood: ['flood', 'water', 'river', 'drowning', 'submerged', 'inundation', 'rain', 'water rising', 'पूर', 'पाणी', 'नदी', 'डूबना', 'सैलाब', 'बारिश'],
  fire: ['fire', 'burn', 'smoke', 'explosion', 'gas', 'सिलेंडर', 'आग', 'धूर', 'स्फोट', 'गॅस'],
  evacuation: ['trapped', 'evacuate', 'rescue', 'collapsed', 'landslide', 'stuck', 'अडकले', 'बचाव', 'काढा', 'फंसे हुए', 'भूस्खलन'],
  food_water: ['food', 'water', 'starving', 'ration', 'drinking', 'भूख', 'राशन', 'अन्न', 'पाणी', 'जेवण', 'खाना']
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

/**
 * Intelligent Conversational Assistant Engine
 * Evaluates sentiment, distinguishes calm/safe statements from life threats,
 * produces supportive dialogues, and builds escalation briefs.
 */
export function conversationalTriage(text = '', lang = 'en', location = 'Pune') {
  const clean = String(text || '').trim();
  const normalized = clean.toLowerCase();

  // 1. Check for Safe / Greeting / Positive statement
  const isSafeOrGreeting = SAFE_GREETING_KEYWORDS.some(kw => {
    if (normalized === kw) return true;
    if (normalized.startsWith(kw + ' ') || normalized.endsWith(' ' + kw)) return true;
    if (normalized.includes('im happy') || normalized.includes("i'm happy") || normalized.includes('i am happy')) return true;
    if (normalized.includes('we are safe') || normalized.includes('i am safe') || normalized.includes('all safe')) return true;
    return false;
  });

  if (isSafeOrGreeting && !CRITICAL_KEYWORDS.some(cw => normalized.includes(cw))) {
    let reply = '';
    if (lang === 'hi') {
      reply = `यह जानकर बहुत खुशी और राहत मिली कि आप सुरक्षित और प्रसन्न हैं! 😊\n\nरक्षक एआई आपके क्षेत्र (${location}) में 24/7 मौसम और सुरक्षा ग्रिड पर नज़र रखे हुए है। यदि स्थिति बदलती है या आपके पड़ोस में किसी को भी राहत, चिकित्सा या भोजन की आवश्यकता हो, तो मुझे तुरंत बताएं। हम हमेशा आपकी सेवा में हैं।`;
    } else if (lang === 'mr') {
      reply = `तुम्ही सुरक्षित आणि आनंदात आहात हे ऐकून खूप समाधान वाटले! 😊\n\nरक्षक एआय तुमच्या कार्यक्षेत्रात (${location}) २४/७ सतत देखरेख करत आहे. भविष्यात हवामानात बदल झाल्यास किंवा कोणालाही वैद्यकीय अथवा बचाव मदतीची गरज भासल्यास मला त्वरित सांगा.`;
    } else {
      reply = `I am very glad and relieved to hear that you are safe and in good spirits! 😊\n\nRakshak AI is continuously monitoring your sector in ${location}. No immediate alarms are active for your personal safety. If rainfall intensifies, water levels change, or anyone nearby needs medical or emergency assistance, feel free to message me anytime!`;
    }

    return {
      isSafe: true,
      urgency: 'Safe / Normal',
      reply,
      cautions: [],
      canEscalate: false,
      category: 'General Safety'
    };
  }

  // 2. If not a simple greeting, run clinical triage analysis
  const triage = triageDistressMessage(clean);
  let cautions = [];
  let reply = '';

  if (triage.category === 'Flood') {
    if (lang === 'hi') {
      reply = `⚠️ बाढ़ और जलभराव का खतरा पहचाना गया है (गंभीरता: ${triage.urgency})।\nकृपया घबराएं नहीं। तुरंत नीचे दिए गए जीवन-रक्षक नियमों का पालन करें:`;
      cautions = [
        'तुरंत मुख्य विद्युत स्विच (Main Breaker) बंद कर दें यदि वहां तक पहुंचना सुरक्षित हो।',
        'भवन की सबसे ऊंची पक्की मंजिल या छत पर जाएं। सूखा भोजन, पीने का पानी और फोन साथ रखें।',
        'बहते हुए बाढ़ के पानी में बिल्कुल न उतरें — 15 सेमी बहता पानी किसी को भी बहा सकता है।',
        'यदि पानी तेजी से बढ़ रहा है, तो मैंने आपका आधिकारिक ट्राइएज रिपोर्ट तैयार कर लिया है। नीचे क्लिक करके इसे सरकारी नियंत्रण कक्ष को भेजें।'
      ];
    } else if (lang === 'mr') {
      reply = `⚠️ पुराचा व साचलेल्या पाण्याचा धोका आढळला आहे (तीव्रता: ${triage.urgency}).\nकृपया शांत राहा आणि खालील नियमांचे काटेकोर पालन करा:`;
      cautions = [
        'शक्य असल्यास तात्काळ मुख्य वीज पुरवठा बंद करा.',
        'इमारतीच्या सर्वोच्च मजल्यावर किंवा सुरक्षित गच्चीवर आश्रय घ्या.',
        'वाहत्या पाण्यात मुळीच चालू नका किंवा वाहन चालवू नका.',
        'पाणी वेगाने वाढत असल्यास, खालील बटनावर क्लिक करून सरकारी अधिकाऱ्यांना थेट मदत पथक पाठवण्याची विनंती करा.'
      ];
    } else {
      reply = `⚠️ Flash Flood & Water Hazard Detected (Urgency: ${triage.urgency}).\nPlease stay calm and immediately follow these verified field safety cautions:`;
      cautions = [
        'Switch OFF the main electrical breaker immediately if safe to reach.',
        'Move to the highest floor or reinforced rooftop with dry rations, water, and mobile.',
        'NEVER walk or drive through moving water — 15 cm of moving water can sweep an adult away.',
        'Stay clear of submerged electrical outlets and metal grilles.'
      ];
    }
  } else if (triage.category === 'Fire') {
    if (lang === 'hi') {
      reply = `🚨 आग और धुएं की आपात स्थिति (गंभीरता: ${triage.urgency})!\nतुरंत इस प्रोटोकॉल का पालन करें:`;
      cautions = [
        'धुएं से बचने के लिए फर्श पर झुककर या रेंगकर बाहर निकलें। जमीन के पास स्वच्छ ऑक्सीजन होती है।',
        'नाक और मुंह को गीले कपड़े या रुमाल से ढकें।',
        'दरवाजा खोलने से पहले हाथ के पिछले हिस्से से छुएं। यदि गर्म लगे तो दरवाजा न खोलें।',
        'लिफ्ट का प्रयोग न करें; केवल आपातकालीन सीढ़ियों का उपयोग करें।'
      ];
    } else if (lang === 'mr') {
      reply = `🚨 आग आणि विषारी धुराची गंभीर आणीबाणी (तीव्रता: ${triage.urgency})!\nत्वरित खालील कृती करा:`;
      cautions = [
        'धूर असल्यास जमिनीलगत रांगत बाहेर पडा; तिथे शुद्ध हवा असते.',
        'ओल्या रुमालाने नाक व तोंड झाकून घ्या.',
        'दरवाजा उघडण्यापूर्वी हाताने तपासा; गरम असल्यास उघडू नका.',
        'फक्त जिन्याचा वापर करा, लिफ्ट वापरू नका.'
      ];
    } else {
      reply = `🚨 Fire & Smoke Hazard Detected (Urgency: ${triage.urgency})!\nAct immediately according to safety protocols:`;
      cautions = [
        'CRAWL LOW under smoke where oxygen levels are highest.',
        'Cover your nose and mouth with a damp cloth or garment.',
        'Touch doors with the back of your hand before opening. If hot, keep closed and find an alternate exit.',
        'Never take elevators. Use stairwells.'
      ];
    }
  } else if (triage.category === 'Medical') {
    if (lang === 'hi') {
      reply = `🚑 चिकित्सीय आपातकाल (गंभीरता: ${triage.urgency})!\nचिकित्सा दल पहुंचने तक यह प्राथमिक उपचार करें:`;
      cautions = [
        'रक्तस्राव वाले घाव पर साफ कपड़े से सीधा और लगातार दबाव बनाए रखें।',
        'यदि हड्डी नहीं टूटी है तो घायल अंग को दिल के स्तर से ऊपर उठाएं।',
        'घायल व्यक्ति को लिटाएं और शांत रखें; शरीर को गर्म कपड़े से ढकें।',
        'घाव में घुसी हुई किसी नुकीली वस्तु को स्वयं न निकालें।'
      ];
    } else if (lang === 'mr') {
      reply = `🚑 तातडीची वैद्यकीय मदत (तीव्रता: ${triage.urgency})!\nबचाव पथक येईपर्यंत खालील प्रथमोपचार करा:`;
      cautions = [
        'जखमेवर स्वच्छ कापडाने थेट व जोराने सतत दाब द्या.',
        'हाड मोडले नसल्यास जखमेचा भाग हृदयाच्या पातळीपेक्षा उंच ठेवा.',
        'रुग्णाला आडवे झोपवून शांत ठेवा व उबदार पांघरूण घाला.',
        'जखमेत रुतलेली वस्तू स्वतः काढू नका.'
      ];
    } else {
      reply = `🚑 Critical Medical Assistance Detected (Urgency: ${triage.urgency})!\nFollow immediate first-aid protocols while responders mobilize:`;
      cautions = [
        'Apply direct, continuous, firm pressure to the bleeding wound using a clean cloth.',
        'Elevate the injured limb above heart level unless a fracture is suspected.',
        'Keep the patient lying flat, calm, and warm with a blanket to prevent shock.',
        'Do not remove any embedded object — stabilize it in place.'
      ];
    }
  } else {
    // General emergency advice
    if (lang === 'hi') {
      reply = `🛡️ आपकी स्थिति का विश्लेषण कर लिया गया है (प्राथमिकता: ${triage.urgency})।\nसुरक्षा निर्देश:`;
      cautions = [
        'एक सुरक्षित और मजबूत आश्रय में रहें। यदि इमारत क्षतिग्रस्त है तो तुरंत खुले मैदान में जाएं।',
        'मोबाइल बैटरी बचाएं। निरंतर कॉल करने के बजाय टेक्स्ट और रक्षक रिपोर्ट का उपयोग करें।',
        'यदि आपको तत्काल ग्राउंड रेस्क्यू या राशन/दवा की आवश्यकता है, तो नीचे दिए गए बटन से सरकारी अधिकारियों को सूचित करें।'
      ];
    } else if (lang === 'mr') {
      reply = `🛡️ तुमच्या परिस्थितीचे मूल्यांकन केले आहे (प्राधान्य: ${triage.urgency}).\nसुरक्षा सूचना:`;
      cautions = [
        'सुरक्षित जागी थांबा. धोका असल्यास मोकळ्या मैदानात जा.',
        'मोबाईल बॅटरी वाचवा. फक्त आवश्यक मेसेज करा.',
        'मदतीची आवश्यकता असल्यास खालील बटनाद्वारे सरकारी समन्वयकांना कळवा.'
      ];
    } else {
      reply = `🛡️ Situation Triage Evaluated (Priority: ${triage.urgency}).\nFollow these immediate guidance steps:`;
      cautions = [
        'Remain in a secure structural refuge away from glass, exterior walls, and electrical lines.',
        'Conserve mobile battery for essential emergency coordination.',
        'If you require on-ground rescue, volunteer assistance, or medical relief, transmit your triage report below.'
      ];
    }
  }

  return {
    isSafe: false,
    urgency: triage.urgency,
    category: triage.category,
    reply,
    cautions,
    canEscalate: true,
    estimatedPersons: triage.estimatedPersons,
    requiredEquipment: triage.requiredEquipment,
    summary: triage.summary,
    rawQuery: clean
  };
}
