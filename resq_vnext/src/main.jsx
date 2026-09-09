import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import App from './App.jsx';
import './styles.css';

// Initialize theme and density preferences immediately to prevent flash of unthemed content
try {
  const prefs = JSON.parse(localStorage.getItem('resq_interface_preferences_v1') || '{}');
  document.documentElement.dataset.theme = prefs.theme || 'dark';
  document.documentElement.dataset.density = prefs.density || 'comfortable';
} catch {}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);

