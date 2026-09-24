import { createRoot } from 'react-dom/client';
import AvailabilityCalendar from './components/AvailabilityCalendar';
// ?inline: bundled into this script's own JS as a string and injected via a
// <style> tag at runtime, rather than requiring the host to link a separate
// stylesheet — the whole point of a one-<script>-tag embed is that a single
// file is enough. See embed.css for why Preflight is deliberately excluded.
import widgetCss from './embed.css?inline';

// Loaded directly on a third-party page via:
//   <div id="cd-availability"></div>
//   <script src="https://cd.cleansedrip.ph/embed.js"></script>
// Runs in the host's own DOM (not an iframe), so the host's own stylesheet
// naturally cascades into every element here — anything with a `.cd-*` class
// (see AvailabilityCalendar.tsx) or the `--accent` custom property on
// #cd-availability can be overridden with a plain CSS rule, no config API
// needed. That's the trade-off versus availability.html's <iframe>: this mode
// shares the host's page context rather than being sandboxed from it.
const CONTAINER_SELECTOR = '#cd-availability, [data-cd-availability]';
const STYLE_TAG_ID = 'cd-availability-styles';

function injectStylesOnce() {
  if (document.getElementById(STYLE_TAG_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_TAG_ID;
  style.textContent = widgetCss;
  document.head.appendChild(style);
}

function mount() {
  const containers = document.querySelectorAll<HTMLElement>(CONTAINER_SELECTOR);
  if (containers.length === 0) return;
  injectStylesOnce();
  containers.forEach(el => {
    if (el.dataset.cdMounted === '1') return; // avoid double-mount if this script runs twice
    el.dataset.cdMounted = '1';
    createRoot(el).render(<AvailabilityCalendar />);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount);
} else {
  mount();
}
