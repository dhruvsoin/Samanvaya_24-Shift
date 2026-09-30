import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

async function enableMocking() {
  if (import.meta.env.VITE_USE_MOCKS !== 'true') return;
  try {
    const { worker } = await import('./mocks/browser');
    await worker.start({
      onUnhandledRequest: 'bypass',
    });
  } catch (err) {
    console.warn('MSW worker failed to start, continuing in fallback mode:', err);
  }
}

function renderApp() {
  const rootEl = document.getElementById('root');
  if (rootEl) {
    ReactDOM.createRoot(rootEl).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );
  }
}

enableMocking().finally(renderApp);
