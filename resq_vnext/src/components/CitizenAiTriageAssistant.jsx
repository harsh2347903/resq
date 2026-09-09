import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as Icons from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useSectorLocation } from '../context/LocationContext';

// Multilingual Disaster Caution Knowledge Base
const TRIAGE_KNOWLEDGE = {
  en: {
    badge: 'AUTOMATED 24/7 DISASTER TRIAGE ACTIVE',
    officerStatus: 'Field Officers & EOC Responders Currently Handling High-Priority Rescue Operations in Nearby Sectors',
    reassurance: 'If an emergency coordinator is not immediately available to answer your call, follow these verified disaster safety protocols to protect yourself and your family until ground units arrive.',
    searchPlaceholder: 'Describe your emergency (e.g. water entering house, someone bleeding, smell of gas, trapped in room)...',
    quickScenariosTitle: 'INSTANT DISASTER CAUTION & SAFETY PROTOCOLS',
    aiResponseTitle: 'AI Triage Safety Assessment & Caution Steps',
    sosCta: 'Escalate to Live Emergency Dispatch (SOS)',
    langLabel: 'Language',
    scenarios: [
      {
        id: 'flood',
        title: 'Flash Flood & Water Rising',
        icon: Icons.Waves,
        severity: 'Critical',
        color: '#0284c7',
        cautions: [
          'Switch OFF the main electrical breaker immediately if safe to reach.',
          'Move to the top floor or reinforced terrace. Take dry food, bottled water, flashlight, and ID docs.',
          'NEVER walk, swim, or drive through moving flood water — 15cm of flowing water can knock you down.',
          'If water enters the room, stand on sturdy furniture; do not touch metal window grilles or wiring.'
        ]
      },
      {
        id: 'earthquake',
        title: 'Earthquake & Tremors',
        icon: Icons.Activity,
        severity: 'High',
        color: '#d97706',
        cautions: [
          'DROP, COVER, and HOLD ON under a sturdy desk or table. Protect your head and neck.',
          'Stay away from glass windows, unanchored bookcases, mirrors, and ceiling fans.',
          'If outdoors, move to an open area away from electrical poles, brick walls, and flyovers.',
          'Smell for gas before turning on any light switches or matches — gas leaks cause post-quake fires.'
        ]
      },
      {
        id: 'fire',
        title: 'Building Fire & Dense Smoke',
        icon: Icons.Flame,
        severity: 'Critical',
        color: '#dc2626',
        cautions: [
          'CRAWL LOW under smoke where oxygen levels are highest. Inhaling smoke causes unconsciousness in 2 minutes.',
          'Cover your mouth and nose with a damp cloth or towel.',
          'Feel doors with the back of your hand before turning handles. If warm, DO NOT open — find alternate exit.',
          'Never take the elevator. Use stairwells. If trapped, seal door cracks with wet cloth and signal from window.'
        ]
      },
      {
        id: 'heatwave',
        title: 'Severe Heatwave & Sunstroke',
        icon: Icons.SunMedium,
        severity: 'Elevated',
        color: '#ea580c',
        cautions: [
          'Move the affected person immediately into deep shade or an air-ventilated indoor space.',
          'Administer ORS, electrolyte water, or salted lemon water. Avoid cold sugary drinks.',
          'Apply wet, cool towels to the neck, armpits, and groin where major blood vessels pass.',
          'If the person stops sweating, has red burning skin, or loses consciousness, dial 108 immediately for heatstroke.'
        ]
      },
      {
        id: 'electrical',
        title: 'Downed Power Lines & Sparking',
        icon: Icons.Zap,
        severity: 'Critical',
        color: '#eab308',
        cautions: [
          'Maintain a MINIMUM distance of 10 meters (33 feet) from fallen cables or sparking transformers.',
          'Do NOT walk through wet puddles near down wires. If near, shuffle your feet together without lifting them.',
          'Never touch a person who is in contact with live wire; use a dry wooden broomstick or rubber object.',
          'Call State Electricity Dispatch (1912) and Civil Emergency (112) immediately.'
        ]
      },
      {
        id: 'trauma',
        title: 'Severe Bleeding & First Aid',
        icon: Icons.HeartPulse,
        severity: 'Critical',
        color: '#e11d48',
        cautions: [
          'Apply DIRECT, FIRM, CONTINUOUS pressure directly on the wound using a clean cloth or sterile dressing.',
          'Elevate the bleeding limb above heart level unless you suspect broken bones.',
          'Keep the injured person lying flat, calm, and covered with a blanket to treat surgical shock.',
          'DO NOT remove any impaled object (glass, metal rod) — stabilize it in place with rolled cloth bandages.'
        ]
      }
    ]
  },
  hi: {
    badge: '24/7 स्वचालित आपदा ट्राइएज प्रणाली सक्रिय',
    officerStatus: 'फील्ड अधिकारी और सरकारी रिस्पॉन्डर्स वर्तमान में पास के क्षेत्रों में उच्च प्राथमिकता वाले बचाव कार्य में व्यस्त हैं',
    reassurance: 'यदि कोई आपातकालीन अधिकारी आपकी कॉल का तुरंत उत्तर देने के लिए उपलब्ध नहीं है, तो ग्राउंड टीम के पहुंचने तक अपनी और अपने परिवार की सुरक्षा के लिए इन प्रमाणित आपदा सावधानियों का पालन करें।',
    searchPlaceholder: 'अपनी स्थिति का विवरण दें (उदा. घर में पानी घुस रहा है, चोट लगी है, गैस की गंध, फंसे हुए हैं)...',
    quickScenariosTitle: 'त्वरित आपदा सुरक्षा प्रोटोकॉल एवं सावधानियां',
    aiResponseTitle: 'एआई ट्राइएज सुरक्षा मूल्यांकन एवं निर्देश',
    sosCta: 'आपातकालीन राहत बल (SOS) को सूचित करें',
    langLabel: 'भाषा',
    scenarios: [
      {
        id: 'flood',
        title: 'अचानक बाढ़ और बढ़ता जलस्तर',
        icon: Icons.Waves,
        severity: 'अति गंभीर',
        color: '#0284c7',
        cautions: [
          'यदि सुरक्षित रूप से पहुंच सकते हैं तो तुरंत मुख्य बिजली बोर्ड (मेन स्विच) बंद करें।',
          'घर की सबसे ऊपरी मंजिल या पक्की छत पर जाएं। साथ में सूखा भोजन, पानी, टॉर्च और दस्तावेज रखें।',
          'बहते पानी में कभी न चलें या गाड़ी न चलाएं - केवल 15 सेमी बहता पानी आपको गिरा सकता है।',
          'पानी में डूबे तारों या धातु की खिड़कियों को बिल्कुल न छुएं।'
        ]
      },
      {
        id: 'earthquake',
        title: 'भूकंप के झटके और दीवार में दरारें',
        icon: Icons.Activity,
        severity: 'गंभीर',
        color: '#d97706',
        cautions: [
          'मजबूत मेज या बिस्तर के नीचे झुकें (ड्रॉप, कवर, होल्ड)। अपने सिर और गर्दन को ढकें।',
          'कांच की खिड़कियों, अलमारियों और पंखों से दूर रहें।',
          'यदि बाहर हैं, तो बिजली के खंभों, इमारतों और पेड़ों से दूर खुले मैदान में जाएं।',
          'भूकंप के बाद माचिस या बिजली का स्विच न जलाएं, पहले गैस रिसाव की जांच करें।'
        ]
      },
      {
        id: 'fire',
        title: 'आग और घना जहरीला धुआं',
        icon: Icons.Flame,
        severity: 'अति गंभीर',
        color: '#dc2626',
        cautions: [
          'धुएं से बचने के लिए फर्श पर रेंगते हुए बाहर निकलें। जमीन के पास साफ हवा होती है।',
          'मुंह और नाक को गीले कपड़े या रुमाल से ढकें।',
          'दरवाजा खोलने से पहले हाथ के पिछले हिस्से से उसे छुएं। यदि गर्म है तो न खोलें।',
          'लिफ्ट का उपयोग कभी न करें। केवल सीढ़ियों का उपयोग करें।'
        ]
      },
      {
        id: 'heatwave',
        title: 'भीषण गर्मी और लू (सनस्ट्रोक)',
        icon: Icons.SunMedium,
        severity: 'मध्यम',
        color: '#ea580c',
        cautions: [
          'मरीज को तुरंत किसी ठंडी, छायादार और हवादार जगह पर ले जाएं।',
          'ओआरएस (ORS), नींबू पानी या नमक मिला छाछ पिलाएं। अधिक ठंडा पानी न दें।',
          'गर्दन, बगलों और माथे पर ठंडे गीले कपड़े की पट्टियां रखें।',
          'यदि मरीज पसीना बंद कर दे या बेहोश हो जाए, तो तुरंत 108 पर एम्बुलेंस बुलाएं।'
        ]
      },
      {
        id: 'electrical',
        title: 'टूटे बिजली के तार व स्पार्किंग',
        icon: Icons.Zap,
        severity: 'अति गंभीर',
        color: '#eab308',
        cautions: [
          'टूटे हुए तार या ट्रांसफार्मर से कम से कम 10 मीटर (33 फीट) की दूरी बनाए रखें।',
          'तार के पास पानी के गड्ढों में कदम न रखें। दोनों पैरों को मिलाकर कूदते हुए दूर जाएं।',
          'करंट लगे व्यक्ति को सीधे न छुएं; सूखी लकड़ी या रबर की वस्तु का प्रयोग करें।',
          'तुरंत बिजली विभाग (1912) और आपातकालीन 112 पर सूचना दें।'
        ]
      },
      {
        id: 'trauma',
        title: 'गंभीर रक्तस्राव और प्राथमिक चिकित्सा',
        icon: Icons.HeartPulse,
        severity: 'अति गंभीर',
        color: '#e11d48',
        cautions: [
          'साफ कपड़े या पट्टी से घाव पर सीधा, लगातार दबाव बनाएं।',
          'यदि हड्डी नहीं टूटी है, तो खून बहने वाले अंग को दिल के स्तर से ऊपर उठाएं।',
          'घायल व्यक्ति को लिटाकर रखें और कंबल से ढकें ताकि शॉक से बचाया जा सके।',
          'घाव में फंसी हुई नुकीली वस्तु (कांच, कील) को खुद निकालने की कोशिश न करें।'
        ]
      }
    ]
  },
  mr: {
    badge: '२४/७ स्वयंचलित आपत्ती ट्रायज प्रणाली सक्रिय',
    officerStatus: 'फील्ड अधिकारी आणि सरकारी पथके सध्या जवळच्या भागात अति-तातडीच्या बचाव कार्यात व्यस्त आहेत',
    reassurance: 'आपत्ती काळात अधिकारी उपलब्ध नसल्यास, प्रत्यक्ष मदत पोहोचेपर्यंत स्वतःचे व कुटुंबाचे रक्षण करण्यासाठी या अधिकृत सुरक्षा सूचनांचा त्वरित अवलंब करा.',
    searchPlaceholder: 'तुमची समस्या सांगा (उदा. घरात पाणी भरले आहे, रक्तस्त्राव होत आहे, धूर दिसत आहे)...',
    quickScenariosTitle: 'तातडीचे आपत्ती सुरक्षा नियम आणि सावधगिरी',
    aiResponseTitle: 'एआय ट्रायज सुरक्षा मूल्यांकन व कृती',
    sosCta: 'तातडीच्या बचाव पथकाला (SOS) पाठवा',
    langLabel: 'भाषा',
    scenarios: [
      {
        id: 'flood',
        title: 'अचानक महापूर व पाण्याची पातळी वाढणे',
        icon: Icons.Waves,
        severity: 'अति तातडीचे',
        color: '#0284c7',
        cautions: [
          'शक्य असल्यास त्वरित घराचा मुख्य वीज पुरवठा (मेन स्विच) बंद करा.',
          'इमारतीच्या सर्वात वरच्या मजल्यावर किंवा गच्चीवर जा. सोबत कोरडे अन्न, पाणी व टॉर्च घ्या.',
          'वाहत्या पाण्यातून पायी किंवा गाडीने जाण्याचा प्रयत्न करू नका; १५ सेमी पाण्यात तोल जाऊ शकतो.',
          'पाण्यात बुडालेल्या विजेच्या उपकरणांना किंवा पत्र्यांना अजिबात हात लावू नका.'
        ]
      },
      {
        id: 'earthquake',
        title: 'भूकंपाचे धक्के व भिंतींना तडे',
        icon: Icons.Activity,
        severity: 'गंभीर',
        color: '#d97706',
        cautions: [
          'मजबूत टेबलाखाली बसा, डोके व मान झाका आणि घट्ट धरून ठेवा (Drop, Cover, Hold).',
          'काचेच्या खिडक्या, कपाटे आणि जड वस्तूंपासून दूर राहा.',
          'घराबाहेर असल्यास झाडे, विजेचे खांब आणि इमारतींपासून लांब उघड्या मैदानावर जा.',
          'भूकंपानंतर गॅस गळती तपासल्याशिवाय विजेचे बटण किंवा काडेपेटी पेटवू नका.'
        ]
      },
      {
        id: 'fire',
        title: 'आग आणि विषारी धूर',
        icon: Icons.Flame,
        severity: 'अति तातडीचे',
        color: '#dc2626',
        cautions: [
          'धूर असल्यास जमिनीवर रांगत बाहेर पडा; जमिनीलगत शुद्ध हवा असते.',
          'नाक आणि तोंडावर ओला रुमाल किंवा कापड घट्ट धरा.',
          'दरवाजा उघडण्यापूर्वी हाताच्या मागच्या भागाने तपासा; दरवाजा गरम असल्यास उघडू नका.',
          'लिफ्टचा वापर मुळीच करू नका; फक्त जिन्याचा वापर करा.'
        ]
      },
      {
        id: 'heatwave',
        title: 'उष्माघात व तीव्र उन्हाची लाट',
        icon: Icons.SunMedium,
        severity: 'मध्यम',
        color: '#ea580c',
        cautions: [
          'बाधित व्यक्तीला लगेच थंड आणि सावलीच्या ठिकाणी हलवा.',
          'ओआरएस (ORS), लिंबू सरबत किंवा ताक द्या. बर्फाचे अति थंड पाणी देऊ नका.',
          'मान, कपाळ आणि काखेत ओल्या थंड पाण्याच्या पट्ट्या ठेवा.',
          'व्यक्ती बेशुद्ध झाल्यास किंवा घाम येणे बंद झाल्यास तात्काळ १०८ वर कॉल करा.'
        ]
      },
      {
        id: 'electrical',
        title: 'तुटलेली वीजतार व शॉर्ट सर्किट',
        icon: Icons.Zap,
        severity: 'अति तातडीचे',
        color: '#eab308',
        cautions: [
          'तुटलेल्या विजेच्या तारेपासून किमान १० मीटर (३० फूट) सुरक्षित अंतर ठेवा.',
          'तारेजवळ पाणी साचले असल्यास पाय जमिनीवरून न उचलता दोन्ही पाय एकत्र ठेवून उड्या मारत लांब जा.',
          'शॉक लागलेल्या व्यक्तीला हाताने स्पर्श करू नका; कोरडी लाकडी काठी वापरा.',
          'तातडीने महावितरण (१९१२) आणि ११२ वर संपर्क करा.'
        ]
      },
      {
        id: 'trauma',
        title: 'रक्तस्त्राव आणि प्रथमोपचार',
        icon: Icons.HeartPulse,
        severity: 'अति तातडीचे',
        color: '#e11d48',
        cautions: [
          'जखमेवर स्वच्छ कापडाने थेट व जोरात सतत दाब द्या.',
          'हाड मोडलेले नसल्यास जखम झालेला हात/पाय हृदयाच्या पातळीपेक्षा उंच ठेवा.',
          'रुग्णाला आडवे झोपवून उबदार पांघरूण घाला जेणेकरून शॉक बसणार नाही.',
          'जखमेत रुतलेली वस्तू (काच, लोखंड) स्वतः काढण्याचा प्रयत्न करू नका.'
        ]
      }
    ]
  }
};

