import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { applyPairingFromUrl } from './lib/settings.js';
import './index.css';

// One-command pairing (`course-professor studio`): read bridge/token from the URL hash, save them
// as settings and clean the address bar before the app renders.
applyPairingFromUrl();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
