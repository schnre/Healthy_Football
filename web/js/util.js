// Shared helpers: sports, formatting, safe HTML, icons, toasts, tooltips.

// Order = categorical colour slot (see styles.css --s-*). Keep keys in sync with sync/common.py.
export const SPORTS = {
  run:      { label: 'Laufen',      emoji: '🏃', distance: true },
  football: { label: 'Fussball',    emoji: '⚽' },
  strength: { label: 'Kraft',       emoji: '🏋️' },
  cycle:    { label: 'Rad',         emoji: '🚴', distance: true },
  mobility: { label: 'Mobility',    emoji: '🧘' },
  walk:     { label: 'Gehen',       emoji: '🥾', distance: true },
  hiit:     { label: 'HIIT',        emoji: '🔥' },
  swim:     { label: 'Schwimmen',   emoji: '🏊', distance: true },
  other:    { label: 'Sonstiges',   emoji: '✨' },
};
export const sport = (type) => SPORTS[type] || SPORTS.other;
export const sportColor = (type) => `var(--s-${SPORTS[type] ? type : 'other'})`;

export const FEELINGS = ['', '😫', '😕', '😐', '🙂', '🤩'];
export const RPE_LABELS = ['', 'Sehr locker', 'Locker', 'Locker', 'Moderat', 'Moderat', 'Anstrengend', 'Hart', 'Sehr hart', 'Extrem hart', 'Maximal'];

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

/** Minimal, safe Markdown: escapes first, then **bold**, bullet lists and paragraphs. */
export function md(text) {
  const lines = esc(text).split('\n');
  let html = '';
  let inList = false;
  for (const raw of lines) {
    const line = raw.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    const bullet = line.match(/^\s*[-•*]\s+(.*)$/);
    if (bullet) {
      if (!inList) { html += '<ul>'; inList = true; }
      html += `<li>${bullet[1]}</li>`;
      continue;
    }
    if (inList) { html += '</ul>'; inList = false; }
    if (line.trim()) html += `<p>${line}</p>`;
  }
  return html + (inList ? '</ul>' : '');
}

// ── dates (always local time – toISOString() would shift to UTC) ──
export function todayISO(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export const parseDay = (iso) => new Date(`${iso.slice(0, 10)}T00:00:00`);
export function addDays(iso, n) {
  const d = parseDay(iso);
  d.setDate(d.getDate() + n);
  return todayISO(d);
}
export const daysBetween = (a, b) => Math.round((parseDay(b) - parseDay(a)) / 86400000);
export function weekStart(iso) {
  const d = parseDay(iso);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return todayISO(d);
}
export function isoWeek(iso) {
  const d = parseDay(iso);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const jan4 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d - jan4) / 86400000 - 3 + ((jan4.getDay() + 6) % 7)) / 7);
}

const LOCALE = 'de-CH';
export const fmtDate = (iso, opts = { weekday: 'short', day: 'numeric', month: 'short' }) =>
  iso ? parseDay(iso).toLocaleDateString(LOCALE, opts) : '–';
export const weekdayShort = (iso) => parseDay(iso).toLocaleDateString(LOCALE, { weekday: 'short' }).replace('.', '');

export function relDay(iso) {
  const diff = daysBetween(iso, todayISO());
  if (diff === 0) return 'Heute';
  if (diff === 1) return 'Gestern';
  if (diff === -1) return 'Morgen';
  if (diff > 1 && diff < 7) return fmtDate(iso, { weekday: 'long' });
  return fmtDate(iso);
}

export function relTime(isoDateTime) {
  if (!isoDateTime) return 'nie';
  const mins = Math.round((Date.now() - new Date(isoDateTime)) / 60000);
  if (mins < 1) return 'gerade eben';
  if (mins < 60) return `vor ${mins} Min.`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `vor ${hours} Std.`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'gestern' : `vor ${days} Tagen`;
}

// ── numbers ──
export const fmtNum = (n, digits = 0) =>
  n == null || Number.isNaN(n) ? '–' : Number(n).toLocaleString(LOCALE, { maximumFractionDigits: digits, minimumFractionDigits: digits });