export function CitizenAiTriageAssistant() {
  const navigate = useNavigate();
  const { activeLocation } = useSectorLocation();
  const [lang, setLang] = useState('en');
  const [selectedScenario, setSelectedScenario] = useState(null);
  const [customQuery, setCustomQuery] = useState('');
  const [aiResult, setAiResult] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);

  const t = TRIAGE_KNOWLEDGE[lang] || TRIAGE_KNOWLEDGE.en;

  const handleAnalyzeQuery = (e) => {
    e?.preventDefault();
    const query = customQuery.trim().toLowerCase();
    if (!query) return;

    setAnalyzing(true);
    setTimeout(() => {
      let matchedScenario = null;
      let severity = 'Elevated';
      let title = 'General Emergency Caution';
      let steps = [];

      if (query.includes('flood') || query.includes('water') || query.includes('पानी') || query.includes('पूर') || query.includes('inundat') || query.includes('drown') || query.includes('boat')) {
        matchedScenario = 'flood';
        severity = 'Critical';
        title = lang === 'hi' ? 'बाढ़ और जलभराव के लिए तत्काल सावधानियां' : lang === 'mr' ? 'पुराच्या पाण्यापासून संरक्षणासाठी तातडीचे नियम' : 'Flash Flood Life-Safety Instructions';
        steps = t.scenarios.find(s => s.id === 'flood')?.cautions || [];
      } else if (query.includes('quake') || query.includes('shake') || query.includes('tremor') || query.includes('भूकंप') || query.includes('crack') || query.includes('collapse') || query.includes('तडे')) {
        matchedScenario = 'earthquake';
        severity = 'High';
        title = lang === 'hi' ? 'भूकंप एवं संरचनात्मक क्षति निर्देश' : lang === 'mr' ? 'भूकंप सुरक्षा व पडझड प्रतिबंधक सूचना' : 'Earthquake & Structural Integrity Guidance';
        steps = t.scenarios.find(s => s.id === 'earthquake')?.cautions || [];
      } else if (query.includes('fire') || query.includes('smoke') || query.includes('आग') || query.includes('धुआं') || query.includes('धूर') || query.includes('burn') || query.includes('flame')) {
        matchedScenario = 'fire';
        severity = 'Critical';
        title = lang === 'hi' ? 'आग और धुएं से जीवन रक्षा निर्देश' : lang === 'mr' ? 'आग व विषारी धूर सुरक्षा कृती' : 'Building Fire & Smoke Evacuation Protocol';
        steps = t.scenarios.find(s => s.id === 'fire')?.cautions || [];
      } else if (query.includes('blood') || query.includes('bleed') || query.includes('रक्त') || query.includes('चोट') || query.includes('जखम') || query.includes('fracture') || query.includes('cut') || query.includes('pain')) {
        matchedScenario = 'trauma';
        severity = 'Critical';
        title = lang === 'hi' ? 'रक्तस्राव एवं प्राथमिक उपचार निर्देश' : lang === 'mr' ? 'तातडीचे प्रथमोपचार व रक्तस्त्राव नियंत्रण' : 'Trauma & Direct Hemorrhage First Aid';
        steps = t.scenarios.find(s => s.id === 'trauma')?.cautions || [];
      } else if (query.includes('electric') || query.includes('shock') || query.includes('spark') || query.includes('बिजली') || query.includes('वीज') || query.includes('wire') || query.includes('cable')) {
        matchedScenario = 'electrical';
        severity = 'Critical';
        title = lang === 'hi' ? 'विद्युत खतरे एवं टूटे तारों से बचाव' : lang === 'mr' ? 'विद्युत धोका व तुटलेल्या तारांपासून संरक्षण' : 'Electrical Hazard & High-Voltage Isolation';
        steps = t.scenarios.find(s => s.id === 'electrical')?.cautions || [];
      } else {
        severity = 'Elevated';
        title = lang === 'hi' ? 'तत्काल नागरिक सुरक्षा परामर्श' : lang === 'mr' ? 'तातडीची नागरी सुरक्षा नियमावली' : 'Emergency Triage Advisory';
        steps = [
          lang === 'hi' ? 'सुरक्षित और सूखे स्थान पर रहें। यदि भवन क्षतिग्रस्त है तो बाहर खुले मैदान में जाएं।' : lang === 'mr' ? 'सुरक्षित जागी राहा. इमारतीला धोका असल्यास मोकळ्या मैदानात जा.' : 'Remain in a secure structural refuge. If building is compromised, safely move to an open clear ground.',
          lang === 'hi' ? 'मोबाइल की बैटरी बचाएं; अनावश्यक कॉल करने के बजाय टेक्स्ट मैसेज और रक्षक एसओएस (SOS) का उपयोग करें।' : lang === 'mr' ? 'मोबाईल बॅटरी वाचवा. अनावश्यक कॉल टाळून रक्षक ॲपद्वारे मदत मागा.' : 'Conserve phone battery. Use text and Rakshak SOS signals instead of continuous calls.',
          lang === 'hi' ? 'सरकारी आपातकालीन नंबर 112 या स्वास्थ्य सेवा 108 पर संपर्क स्थापित रखें।' : lang === 'mr' ? 'आपत्कालीन हेल्पलाईन ११२ किंवा १०८ शी संपर्कात राहा.' : 'Keep emergency dispatch lines (112 / 108) ready on your keypad.'
        ];
      }

      setAiResult({
        query: customQuery,
        severity,
        title,
        steps,
        scenarioId: matchedScenario
      });
      setAnalyzing(false);
    }, 300);
  };

  return (
    <div className="citizen-ai-triage-card glass-panel">
      {/* Top Fallback Alert Ribbon */}
      <div className="triage-officer-status-banner">
        <div className="status-badge-cluster">
          <span className="live-pulse-amber"/>
          <strong className="status-badge-text">{t.badge}</strong>
        </div>
        <div className="status-desc-text">
          <Icons.ShieldAlert size={16} className="status-shield-ico"/>
          <span>{t.officerStatus}</span>
        </div>
        <div className="triage-lang-switch">
          <button
            type="button"
            className={`lang-btn ${lang === 'en' ? 'active' : ''}`}
            onClick={() => setLang('en')}
          >
            ENG
          </button>
          <button
            type="button"
            className={`lang-btn ${lang === 'hi' ? 'active' : ''}`}
            onClick={() => setLang('hi')}
          >
            हिंदी
          </button>
          <button
            type="button"
            className={`lang-btn ${lang === 'mr' ? 'active' : ''}`}
            onClick={() => setLang('mr')}
          >
            मराठी
          </button>
        </div>
      </div>

      <div className="triage-reassurance-note">
        <Icons.Info size={15}/>
        <p>{t.reassurance}</p>
      </div>

      {/* Natural Language Query Box */}
      <form className="triage-query-form" onSubmit={handleAnalyzeQuery}>
        <div className="query-input-shell">
          <Icons.Sparkles size={18} className="query-sparkle-ico"/>
          <input
            type="text"
            className="triage-query-input"
            value={customQuery}
            onChange={(e) => setCustomQuery(e.target.value)}
            placeholder={t.searchPlaceholder}
          />
          <button
            type="submit"
            className="triage-analyze-btn"
            disabled={analyzing || !customQuery.trim()}
          >
            {analyzing ? <Icons.RotateCw size={15} className="spin-slow"/> : <Icons.Send size={15}/>}
            <span>{analyzing ? 'Evaluating...' : 'Ask Rakshak AI'}</span>
          </button>
        </div>
      </form>

      {/* AI Dynamic Assessment Result */}
      <AnimatePresence>
        {aiResult && (
          <motion.div
            className="triage-ai-result-panel"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            <div className="result-head">
              <div className="result-title-wrap">
                <span className={`severity-tag tag-${aiResult.severity.toLowerCase()}`}>
                  {aiResult.severity} PRIORITY
                </span>
                <h4>{aiResult.title}</h4>
              </div>
              <button
                type="button"
                className="result-close-btn"
                onClick={() => setAiResult(null)}
              >
                <Icons.X size={14}/>
              </button>
            </div>

            <div className="result-cautions-list">
              {aiResult.steps.map((step, idx) => (
                <div className="caution-item" key={idx}>
                  <span className="step-num">0{idx + 1}</span>
                  <p>{step}</p>
                </div>
              ))}
            </div>

            <div className="result-actions-row">
              <button
                type="button"
                className="triage-sos-escalate-btn"
                onClick={() => navigate('/help')}
              >
                <Icons.Siren size={16}/>
                <span>{t.sosCta}</span>
                <Icons.ArrowRight size={14}/>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 6 Core Disaster Caution Scenarios Grid */}
      <div className="triage-scenarios-section">
        <div className="section-title-strip">
          <Icons.CheckCircle2 size={15}/>
          <span>{t.quickScenariosTitle} ({activeLocation.district} SECTOR)</span>
        </div>

        <div className="scenarios-grid">
          {t.scenarios.map((sc) => {
            const Icon = sc.icon;
            const isSelected = selectedScenario === sc.id;
            return (
              <div
                key={sc.id}
                className={`scenario-card ${isSelected ? 'selected' : ''}`}
                onClick={() => setSelectedScenario(isSelected ? null : sc.id)}
              >
                <div className="scenario-card-header">
                  <div className="scenario-icon-wrap" style={{ color: sc.color, background: `${sc.color}18` }}>
                    <Icon size={18}/>
                  </div>
                  <div className="scenario-meta">
                    <strong>{sc.title}</strong>
                    <span className="scenario-severity">{sc.severity}</span>
                  </div>
                  <Icons.ChevronDown
                    size={16}
                    className={`scenario-chevron ${isSelected ? 'rotated' : ''}`}
                  />
                </div>

                <AnimatePresence>
                  {isSelected && (
                    <motion.div
                      className="scenario-expanded-cautions"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <ul className="scenario-checklist">
                        {sc.cautions.map((c, i) => (
                          <li key={i}>
                            <span className="bullet-indicator">✓</span>
                            <span>{c}</span>
                          </li>
                        ))}
                      </ul>
                      <button
                        type="button"
                        className="scenario-request-sos-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate('/help');
                        }}
                      >
                        <Icons.AlertTriangle size={14}/>
                        <span>Report Urgent Distress in {sc.title}</span>
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default CitizenAiTriageAssistant;
