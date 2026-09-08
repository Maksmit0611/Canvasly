import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { registerTestHook } from './lib/testHook';
import './index.css';

registerTestHook();

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root is missing from index.html');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
