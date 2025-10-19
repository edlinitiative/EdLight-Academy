import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { initI18n } from './utils/i18n';

// Initialize internationalization
initI18n();

// Create root and render app
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);