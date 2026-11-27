import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { ensureEntryMetadata } from './lib/journal';
import { startAutoSync } from './lib/autoSync';
import { moveOldTodoList } from './lib/sprout';
import './index.css';

registerSW({ immediate: true });

// Give any older entry a createdAt/updatedAt if it's missing one (changes nothing else).
ensureEntryMetadata().catch(() => undefined);

// To-dos live on Daily Sprout now: the old My Life "To do" list's items move onto today (nothing is lost).
moveOldTodoList().catch(() => undefined);

// Signed in? Quietly merge the cloud backup in once per session, then back up after changes and on close
// (never a popup; see lib/autoSync.ts). Guest mode: does nothing.
startAutoSync();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
