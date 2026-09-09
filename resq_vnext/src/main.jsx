import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import { LocationProvider } from './context/LocationContext.jsx';
import App from './App.jsx';
import './styles.css';
import './crisis.css';

// Initialize theme, crisis state, and density preferences immediately to prevent flash of unthemed content
try {
  const isCrisis = localStorage.getItem('resq_emergency_crisis_active') === 'true';
  const prefs = JSON.parse(localStorage.getItem('resq_interface_preferences_v1') || '{}');
  const theme = isCrisis ? 'crisis' : (prefs.theme || 'dark');
  document.documentElement.dataset.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.dataset.density = prefs.density || 'comfortable';
  if (isCrisis) {
    document.documentElement.dataset.crisis = 'active';
    document.documentElement.classList.add('crisis-mode-active');
  }
} catch {}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <LocationProvider>
          <App />
        </LocationProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);


