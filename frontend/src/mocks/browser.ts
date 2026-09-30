import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';

// This creates the MSW service worker that intercepts fetch() in the browser
export const worker = setupWorker(...handlers);
