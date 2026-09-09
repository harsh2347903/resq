import React, { useState, useEffect, useRef } from 'react';
import * as Icons from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useSectorLocation } from '../context/LocationContext';
import { useAuth } from '../context/AuthContext';
import { api, getSocket } from '../lib/apiClient';
import { playEmergencyTone } from '../lib/soundUtils';

const STORAGE_KEY = 'rakshak_triage_chat_v2';

const QUICK_PROMPTS = {
  en: [
    { label: '😊 We are safe / Sector check', text: 'We are safe right now, just checking the weather and sector safety status.' },
    { label: '🌊 Flood water rising quickly', text: 'Water is entering our ground floor house and rising fast. What should we do?' },
    { label: '🔥 Fire and heavy smoke', text: 'There is a fire and thick smoke in our building stairwell. How do we escape safely?' },
    { label: '🚑 Severe bleeding / Injury', text: 'Someone has a deep bleeding wound from broken debris, need immediate first-aid guidance.' },
    { label: '🏚️ Earthquake shaking', text: 'Felt severe earthquake tremors and wall has developed cracks, should we stay inside or evacuate?' },
    { label: '🥫 Food & clean water needed', text: 'We have run out of clean drinking water and baby food for 2 days.' }
  ],
  hi: [
    { label: '😊 हम सुरक्षित हैं / स्थिति जांचें', text: 'हम अभी सुरक्षित हैं, बस अपने क्षेत्र की मौसम और सुरक्षा स्थिति जानना चाहते हैं।' },
    { label: '🌊 घर में बाढ़ का पानी घुस रहा है', text: 'हमारे भूतल के घर में पानी घुस रहा है और तेजी से बढ़ रहा है। हमें क्या करना चाहिए?' },
    { label: '🔥 आग और घना धुआं', text: 'सीढ़ियों में आग और भारी जहरीला धुआं भरा है, सुरक्षित कैसे निकलें?' },
    { label: '🚑 गंभीर रक्तस्राव / प्राथमिक उपचार', text: 'एक व्यक्ति के पैर से लगातार खून बह रहा है, तत्काल प्राथमिक उपचार बताएं।' },
    { label: '🏚️ भूकंप और दरारें', text: 'भूकंप के तेज झटके महसूस हुए हैं और दीवार में दरार आ गई है, क्या अंदर रहना सुरक्षित है?' },
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
  const [activeTickets, setActiveTickets] = useState({});
  const [isListening, setIsListening] = useState(false);
  const [speechFeedback, setSpeechFeedback] = useState('');
  const [speakingMsgId, setSpeakingMsgId] = useState(null);
  const [copiedMsgId, setCopiedMsgId] = useState(null);

  const recognitionRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const inputRef = useRef(null);

  const citizenName = session?.name || 'Citizen';
  const locationName = activeLocation ? `${activeLocation.city} (${activeLocation.district || 'Maharashtra'})` : 'Pune City, Maharashtra';

  const getInitialGreeting = (selectedLang) => {
    const time = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    if (selectedLang === 'hi') {
      return {
        id: 'init-hi',
        sender: 'bot',
        timestamp: time,
        text: `नमस्ते ${citizenName}! मैं रक्षक एआई ट्राइएज सहायक हूँ।\n\nमैं आपके क्षेत्र (${locationName}) में 24/7 सक्रिय हूँ। यदि सरकारी अधिकारी या बचाव दल अन्य आपात अभियानों में व्यस्त हैं, तो भी आप मुझसे सीधे बात कर सकते हैं। आप कैसा महसूस कर रहे हैं, या क्या आपको किसी आपातकालीन सावधानी या ग्राउंड रेस्क्यू की आवश्यकता है?`,
        urgency: 'Safe / Normal'
      };
    }
    if (selectedLang === 'mr') {
      return {
        id: 'init-mr',
        sender: 'bot',
        timestamp: time,
        text: `नमस्कार ${citizenName}! मी रक्षक एआय ट्रायज सहाय्यक आहे.\n\nमी तुमच्या कार्यक्षेत्रात (${locationName}) २४/७ उपलब्ध आहे. आपत्कालीन अधिकारी इतर मोहिमांमध्ये व्यस्त असले तरीही तुम्हाला येथे त्वरित मार्गदर्शन मिळेल. तुम्ही कसे आहात? काही अडचण किंवा मदतीची गरज आहे का?`,
        urgency: 'Safe / Normal'
      };
    }
    return {
      id: 'init-en',
      sender: 'bot',
      timestamp: time,
      text: `Hello ${citizenName}! I am Rakshak AI, your 24/7 Disaster Safety & Emergency Triage Assistant.\n\nI am continuously monitoring your sector in ${locationName}. Even when field commanders and dispatchers are handling nearby crises, I am here to assist you instantly with life-saving cautions. How are you feeling right now, or what situation are you facing?`,
      urgency: 'Safe / Normal'
    };
  };

  // Load persisted messages from sessionStorage if available
  const [messages, setMessages] = useState(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (_) {}
    return [getInitialGreeting('en')];
  });

  // Save messages to sessionStorage
  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch (_) {}
  }, [messages]);

  // Auto-scroll ONLY the inner message container (prevents ancestor scrolling)
  const scrollToBottom = () => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTo({
        top: messagesContainerRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  // Clean up speech synthesis on unmount
  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch (_) {}
      }
    };
  }, []);

  // Real Web Speech API - Voice Dictation
  const toggleVoiceInput = () => {
    if (isListening) {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch (_) {}
      }
      setIsListening(false);
      setSpeechFeedback('');
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSpeechFeedback('Voice dictation is not supported in this browser. Please type directly.');
      setTimeout(() => setSpeechFeedback(''), 4000);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = lang === 'hi' ? 'hi-IN' : lang === 'mr' ? 'mr-IN' : 'en-IN';

      recognition.onstart = () => {
        setIsListening(true);
        setSpeechFeedback(lang === 'hi' ? '🎙️ सुन रहा हूँ... बोलिए' : lang === 'mr' ? '🎙️ ऐकत आहे... बोला' : '🎙️ Listening... Speak now');
      };

      recognition.onresult = (event) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        if (transcript) {
          setInputMessage(transcript);
        }
      };

      recognition.onerror = (event) => {
        setIsListening(false);
        if (event.error === 'not-allowed') {
          setSpeechFeedback('Microphone permission blocked. Please allow microphone in browser.');
        } else if (event.error !== 'no-speech') {
          setSpeechFeedback('Voice recognition error. Please type directly.');
        } else {
          setSpeechFeedback('');
        }
        setTimeout(() => setSpeechFeedback(''), 4000);
      };

      recognition.onend = () => {
        setIsListening(false);
        setSpeechFeedback('');
        if (inputRef.current) inputRef.current.focus();
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.warn('Speech recognition failed to start:', err);
      setIsListening(false);
      setSpeechFeedback('Could not start microphone. Please type.');
      setTimeout(() => setSpeechFeedback(''), 3000);
    }
  };

  // Text-to-Speech (Read aloud bot advice)
  const handleToggleSpeak = (msgId, text, cautions = []) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    if (speakingMsgId === msgId) {
      window.speechSynthesis.cancel();
      setSpeakingMsgId(null);
      return;
    }

    window.speechSynthesis.cancel();
    const cautionsText = cautions.length ? ` Key safety cautions: ${cautions.join('. ')}` : '';
    const cleanText = `${text.replace(/[*#]/g, '')}.${cautionsText}`;

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = lang === 'hi' ? 'hi-IN' : lang === 'mr' ? 'mr-IN' : 'en-IN';
    utterance.rate = 0.95;
    utterance.pitch = 1.0;

    utterance.onend = () => setSpeakingMsgId(null);
    utterance.onerror = () => setSpeakingMsgId(null);

    setSpeakingMsgId(msgId);
    window.speechSynthesis.speak(utterance);
  };

  // Copy text to clipboard
  const handleCopy = (msgId, text, cautions = []) => {
    const fullContent = `${text}\n\n${cautions.length ? 'Safety Cautions:\n' + cautions.map((c, i) => `${i + 1}. ${c}`).join('\n') : ''}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(fullContent).then(() => {
        setCopiedMsgId(msgId);
        setTimeout(() => setCopiedMsgId(null), 2200);
      }).catch(() => {});
    }
  };

  // Clear / Reset Chat Session
  const handleResetChat = () => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      setSpeakingMsgId(null);
    }
    const freshGreeting = getInitialGreeting(lang);
    setMessages([freshGreeting]);
    setActiveTickets({});
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch (_) {}
  };

  // Language Change
  const handleLanguageChange = (newLang) => {
    setLang(newLang);
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      setSpeakingMsgId(null);
    }
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

  // Socket listener for real-time NGO Appointment
  useEffect(() => {
    const socket = getSocket();
    if (socket) {
      const handleAssigned = (data) => {
        const reqId = data.requestId || data.id;
        if (reqId) {
          playEmergencyTone('confirm');
          setActiveTickets(prev => {
            return {
              ...prev,
              [reqId]: {
                ...(prev[reqId] || {}),
                id: reqId,
                status: 'Assigned',
                team: data.team || 'Assigned NGO Unit',
                ngoOrg: data.ngoOrg || 'Disaster Response Partner',
                appointedVolunteer: data.appointedVolunteer || null
              }
            };
          });

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
                text: `🔔 OFFICIAL DISPATCH NOTICE FROM DISTRICT COMMAND:\nGovernment Incident Commander has appointed **${data.team || 'Disaster Relief Unit'}** to your Request #${reqId}! Tactical responders are mobilizing to your sector.`,
                urgency: 'Safe / Normal',
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

  // Send message
  const handleSendMessage = async (textToSend) => {
    const text = (textToSend || inputMessage).trim();
    if (!text) return;

    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      setSpeakingMsgId(null);
    }

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
        throw new Error('Empty triage response');
      }
    } catch (err) {
      console.warn('Backend triage chat fallback:', err);
      const normalized = text.toLowerCase();
      let reply = '';
      let cautions = [];
      let urgency = 'Safe / Normal';
      let canEscalate = false;

      if (normalized.includes('happy') || normalized.includes('safe') || normalized.includes('fine') || normalized.includes('good') || normalized.includes('hello')) {
        reply = lang === 'hi'
          ? `यह जानकर बहुत राहत मिली कि आप सुरक्षित और सकुशल हैं! 😊\n\nरक्षक एआई आपके क्षेत्र (${locationName}) की निगरानी कर रहा है। आवश्यकता पड़ने पर तुरंत संदेश भेजें।`
          : lang === 'mr'
          ? `तुम्ही सुरक्षित आहात हे ऐकून खूप बरे वाटले! 😊\n\nरक्षक एआय कार्यक्षेत्रात सतत कार्यरत आहे. अडचण आल्यास नक्की सांगा.`
          : `I am very glad and relieved to hear you are safe! 😊\n\nRakshak AI is monitoring your sector in ${locationName}. If conditions change, feel free to message me anytime.`;
      } else {
        urgency = 'Critical';
        canEscalate = true;
        reply = `⚠️ Urgent Situation Evaluated. Please prioritize life safety cautions:`;
        cautions = [
          'Move to the highest reinforced floor or clear open ground immediately.',
          'Switch off main electrical breakers if safe to do so.',
          'Keep mobile phone charged and do not wade through moving floodwaters.'
        ];
      }

      setMessages(prev => [
        ...prev,
        {
          id: `bot-fb-${Date.now()}`,
          sender: 'bot',
          timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
          text: reply,
          cautions,
          urgency,
          canEscalate,
          triageReport: canEscalate ? {
            category: 'Emergency Distress',
            urgency,
            rawQuery: text
          } : null
        }
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  // Transmit Triage Report to District Command
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

      setMessages(prev => [
        ...prev,
        {
          id: `bot-confirm-${Date.now()}`,
          sender: 'bot',
          timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
          text: `🚨 OFFICIAL AI TRIAGE REPORT TRANSMITTED TO DISTRICT COMMAND!\n\nYour emergency distress file has been delivered to District Operations (Govt Officers & Admins). They are reviewing your coordinates to appoint an accredited NGO rescue unit.`,
          urgency: 'Safe / Normal',
          ticketData: newTicket
        }
      ]);
    } catch (err) {
      console.error('Failed to submit triage report:', err);
      alert('Unable to transmit triage report. Please use the direct Emergency SOS button.');
    } finally {
      setTransmittingTicketId(null);
    }
  };

  return (
    <div className="clean-chat-container">
      {/* Clean Header Bar */}
      <div className="clean-chat-header">
        <div className="clean-chat-status">
          <span className="clean-status-dot" />
          <div>
            <div className="clean-chat-title">
              <Icons.ShieldCheck size={17} style={{ color: '#38bdf8' }} />
              <span>Rakshak AI Triage Assistant</span>
            </div>
            <div className="clean-chat-sub">
              <span>📍 {locationName}</span>
              <span>•</span>
              <span style={{ color: '#4ade80' }}>24/7 Citizen Safety Active</span>
            </div>
          </div>
        </div>

        <div className="clean-chat-controls">
          {/* Language Switcher */}
          <div className="clean-lang-group">
            {[
              { id: 'en', label: 'English' },
              { id: 'hi', label: 'हिंदी' },
              { id: 'mr', label: 'मराठी' }
            ].map(l => (
              <button
                key={l.id}
                type="button"
                className={`clean-lang-btn ${lang === l.id ? 'active' : ''}`}
                onClick={() => handleLanguageChange(l.id)}
              >
                {l.label}
              </button>
            ))}
          </div>

          {/* New Chat Action */}
          <button
            type="button"
            className="clean-header-action-btn"
            onClick={handleResetChat}
            title="Start a new triage session"
          >
            <Icons.RotateCcw size={12} />
            <span>New Session</span>
          </button>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="clean-chat-messages" ref={messagesContainerRef}>
        {messages.map(msg => {
          const isUser = msg.sender === 'user';
          const ticket = msg.ticketData || (msg.triageReport && activeTickets[msg.id]);
          const isSpeakingThis = speakingMsgId === msg.id;

          return (
            <div key={msg.id} className={`clean-msg-row ${isUser ? 'user' : 'bot'}`}>
              <div className={`clean-avatar ${isUser ? 'user' : 'bot'}`}>
                {isUser ? <Icons.User size={16} /> : <Icons.ShieldAlert size={17} />}
              </div>

              <div className="clean-msg-body" style={{ maxWidth: isUser ? '85%' : '88%' }}>
                <div className="clean-msg-meta">
                  {isUser ? `You (${citizenName})` : 'Rakshak AI Specialist'} • {msg.timestamp}
                </div>

                <div className="clean-bubble">
                  {/* Urgency Badge */}
                  {msg.urgency && msg.urgency !== 'Safe / Normal' && (
                    <div>
                      <span className={`clean-urgency-tag ${msg.urgency.toLowerCase()}`}>
                        {msg.urgency === 'Critical' ? '🚨 CRITICAL TRIAGE' : msg.urgency === 'High' ? '⚠️ HIGH PRIORITY' : '🟢 NORMAL SAFETY'}
                      </span>
                    </div>
                  )}

                  {/* Body Text */}
                  <div style={{ whiteSpace: 'pre-line' }}>{msg.text}</div>

                  {/* Caution Steps */}
                  {msg.cautions && msg.cautions.length > 0 && (
                    <div className="clean-cautions-list">
                      {msg.cautions.map((step, idx) => (
                        <div key={idx} className="clean-caution-step">
                          <span className="clean-step-num">0{idx + 1}.</span>
                          <span>{step}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Transmit to Govt Command CTA */}
                  {msg.canEscalate && msg.triageReport && !activeTickets[msg.id] && (
                    <div className="clean-escalate-card">
                      <div className="clean-escalate-title">
                        <Icons.AlertTriangle size={14} />
                        <span>High-Priority Distress Diagnosed · Transmit to District Command</span>
                      </div>
                      <button
                        type="button"
                        className="clean-escalate-btn"
                        onClick={() => handleTransmitReport(msg.triageReport, msg.id)}
                        disabled={transmittingTicketId === msg.id}
                      >
                        {transmittingTicketId === msg.id ? (
                          <>
                            <Icons.Loader size={15} className="spin" /> Transmitting Report to Govt Command...
                          </>
                        ) : (
                          <>
                            <Icons.Send size={15} /> Transmit AI Triage Report & Request NGO Unit
                          </>
                        )}
                      </button>
                    </div>
                  )}

                  {/* Live Ticket Box inside chat */}
                  {(ticket || msg.ticketData) && (
                    <div className="clean-ticket-box">
                      <div className="clean-ticket-header">
                        <span className="clean-ticket-id">
                          🛡️ OFFICIAL TRIAGE TICKET #{ticket?.id || msg.ticketData?.id}
                        </span>
                        <span className={`clean-ticket-badge ${(ticket?.status === 'Assigned' || msg.ticketData?.status === 'Assigned') ? 'assigned' : 'pending'}`}>
                          {(ticket?.status === 'Assigned' || msg.ticketData?.status === 'Assigned') ? '✅ NGO Appointed' : '⏳ Awaiting NGO Appointment'}
                        </span>
                      </div>
                      <div style={{ fontSize: '12px', color: '#cbd5e1' }}>
                        <div>Sector: <b>{locationName}</b></div>
                        <div style={{ marginTop: '3px' }}>
                          Assigned Unit:{' '}
                          <b style={{ color: (ticket?.status === 'Assigned' || msg.ticketData?.status === 'Assigned') ? '#4ade80' : '#fbbf24' }}>
                            {ticket?.team || msg.ticketData?.team || 'District Command Reviewing'}
                          </b>
                        </div>
                        {(ticket?.status === 'Assigned' || msg.ticketData?.status === 'Assigned') && (
                          <div style={{ marginTop: '6px', fontSize: '12px', color: '#86efac', display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <Icons.CheckCircle2 size={14} /> Responders mobilized to coordinates. Keep phone reachable.
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Bubble Action Bar (Audio Readout & Copy) */}
                  {!isUser && (
                    <div className="clean-bubble-actions">
                      <button
                        type="button"
                        className={`clean-action-btn ${isSpeakingThis ? 'speaking' : ''}`}
                        onClick={() => handleToggleSpeak(msg.id, msg.text, msg.cautions)}
                        title={isSpeakingThis ? 'Stop audio' : 'Listen to guidance aloud'}
                      >
                        {isSpeakingThis ? <Icons.Square size={12} /> : <Icons.Volume2 size={12} />}
                        <span>{isSpeakingThis ? 'Stop Voice' : 'Listen Aloud'}</span>
                      </button>

                      <button
                        type="button"
                        className="clean-action-btn"
                        onClick={() => handleCopy(msg.id, msg.text, msg.cautions)}
                        title="Copy text to clipboard"
                      >
                        {copiedMsgId === msg.id ? <Icons.Check size={12} style={{ color: '#4ade80' }} /> : <Icons.Copy size={12} />}
                        <span>{copiedMsgId === msg.id ? 'Copied!' : 'Copy'}</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {/* Typing State */}
        {isTyping && (
          <div className="clean-typing-indicator">
            <Icons.Bot size={15} style={{ color: '#38bdf8' }} />
            <span>Rakshak AI is evaluating sector safety protocol</span>
            <div className="typing-dots">
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
            </div>
          </div>
        )}

      </div>

      {/* Quick Scenario Prompts Bar */}
      <div className="clean-chips-bar">
        {(QUICK_PROMPTS[lang] || QUICK_PROMPTS.en).map((chip, idx) => (
          <button
            key={idx}
            type="button"
            className="clean-chip-btn"
            onClick={() => handleSendMessage(chip.text)}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {/* Bottom Chat Input Form */}
      <form
        className="clean-input-bar"
        onSubmit={(e) => {
          e.preventDefault();
          handleSendMessage();
        }}
      >
        {/* Real Microphone Voice Dictation */}
        <button
          type="button"
          className={`clean-mic-btn ${isListening ? 'active' : ''}`}
          onClick={toggleVoiceInput}
          title={isListening ? 'Stop listening' : 'Dictate with microphone (Speech to Text)'}
        >
          {isListening ? <Icons.MicOff size={19} /> : <Icons.Mic size={19} />}
        </button>

        <input
          ref={inputRef}
          type="text"
          className="clean-chat-input"
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          placeholder={
            speechFeedback || (
              lang === 'hi'
                ? 'अपनी स्थिति बताएं (उदा. "हम सुरक्षित हैं", "बाढ़ का पानी बढ़ रहा है", "चोट लगी है")...'
                : lang === 'mr'
                ? 'तुमची परिस्थिती सांगा (उदा. "आम्ही सुरक्षित आहोत", "पाणी शिरत आहे", "रक्तस्त्राव")...'
                : 'Describe your situation (e.g. "we are safe", "water is rising fast", "severe bleeding")...'
            )
          }
        />

        <button
          type="submit"
          disabled={!inputMessage.trim() || isTyping}
          className="clean-send-btn"
        >
          <span>Send</span>
          <Icons.Send size={14} />
        </button>
      </form>

      {/* Helplines Strip */}
      <div className="clean-helplines-strip">
        <div className="clean-helpline-tags">
          <span>National Emergency: <b>112</b></span>
          <span>Ambulance: <b>108</b></span>
          <span>Disaster Management (NDMA): <b>1078</b></span>
        </div>
        <button
          type="button"
          className="clean-sos-jump-btn"
          onClick={() => navigate('/help')}
        >
          <Icons.Siren size={13} /> Immediate Priority SOS Emergency Line &rarr;
        </button>
      </div>
    </div>
  );
}

export default CitizenAiTriageAssistant;
