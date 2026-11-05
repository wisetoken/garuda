import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import './styles.css';
import { AppProviders } from './lib/wallet';

const root = document.getElementById('root');
if (!root) throw new Error('Garuda root element is missing.');

createRoot(root).render(
  <StrictMode>
    <AppProviders><BrowserRouter>
      <App />
    </BrowserRouter></AppProviders>
  </StrictMode>,
);
