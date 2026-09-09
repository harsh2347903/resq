import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as Icons from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useSectorLocation } from '../context/LocationContext';
import { useAuth } from '../context/AuthContext';
import { api, getSocket } from '../lib/apiClient';

const QUICK_PROMPTS = {
  en: [
    { label: '😊 We are safe / Check status', text: 'We are safe right now, just checking the situation and our sector status.' },
    { label: '🌊 Flood water entering house', text: 'Water is entering our ground floor house, rising quickly. What should we do?' },
    { label: '🔥 Fire and heavy smoke', text: 'There is a fire and thick smoke in our stairwell. How do we escape safely?' },
    { label: '🚑 Someone bleeding heavily', text: 'A person is bleeding heavily from a leg injury, need immediate first-aid instructions.' },
    { label: '🏚️ Earthquake shaking & cracks', text: 'Felt severe earthquake tremors and wall has developed cracks, are we safe inside?' },
    { label: '🥫 Need food and clean water', text: 'We have run out of clean drinking water and baby food for the last 2 days.' }
  ],
  hi: [
    { label: '😊 हम सुरक्षित हैं / स्थिति जांचें', text: 'हम अभी सुरक्षित हैं, बस अपने क्षेत्र की मौसम और सुरक्षा स्थिति जानना चाहते हैं।' },
    { label: '🌊 घर में बाढ़ का पानी घुस रहा है', text: 'हमारे भूतल के घर में पानी घुस रहा है और तेजी से बढ़ रहा है। हमें क्या करना चाहिए?' },
    { label: '🔥 आग और घना धुआं', text: 'सीढ़ियों में आग और भारी जहरीला धुआं भरा है, सुरक्षित कैसे निकलें?' },
    { label: '🚑 गंभीर रक्तस्राव / चोट', text: 'एक व्यक्ति के पैर से लगातार खून बह रहा है, तत्काल प्राथमिक उपचार बताएं।' },
    { label: '🏚️ भूकंप और दीवार में दरारें', text: 'भूकंप के तेज झटके महसूस हुए हैं और दीवार में दरार आ गई है, क्या अंदर रहना सुरक्षित है?' },
    { label: '🥫 पीने का पानी और राशन चाहिए', text: 'हमारे पास पिछले 2 दिनों से पीने का स्वच्छ पानी और बच्चों का भोजन खत्म हो गया है।' }
  ],
  mr: [
    { label: '😊 आम्ही सुरक्षित आहोत', text: 'आम्ही सध्या सुरक्षित आहोत, फक्त परिसरातील परिस्थिती जाणून घेण्यासाठी विचारत आहोत.' },
    { label: '🌊 घरात पुराचे पाणी शिरत आहे', text: 'घरामध्ये पाणी शिरत असून पातळी वेगाने वाढत आहे, आम्ही काय करावे?' },
    { label: '🔥 आग आणि विषारी धूर', text: 'जिन्यामध्ये आग लागली असून धूर पसरला आहे, बाहेर कसे पडावे?' },
    { label: '🚑 अति रक्तस्त्राव / दुखापत', text: 'एका व्यक्तीला गंभीर दुखापत झाली असून रक्त वाहत आहे, तातडीचे प्रथमोपचार सांगा.' },
    { label: '🏚️ भूकंपाचे धक्के व तडे', text: 'भूकंपाचे धक्के बसले असून भिंतीला तडे गेले आहेत, घरात थांबू की बाहेर पडू?' },
    { label: '🥫 पिण्याचे पाणी व अन्न हवे', text: 'गेल्या दोन दिवसांपासून पिण्याचे स्वच्छ पाणी आणि अन्न संपले आहे, मदत हवी आहे.' }
  ]
};