export function fmtDur(min) {
  if (!min) return '–';
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')} h`;
}
export function fmtPace(secPerKm) {
  if (!secPerKm) return '–';
  const s = Math.round(secPerKm);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
export function fmtClock(totalSec) {
  if (!totalSec) return '–';
  const s = Math.round(totalSec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}
export const avg = (values) => {
  const clean = values.filter((v) => typeof v === 'number' && !Number.isNaN(v));
  return clean.length ? clean.reduce((a, b) => a + b, 0) / clean.length : null;
};

// ── icons (24px stroke icons) ──
const ICONS = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  list: 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01',
  plus: 'M12 5v14M5 12h14',
  sparkles: 'M12 3l1.8 4.9L18.7 9.7l-4.9 1.8L12 16.4l-1.8-4.9L5.3 9.7l4.9-1.8zM19 15l.7 1.8 1.8.7-1.8.7L19 20l-.7-1.8-1.8-.7 1.8-.7z',
  chart: 'M3 3v18h18M7 15l4-4 3 3 5-6',
  settings: 'M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1M15 4v4M9 10v4M17 16v4',
  refresh: 'M21 12a9 9 0 1 1-2.6-6.4L21 8M21 3v5h-5',
  close: 'M6 6l12 12M18 6 6 18',
  trash: 'M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v5M14 11v5',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  send: 'M22 2 11 13M22 2l-7 20-4-9-9-4z',
  link: 'M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1',
  check: 'M5 12l5 5L20 7',
  alert: 'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  heart: 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
  battery: 'M3 7h15v10H3zM21 11v2M6.5 10v4M10 10v4',
  pulse: 'M22 12h-4l-3 9L9 3l-3 9H2',
  wind: 'M3 8h11a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h7',
  watch: 'M7 7h10v10H7zM9 7l1-4h4l1 4M9 17l1 4h4l1-4',
  download: 'M12 3v12M7 10l5 5 5-5M5 21h14',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  flame: 'M12 2s5 4.5 5 10a5 5 0 0 1-10 0c0-2.2 1.1-3.8 2.2-4.8 0 2 1 3.3 2 3.3 0-3-1.2-5 .8-8.5z',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  route: 'M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM8 17h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7',
  steps: 'M8 21c-2 0-3-1.5-3-4s1-5 3-5 2.5 2.5 2.5 4.5S10 21 8 21zM16 13c-2 0-2.5-2.5-2.5-4.5S14 3 16 3s3 1.5 3 4-1 6-3 6z',
  gauge: 'M12 14l4-4M3.3 17a9 9 0 1 1 17.4 0',
  chevron: 'M9 6l6 6-6 6',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 12h.01',
  calendar: 'M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM4 10h16M8 2v4M16 2v4M8 14h2M14 14h2M8 17.5h2',
  history: 'M3 12a9 9 0 1 0 2.6-6.4L3 8M3 3v5h5M12 7v5l3.5 2',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  trophy: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3',
  lock: 'M6 11h12v10H6zM8.5 11V7.5a3.5 3.5 0 0 1 7 0V11',
  pin: 'M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
};
export function icon(name, size = 20) {
  return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICONS[name] || ''}"/></svg>`;
}

// Toasts and the tooltip are popovers: they live in the browser's top layer and therefore appear above an
// open <dialog>. Re-opening moves them in front of whatever was opened in between.
const popoverSupported = typeof HTMLElement !== 'undefined' && 'popover' in HTMLElement.prototype;

/** Returns false when the element could not be put into the top layer (no popover support). */
function showOnTop(el) {
  if (!popoverSupported) { el.hidden = false; return false; }
  if (!el.hasAttribute('popover')) el.setAttribute('popover', 'manual'); // e.g. an older cached index.html
  try {
    if (el.matches(':popover-open')) el.hidePopover();
    el.showPopover();
    return true;
  } catch {
    el.hidden = false;
    return false;
  }
}
function hideTop(el) {
  try {
    if (popoverSupported && el.matches(':popover-open')) el.hidePopover();
  } catch { /* already hidden */ }
  if (!popoverSupported) el.hidden = true;
}

// ── toast ──
export function toast(message, kind = 'ok', ms = 3500) {
  const host = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = `toast toast-${kind}`;
  el.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  el.innerHTML = `${icon(kind === 'error' ? 'alert' : 'check', 18)}<span>${esc(message)}</span>`;
  const dialog = document.querySelector('dialog[open]');
  // only re-stack when needed (a dialog may have opened since) – re-showing restarts running animations
  const needsFront = !popoverSupported || !host.matches(':popover-open') || dialog;
  host.append(el);
  if (needsFront && !showOnTop(host) && dialog) {
    // fallback without popover support: show the toast inside the open dialog so it is not hidden behind it
    let local = dialog.querySelector('.toasts-in-dialog');
    if (!local) {
      local = document.createElement('div');
      local.className = 'toasts-in-dialog';
      local.setAttribute('aria-live', 'polite');
      dialog.append(local);
    }
    local.append(el);
  }
  setTimeout(() => {
    el.classList.add('out');
    el.addEventListener('animationend', () => {
      el.remove();
      if (!host.children.length) hideTop(host);
    });
  }, ms);
}

// ── tooltip for any element with data-tip (hover on desktop, tap on touch) ──
export function initTooltip() {
  const tip = document.getElementById('tip');
  let current = null;
  const show = (el) => {
    current = el;
    tip.innerHTML = el.dataset.tip;
    showOnTop(tip);
    const r = el.getBoundingClientRect();
    const t = tip.getBoundingClientRect();
    const x = Math.min(Math.max(8, r.left + r.width / 2 - t.width / 2), innerWidth - t.width - 8);
    let y = r.top - t.height - 8;
    if (y < 8) y = r.bottom + 8;
    tip.style.translate = `${x}px ${y}px`;
  };
  const hide = () => { current = null; hideTop(tip); };
  document.addEventListener('pointerover', (e) => {
    const el = e.target.closest('[data-tip]');
    if (el && el !== current) show(el);
    else if (!el && current) hide();
  });
  document.addEventListener('scroll', hide, { passive: true, capture: true });
}
