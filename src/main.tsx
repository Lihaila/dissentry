import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { initPersistence } from './lib/persistence';
import { detectProxy } from './lib/providers';
import './index.css';

void detectProxy()
  .then(() => initPersistence())
  .finally(() => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  });