export function CitizenAiTriageAssistant() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const { activeLocation } = useSectorLocation();
  const [lang, setLang] = useState('en');
  const [inputMessage, setInputMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [transmittingTicketId, setTransmittingTicketId] = useState(null);
  const [activeTickets, setActiveTickets] = useState({}); // ticketId -> ticket object
  const [isListening, setIsListening] = useState(false);

  const citizenName = session?.name || 'Citizen';
  const locationName = activeLocation ? `${activeLocation.city} (${activeLocation.district || 'Maharashtra'})` : 'Pune, Maharashtra';

  // Initial welcome message
  const getInitialGreeting = (selectedLang) => {
    if (selectedLang === 'hi') {
      return {
        id: 'init-hi',
        sender: 'bot',
        timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        text: `नमस्ते ${citizenName}! मैं रक्षक एआई ट्राइएज सहायक हूँ।\n\nमैं आपके क्षेत्र (${locationName}) में 24/7 सक्रिय हूँ। यदि आपातकालीन अधिकारी अन्य बचाव अभियानों में व्यस्त हैं, तो भी आप मुझसे सीधे बात कर सकते हैं। आप कैसा महसूस कर रहे हैं, या क्या आपको किसी आपातकालीन सावधानी या ग्राउंड रेस्क्यू की आवश्यकता है?`,
        urgency: 'Safe / Normal'
      };
    }
    if (selectedLang === 'mr') {
      return {
        id: 'init-mr',
        sender: 'bot',
        timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        text: `नमस्कार ${citizenName}! मी रक्षक एआय ट्रायज सहाय्यक आहे.\n\nमी तुमच्या कार्यक्षेत्रात (${locationName}) २४/७ उपलब्ध आहे. आपत्कालीन अधिकारी इतर मोहिमांमध्ये व्यस्त असले तरीही तुम्हाला येथे त्वरित मार्गदर्शन मिळेल. तुम्ही कसे आहात? काही अडचण किंवा मदतीची गरज आहे का?`,
        urgency: 'Safe / Normal'
      };
    }
    return {
      id: 'init-en',
      sender: 'bot',
      timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      text: `Hello ${citizenName}! I am Rakshak AI, your 24/7 Disaster Safety & Emergency Triage Assistant.\n\nI am continuously monitoring your sector in ${locationName}. Even when field officers and emergency dispatchers are engaged in nearby rescue operations, I am here to assist you instantly. How are you feeling right now, or what situation are you facing?`,
      urgency: 'Safe / Normal'
    };
  };

  const [messages, setMessages] = useState(() => [getInitialGreeting('en')]);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  // Handle language switch
  const handleLanguageChange = (newLang) => {
    setLang(newLang);
    setMessages(prev => [
      ...prev,
      {
        id: `lang-switch-${Date.now()}`,
        sender: 'bot',
        timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        text: newLang === 'hi'
          ? 'भाषा बदलकर हिंदी कर दी गई है। आप अपनी स्थिति हिंदी में बता सकते हैं।'
          : newLang === 'mr'
          ? 'भाषा बदलून मराठी करण्यात आली आहे. आपण मराठीत संवाद साधू शकता.'
          : 'Language switched to English. Feel free to describe your situation or ask safety questions.',
        urgency: 'Safe / Normal'
      }
    ]);
  };

  // Socket listener for when Government Officer / Admin assigns an NGO to this citizen's ticket!
  useEffect(() => {
    const socket = getSocket();
    if (socket) {
      const handleAssigned = (data) => {
        const reqId = data.requestId || data.id;
        if (reqId) {
          setActiveTickets(prev => {
            if (prev[reqId]) {
              return {
                ...prev,
                [reqId]: {
                  ...prev[reqId],
                  status: 'Assigned',
                  team: data.team || 'Assigned NGO Unit',
                  ngoOrg: data.ngoOrg || 'Disaster Response Partner',
                  appointedVolunteer: data.appointedVolunteer || null
                }
              };
            }
            return prev;
          });

          // Also inject a live bot notification in the chat
          setMessages(prev => {
            const alreadyNotified = prev.some(m => m.ticketUpdateId === reqId);
            if (alreadyNotified) return prev;
            return [
              ...prev,
              {
                id: `ticket-notify-${Date.now()}`,
                ticketUpdateId: reqId,
                sender: 'bot',
                timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
                text: `🔔 OFFICIAL UPDATE FROM DISTRICT COMMAND:\nGovernment Incident Commander has appointed **${data.team || 'Disaster Response Team'}** to your Request #${reqId}! The team has been mobilized and is en route to your location.`,
                urgency: 'Dispatched',
                isAssignmentNotice: true
              }
            ];
          });
        }
      };

      socket.on('triage:assigned', handleAssigned);
      socket.on('request:updated', handleAssigned);

      return () => {
        socket.off('triage:assigned', handleAssigned);
        socket.off('request:updated', handleAssigned);
      };
    }
  }, []);

  // Send message to AI Triage Chatbot
  const handleSendMessage = async (textToSend) => {
    const text = (textToSend || inputMessage).trim();
    if (!text) return;

    const userMsg = {
      id: `usr-${Date.now()}`,
      sender: 'user',
      timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      text
    };

    setMessages(prev => [...prev, userMsg]);
    setInputMessage('');
    setIsTyping(true);

    try {
      // Call backend triage chat API
      const res = await api.requests.triageChat(text, lang, locationName);
      const triageResult = res?.result;

      if (triageResult) {
        const botMsg = {
          id: `bot-${Date.now()}`,
          sender: 'bot',
          timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
          text: triageResult.reply,
          cautions: triageResult.cautions || [],
          urgency: triageResult.urgency || 'Safe / Normal',
          canEscalate: triageResult.canEscalate,
          triageReport: triageResult.canEscalate ? {
            category: triageResult.category,
            urgency: triageResult.urgency,
            estimatedPersons: triageResult.estimatedPersons,
            requiredEquipment: triageResult.requiredEquipment,
            summary: triageResult.summary,
            rawQuery: text
          } : null
        };
        setMessages(prev => [...prev, botMsg]);
      } else {
        throw new Error('No triage result returned');
      }
    } catch (err) {
      console.warn('Backend triage error, using local fallback:', err);
      // Local fallback in case network has offline jitter
      const normalized = text.toLowerCase();
      let reply = '';
      let cautions = [];
      let urgency = 'Safe / Normal';
      let canEscalate = false;

      if (normalized.includes('happy') || normalized.includes('safe') || normalized.includes('fine') || normalized.includes('good') || normalized.includes('hello')) {
        reply = lang === 'hi'
          ? `यह जानकर बहुत राहत मिली कि आप सुरक्षित हैं! 😊\n\nरक्षक एआई आपके क्षेत्र (${locationName}) की निगरानी कर रहा है। यदि कभी भी कोई समस्या आए तो मुझे बताएं।`
          : lang === 'mr'
          ? `तुम्ही सुरक्षित आहात हे ऐकून बरे वाटले! 😊\n\nरक्षक एआई सतत कार्यरत आहे. अडचण आल्यास नक्की सांगा.`
          : `I am very glad and relieved to hear you are safe! 😊\n\nRakshak AI is monitoring your sector in ${locationName}. If conditions change, feel free to message me anytime.`;
      } else {
        urgency = 'Critical';
        canEscalate = true;
        reply = `⚠️ Situation evaluated. Please follow immediate emergency caution steps:`;
        cautions = [
          'Move to highest reinforced floor or clear open ground.',
          'Switch off main electricity breaker if safe to do so.',
          'Keep phone charged and avoid wading through water or touching fallen lines.'
        ];
      }

      setMessages(prev => [
        ...prev,
        {
          id: `bot-fallback-${Date.now()}`,
          sender: 'bot',
          timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
          text: reply,
          cautions,
          urgency,
          canEscalate,
          triageReport: canEscalate ? {
            category: 'Emergency Assistance',
            urgency,
            rawQuery: text
          } : null
        }
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  // Submit official AI Triage Report to District Government Command & Request NGO
  const handleTransmitReport = async (report, originalMsgId) => {
    if (!report) return;
    setTransmittingTicketId(originalMsgId);

    try {
      const coords = activeLocation?.coordinates || { lat: 18.5204, lng: 73.8567 };
      const citizen = session?.name || 'Citizen in Sector';
      const phone = session?.phone || '+91 98765 43210';

      const payload = {
        type: `AI Triage: ${report.category || 'Emergency Distress'}`,
        location: locationName,
        coordinates: coords,
        priority: report.urgency || 'High',
        citizen,
        phone,
        details: report.rawQuery || 'Distress reported via Rakshak AI Triage Assistant',
        source: 'ai_triage',
        triage: report
      };

      const res = await api.requests.create(payload);
      const createdRequest = res?.request;
      const ticketId = createdRequest ? createdRequest.id : `TRG-${Date.now().toString().slice(-4)}`;

      // Store in active tickets
      const newTicket = {
        id: ticketId,
        type: payload.type,
        urgency: report.urgency,
        location: locationName,
        status: 'Open',
        team: 'Awaiting NGO Allocation',
        time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
      };

      setActiveTickets(prev => ({
        ...prev,
        [ticketId]: newTicket
      }));

      // Add confirmation bubble from bot
      setMessages(prev => [
        ...prev,
        {
          id: `bot-confirm-${Date.now()}`,
          sender: 'bot',
          timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
          text: `🚨 OFFICIAL AI TRIAGE REPORT TRANSMITTED TO DISTRICT COMMAND!\n\nYour emergency report has been logged with District Operations Center (Govt Officers & Admins). They are currently reviewing your GPS location to appoint an accredited NGO and rescue team.`,
          urgency: 'Transmitted',
          ticketData: newTicket
        }
      ]);
    } catch (err) {
      console.error('Failed to submit triage report:', err);
      alert('Unable to transmit triage report. Please use direct Emergency SOS button.');
    } finally {
      setTransmittingTicketId(null);
    }
  };

  // Simulated Voice Input
  const toggleVoiceInput = () => {
    if (isListening) {
      setIsListening(false);
      return;
    }
    setIsListening(true);
    // Simulate speech-to-text input after 2 seconds
    setTimeout(() => {
      setIsListening(false);
      setInputMessage(lang === 'hi' ? 'हमारे घर में पानी भर रहा है, मदद चाहिए' : lang === 'mr' ? 'पाणी वाढत आहे, तातडीने मदत पाठवा' : 'Water is rising fast in our street, need immediate rescue team');
    }, 2200);
  };

  return (
    <div className="content-stack ai-triage-container" style={{ maxWidth: '980px', margin: '0 auto' }}>
      {/* Top Banner */}
      <div className="glass-panel" style={{ padding: '18px 22px', borderRadius: '16px', border: '1px solid rgba(148, 163, 184, 0.16)', background: 'linear-gradient(135deg, rgba(14, 22, 35, 0.9), rgba(7, 16, 25, 0.95))' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '3px 10px', borderRadius: '20px', background: 'rgba(2, 132, 199, 0.14)', color: '#38bdf8', fontSize: '11px', fontWeight: '700', letterSpacing: '0.06em', marginBottom: '6px' }}>
              <Icons.Bot size={13} /> 24/7 CITIZEN SAFETY & TRIAGE AI
            </div>
            <h2 style={{ fontSize: '22px', fontWeight: '800', color: '#f8fafc', margin: '0 0 4px 0' }}>
              Rakshak AI Triage & Caution Assistant
            </h2>
            <p style={{ margin: 0, color: '#94a3b8', fontSize: '13px', lineHeight: '1.4' }}>
              Instant life-safety guidance and emergency triage when administrative personnel are engaged in nearby field operations.
            </p>
          </div>

          {/* Language Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(15, 23, 42, 0.6)', padding: '4px', borderRadius: '10px', border: '1px solid rgba(148, 163, 184, 0.14)' }}>
            {[
              { id: 'en', label: 'English' },
              { id: 'hi', label: 'हिंदी' },
              { id: 'mr', label: 'मराठी' }
            ].map(l => (
              <button
                key={l.id}
                type="button"
                className="interactive"
                onClick={() => handleLanguageChange(l.id)}
                style={{
                  padding: '5px 11px',
                  borderRadius: '6px',
                  border: 'none',
                  background: lang === l.id ? 'rgba(2, 132, 199, 0.85)' : 'transparent',
                  color: lang === l.id ? '#fff' : '#94a3b8',
                  fontWeight: lang === l.id ? '700' : '500',
                  fontSize: '12px',
                  cursor: 'pointer'
                }}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Chat Dialogue Card */}
      <div className="glass-panel" style={{ borderRadius: '16px', border: '1px solid rgba(148, 163, 184, 0.16)', overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '620px', background: '#090e17' }}>
        
        {/* Chat Header Status Strip */}
        <div style={{ padding: '10px 18px', background: 'rgba(15, 23, 42, 0.8)', borderBottom: '1px solid rgba(148, 163, 184, 0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', color: '#94a3b8' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e', animation: 'pulse 1.5s infinite' }} />
            <span style={{ color: '#e2e8f0', fontWeight: '600' }}>AI Triage Live</span>
            <span>• Sector: <b style={{ color: '#38bdf8' }}>{locationName}</b></span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span>Reports Escalated to: <b style={{ color: '#cbd5e1' }}>District Command & NGOs</b></span>
          </div>
        </div>

        {/* Scrollable Message History */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {messages.map(msg => {
            const isUser = msg.sender === 'user';
            const ticket = msg.ticketData || (msg.triageReport && activeTickets[msg.id]);

            return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                style={{
                  display: 'flex',
                  justifyContent: isUser ? 'flex-end' : 'flex-start',
                  alignItems: 'flex-start',
                  gap: '10px'
                }}
              >
                {!isUser && (
                  <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'linear-gradient(135deg, #0284c7, #0369a1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0, marginTop: '2px' }}>
                    <Icons.ShieldAlert size={16} />
                  </div>
                )}

                <div style={{ maxWidth: '82%' }}>
                  {/* Sender & Timestamp */}
                  <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '4px', textAlign: isUser ? 'right' : 'left' }}>
                    {isUser ? `You (${citizenName})` : 'Rakshak AI Specialist'} • {msg.timestamp}
                  </div>

                  {/* Bubble Content */}
                  <div style={{
                    padding: '12px 16px',
                    borderRadius: isUser ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
                    background: isUser ? '#0284c7' : 'rgba(15, 23, 42, 0.95)',
                    border: isUser ? 'none' : '1px solid rgba(148, 163, 184, 0.16)',
                    color: isUser ? '#fff' : '#f1f5f9',
                    fontSize: '14px',
                    lineHeight: '1.55',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.25)'
                  }}>
                    {/* Urgency Badge if defined */}
                    {msg.urgency && msg.urgency !== 'Safe / Normal' && (
                      <div style={{ marginBottom: '8px' }}>
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontSize: '10px',
                          fontWeight: '800',
                          letterSpacing: '0.04em',
                          background: msg.urgency === 'Critical' ? '#dc2626' : msg.urgency === 'High' ? '#d97706' : '#22c55e',
                          color: '#fff'
                        }}>
                          {msg.urgency.toUpperCase()} TRIAGE
                        </span>
                      </div>
                    )}

                    <div style={{ whiteSpace: 'pre-line' }}>{msg.text}</div>

                    {/* Step-by-Step Cautions */}
                    {msg.cautions && msg.cautions.length > 0 && (
                      <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {msg.cautions.map((step, idx) => (
                          <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', background: 'rgba(0,0,0,0.25)', padding: '8px 10px', borderRadius: '6px', fontSize: '13px' }}>
                            <span style={{ color: '#38bdf8', fontWeight: '800', fontSize: '12px' }}>0{idx + 1}.</span>
                            <span style={{ color: '#e2e8f0' }}>{step}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Transmit to Govt Command CTA */}
                    {msg.canEscalate && msg.triageReport && !activeTickets[msg.id] && (
                      <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                        <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '8px' }}>
                          ⚠️ High-priority distress detected. Transmit this report directly to District Emergency Command so they can appoint an NGO team to your location:
                        </div>
                        <button
                          type="button"
                          className="primary-button interactive"
                          onClick={() => handleTransmitReport(msg.triageReport, msg.id)}
                          disabled={transmittingTicketId === msg.id}
                          style={{
                            width: '100%',
                            padding: '9px 14px',
                            fontSize: '13px',
                            fontWeight: '700',
                            background: '#dc2626',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px'
                          }}
                        >
                          {transmittingTicketId === msg.id ? (
                            <>
                              <Icons.Loader size={14} className="spin" /> Transmitting to District Command...
                            </>
                          ) : (
                            <>
                              <Icons.Send size={14} /> Transmit AI Triage Report to Govt Command & Request NGO
                            </>
                          )}
                        </button>
                      </div>
                    )}

                    {/* Live Ticket Tracker Card inside chat */}
                    {(ticket || (msg.ticketData)) && (
                      <div style={{ marginTop: '12px', padding: '12px 14px', borderRadius: '10px', background: 'rgba(2, 132, 199, 0.1)', border: '1px solid rgba(2, 132, 199, 0.3)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                          <span style={{ fontSize: '11px', fontWeight: '800', color: '#38bdf8', letterSpacing: '0.04em' }}>
                            🛡️ OFFICIAL TRIAGE TICKET #{ticket?.id || msg.ticketData?.id}
                          </span>
                          <span style={{
                            padding: '2px 7px',
                            borderRadius: '10px',
                            fontSize: '11px',
                            fontWeight: '700',
                            background: (ticket?.status === 'Assigned' || msg.ticketData?.status === 'Assigned') ? 'rgba(34, 197, 94, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                            color: (ticket?.status === 'Assigned' || msg.ticketData?.status === 'Assigned') ? '#4ade80' : '#fbbf24'
                          }}>
                            {(ticket?.status === 'Assigned' || msg.ticketData?.status === 'Assigned') ? '✅ NGO Appointed' : '⏳ Awaiting NGO Appointment'}
                          </span>
                        </div>

                        <div style={{ fontSize: '12px', color: '#cbd5e1' }}>
                          <div>Location: <b>{locationName}</b></div>
                          <div style={{ marginTop: '3px' }}>
                            Assigned Unit:{' '}
                            <b style={{ color: (ticket?.status === 'Assigned' || msg.ticketData?.status === 'Assigned') ? '#4ade80' : '#fbbf24' }}>
                              {ticket?.team || msg.ticketData?.team || 'District Command Reviewing'}
                            </b>
                          </div>
                          {(ticket?.status === 'Assigned' || msg.ticketData?.status === 'Assigned') && (
                            <div style={{ marginTop: '6px', fontSize: '12px', color: '#86efac', display: 'flex', alignItems: 'center', gap: '5px' }}>
                              <Icons.CheckCircle2 size={13} /> Field responders dispatched. Keep phone accessible.
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {isUser && (
                  <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0, marginTop: '2px' }}>
                    <Icons.User size={16} />
                  </div>
                )}
              </motion.div>
            );
          })}

          {isTyping && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#94a3b8', fontSize: '13px' }}>
              <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: 'rgba(2, 132, 199, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#38bdf8' }}>
                <Icons.Bot size={15} />
              </div>
              <span>Rakshak AI is evaluating triage protocol...</span>
              <Icons.Loader size={13} className="spin" />
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Quick Scenario Chips */}
        <div style={{ padding: '8px 18px', background: 'rgba(15, 23, 42, 0.7)', borderTop: '1px solid rgba(148, 163, 184, 0.1)', display: 'flex', gap: '8px', overflowX: 'auto', whiteSpace: 'nowrap' }}>
          {(QUICK_PROMPTS[lang] || QUICK_PROMPTS.en).map((chip, idx) => (
            <button
              key={idx}
              type="button"
              className="interactive"
              onClick={() => handleSendMessage(chip.text)}
              style={{
                padding: '5px 11px',
                borderRadius: '16px',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(148, 163, 184, 0.14)',
                color: '#cbd5e1',
                fontSize: '12px',
                cursor: 'pointer',
                flexShrink: 0
              }}
            >
              {chip.label}
            </button>
          ))}
        </div>

        {/* Chat Input Bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          style={{ padding: '14px 18px', background: 'rgba(15, 23, 42, 0.95)', borderTop: '1px solid rgba(148, 163, 184, 0.15)', display: 'flex', alignItems: 'center', gap: '10px' }}
        >
          {/* Voice Input Toggle */}
          <button
            type="button"
            className="interactive"
            onClick={toggleVoiceInput}
            title={isListening ? 'Listening...' : 'Speak emergency description'}
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '8px',
              background: isListening ? 'rgba(220, 38, 38, 0.25)' : 'rgba(255,255,255,0.06)',
              border: isListening ? '1px solid #ef4444' : '1px solid rgba(148, 163, 184, 0.15)',
              color: isListening ? '#ef4444' : '#94a3b8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
          >
            <Icons.Mic size={17} className={isListening ? 'pulse' : ''} />
          </button>

          <input
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            placeholder={
              lang === 'hi'
                ? 'अपनी स्थिति बताएं या प्रश्न पूछें (उदा. हम सुरक्षित हैं, पानी बढ़ रहा है, चोट लगी है)...'
                : lang === 'mr'
                ? 'तुमची समस्या किंवा प्रश्न विचारा (उदा. आम्ही सुरक्षित आहोत, घरात पाणी आले आहे)...'
                : 'Describe your situation or ask safety questions (e.g. "we are safe", "water rising", "trauma")...'
            }
            style={{
              flex: 1,
              padding: '10px 14px',
              borderRadius: '8px',
              background: 'rgba(0, 0, 0, 0.35)',
              border: '1px solid rgba(148, 163, 184, 0.2)',
              color: '#f8fafc',
              fontSize: '13px',
              outline: 'none'
            }}
          />

          <button
            type="submit"
            disabled={!inputMessage.trim()}
            className="primary-button interactive"
            style={{
              padding: '9px 16px',
              fontSize: '13px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              opacity: inputMessage.trim() ? 1 : 0.5
            }}
          >
            <span>Send</span>
            <Icons.Send size={14} />
          </button>
        </form>
      </div>

      {/* Safety Helplines Strip */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', padding: '10px 16px', borderRadius: '10px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', fontSize: '12px', color: '#94a3b8' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span>National Emergency: <b style={{ color: '#f8fafc' }}>112</b></span>
          <span>Ambulance: <b style={{ color: '#f8fafc' }}>108</b></span>
          <span>Disaster Management (NDMA): <b style={{ color: '#f8fafc' }}>1078</b></span>
        </div>
        <div>
          <button
            type="button"
            className="interactive"
            onClick={() => navigate('/help')}
            style={{ background: 'none', border: 'none', color: '#ef4444', fontWeight: '700', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
          >
            <Icons.Siren size={13} /> Immediate Priority SOS Escalation &rarr;
          </button>
        </div>
      </div>
    </div>
  );
}
export default CitizenAiTriageAssistant;
