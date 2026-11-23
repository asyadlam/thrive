import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { ensureEntryMetadata } from './lib/journal';
import { autoCloudBackup, cloudAvailable } from './lib/cloud';
import './index.css';

registerSW({ immediate: true });

// Give any older entry a createdAt/updatedAt if it's missing one (changes nothing else).
ensureEntryMetadata().catch(() => undefined);

// Logged in? Quietly back up to the cloud once a day when the app opens (never a popup; see lib/cloud.ts).
if (cloudAvailable()) window.setTimeout(() => void autoCloudBackup(), 4000);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
