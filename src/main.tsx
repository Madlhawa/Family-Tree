import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';
import { useData, useUI } from './store/store';

// Handy for poking at state from the console during development
if (import.meta.env.DEV) Object.assign(window, { __dc: { useData, useUI } });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
