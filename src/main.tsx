import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { LanguageProvider } from './i18n/LanguageContext';
import App from './ui/App';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element not found');

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <LanguageProvider>
      <App />
    </LanguageProvider>
  </React.StrictMode>,
);
