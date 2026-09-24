import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import AvailabilityCalendar from './components/AvailabilityCalendar';
import './index.css';

// Separate entry point (availability.html) from the main app on purpose —
// this needs its own, more permissive frame-ancestors CSP so it can be
// embedded on third-party sites, while index.html (login/dashboard) keeps
// the strict 'self' policy. See vercel.json.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AvailabilityCalendar />
  </StrictMode>
);
