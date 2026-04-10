import { registerSW } from 'virtual:pwa-register';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
