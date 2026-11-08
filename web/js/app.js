import {
  SPORTS, FEELINGS, RPE_LABELS, sport, sportColor, esc, md, icon, toast, initTooltip,
  todayISO, addDays, parseDay, daysBetween, weekStart, isoWeek, fmtDate, weekdayShort, relDay, relTime,
  fmtNum, fmtDur, fmtPace, fmtClock, avg,
} from './util.js';
import * as store from './store.js';
import { bars, line, sparkline, ring, hbars, legend } from './charts.js';
import {
  MUSCLE_GROUPS, AREAS, FOOTBALL_AREAS, WEIGHT_LABELS, PHASES, DIETS, WEEKDAYS, catalog, normalizeProfile, bestE1rm, volume, fmtSets,
  lastSession, setRow, exerciseBlock, readExercises, slug, uid, fixedOn, recordsByExercise, bestRecord, oneRepMax, recordSuggestions,
} from './training.js';

const APP_NAME = 'Pulse Coach';
const $ = (sel, root = document) => root.querySelector(sel);
const view = $('#view');
const sheet = $('#sheet');

const state = {
  data: null,
  error: null,
  route: 'heute',
  sub: '', // second hash segment, e.g. #/verlauf/trends
  actFilter: 'all',
  actQuery: '',
  trendWeeks: 12,
  coachTab: 0,
  trendExercise: null,
  pending: null, // { kind: 'coach' | 'sync', question?, since }
};

const ROUTES = {
  heute: { title: 'Heute', icon: 'home', render: renderToday },
  plan: { title: 'Plan', icon: 'calendar', render: renderPlan },
  coach: { title: 'Coach', icon: 'sparkles', render: renderCoach },
  verlauf: { title: 'Verlauf', icon: 'history', render: renderHistory },
  einstellungen: { title: 'Einstellungen', icon: 'gear', render: renderSettings },
};
const HISTORY_TABS = { '': 'Aktivitäten', trends: 'Trends', bestwerte: 'Bestwerte' };
// old bookmarks and the manifest shortcuts
const ROUTE_ALIASES = { aktivitaeten: 'verlauf', trends: 'verlauf/trends' };
const SPORT_LABELS = Object.fromEntries(Object.entries(SPORTS).map(([k, v]) => [k, v.label]));
const ZONE_COLORS = ['#86b6ef', '#5598e7', '#2a78d6', '#1c5cab', '#104281'];
const STATUS_TEXT = { hoch: 'Hoch', mittel: 'Mittel', niedrig: 'Niedrig' };

/** Tip areas of an analysis: new format `focus: [{area, tips}]`, older analyses had fixed keys. */
function focusAreas(an) {
  if (an?.focus?.length) return an.focus;
  return [['running', '🏃 Laufen'], ['football', '⚽ Fussball'], ['recovery', '😴 Erholung']]
    .filter(([k]) => an?.[k]?.length).map(([k, area]) => ({ area, tips: an[k] }));
}

// ───────────────────────── derived data ─────────────────────────
function activities() {
  const { garmin = {}, manual = {} } = state.data;
  const ann = manual.annotations || {};
  return [...(garmin.activities || []).map((a) => ({ ...a, ...ann[a.id] })), ...(manual.activities || [])]
    .filter((a) => a.date)
    .sort((a, b) => (b.start || b.date).localeCompare(a.start || a.date));
}
const daily = () => [...(state.data.garmin?.daily || [])].sort((a, b) => a.date.localeCompare(b.date));
const analysis = () => state.data.insights?.analysis;
const profile = () => normalizeProfile(state.data?.profile || {});
const snapshot = () => state.data.garmin?.snapshot || {};
const footballOn = () => profile().modules.football;
/** 105 kg, 82.5 kg – decimals only when needed. */
const fmtKg = (v, unit = true) => `${fmtNum(v, Math.round(v * 10) % 10 ? 1 : 0)}${unit ? ' kg' : ''}`;
/** Sports offered in pickers: the profile's sports, football only with its module, plus whatever is already selected. */
function pickableSports(current) {
  const p = profile();
  const active = p.sports?.length ? p.sports : Object.keys(SPORTS);
  return Object.keys(SPORTS).filter((k) => k === current || k === 'other' || (active.includes(k) && (k !== 'football' || p.modules.football)));
}

/** Everything on one day: fixed appointments (with the coach's notes attached) and the coach's other sessions. */
function dayItems(iso) {
  const p = profile();
  const planned = (analysis()?.plan || []).filter((x) => x.date === iso);
  const fixed = fixedOn(p, iso).map((f) => ({ ...f, fixed: true }));
  const coachFixed = planned.filter((x) => x.fixed);
  fixed.forEach((f, i) => {
    const match = coachFixed.find((x) => x.type === f.type) || coachFixed[i];
    if (match) f.coach = match;
  });
  // a coach entry marked fixed without a matching appointment (e.g. appointment deleted since) still shows
  const orphans = coachFixed.filter((x) => !fixed.some((f) => f.coach === x));
  return { fixed, sessions: [...planned.filter((x) => !x.fixed), ...orphans], blocked: fixed.some((f) => f.kind === 'blocked') };
}

function actTitle(a) {
  if (a.title) return a.title;
  if (a.type === 'football') {
    const f = a.football || {};
    return f.kind === 'match' ? `Match${f.opponent ? ` vs. ${f.opponent}` : ''}` : 'Fussballtraining';
  }
  return sport(a.type).label;
}

function minutesBySport(list) {
  const out = {};
  for (const a of list) out[a.type || 'other'] = (out[a.type || 'other'] || 0) + (a.durationMin || 0);
  return out;
}

function sportsIn(list) {
  const present = new Set(list.map((a) => a.type || 'other'));
  return Object.keys(SPORTS).filter((k) => present.has(k));
}

// ───────────────────────── shared fragments ─────────────────────────
function pageHead(title, sub, actions = '') {
  return `<header class="page-head">
    <div><p class="eyebrow">${sub}</p><h1>${title}</h1></div>
    ${actions ? `<div class="head-actions">${actions}</div>` : ''}
  </header>`;
}

/** iOS-style sheet header: Cancel leading, title, primary action trailing (sheets.md › Mobile). */
function sheetBar(title, { submit = 'Sichern', cancel = 'Abbrechen', sub = '' } = {}) {
  return `<header class="sheet-bar">
    <button type="button" class="bar-btn" data-action="close-sheet">${cancel}</button>
    <div class="sheet-title"><h2>${title}</h2>${sub ? `<p>${sub}</p>` : ''}</div>
    ${submit ? `<button type="submit" class="bar-btn strong">${submit}</button>` : '<span class="bar-btn" aria-hidden="true"></span>'}
  </header>`;
}

/** Plain-language summary of the goal sliders, e.g. "Kraft (Top-Priorität) · Ausdauer (Wichtig)". */
function goalsSummary(p) {
  const areas = { ...AREAS, ...(p.modules.football ? FOOTBALL_AREAS : {}) };
  return Object.entries(p.goals.weights).filter(([k, w]) => w > 0 && areas[k]).sort((a, b) => b[1] - a[1]);
}

function demoBanner() {
  if (state.data.mode !== 'demo') return '';
  return `<div class="banner">
    ${icon('sparkles', 18)}
    <p><strong>Demo-Modus:</strong> Du siehst Beispieldaten. Verbinde dein GitHub-Repo, damit deine Garmin-Daten und Trainings hier erscheinen.</p>
    <a class="btn btn-sm" href="#/einstellungen">Einrichten</a>
  </div>`;
}

function pendingBanner() {
  const p = state.pending;
  if (!p) return '';
  const text = p.kind === 'sync'
    ? 'Garmin-Daten werden synchronisiert …'
    : p.question ? 'Der Coach beantwortet deine Frage …' : 'Der Coach analysiert deine Daten …';
  return `<div class="banner banner-live" role="status"><span class="spinner"></span><p>${text} <span class="muted">Das dauert meist 1–2 Minuten.</span></p></div>`;
}

function actRow(a) {
  const s = sport(a.type);
  const metrics = [
    fmtDur(a.durationMin),
    a.distanceKm && `${fmtNum(a.distanceKm, 1)} km`,
    a.paceSecPerKm && `${fmtPace(a.paceSecPerKm)} /km`,
    a.avgHr && `${a.avgHr} bpm`,
    a.exercises?.length && `${a.exercises.length} Übung${a.exercises.length > 1 ? 'en' : ''}`,
    volume(a.exercises) && `${fmtNum(volume(a.exercises))} kg`,
    a.football?.kind === 'match' && a.football.result,
  ].filter(Boolean);
  const time = a.start?.length > 10 ? ` · ${a.start.slice(11, 16)}` : '';
  return `<button class="act-row" data-action="open-activity" data-id="${esc(a.id)}">
    <span class="act-icon" style="--c:${sportColor(a.type)}">${s.emoji}</span>
    <span class="act-main">
      <span class="act-title">${esc(actTitle(a))}</span>
      <span class="act-sub">${esc(relDay(a.date))}${time} · ${esc(s.label)}${a.source === 'garmin' ? ` <span class="src">${icon('watch', 12)}Garmin</span>` : ''}</span>
    </span>
    <span class="act-metrics">${metrics.map((m) => `<span>${esc(m)}</span>`).join('')}</span>
    ${a.feeling ? `<span class="act-feel" title="Gefühl ${a.feeling}/5">${FEELINGS[a.feeling]}</span>` : ''}
  </button>`;
}

function tipList(tips = []) {
  if (!tips.length) return '<p class="muted">Keine Empfehlungen.</p>';
  return `<ol class="tips">${tips.map((t) => `
    <li class="tip-item prio-${esc(t.priority)}">
      <div class="tip-head"><strong>${esc(t.title)}</strong><span class="prio">${esc(STATUS_TEXT[t.priority] || t.priority)}</span></div>
      <p>${esc(t.detail)}</p>
    </li>`).join('')}</ol>`;
}

/** One entry of a plan day: a fixed appointment (optionally with the coach's notes) or a coach session. */
function planEntry(x, { compact = false, editable = false } = {}) {
  const blocked = x.kind === 'blocked';
  const s = blocked ? { label: 'Keine Zeit', emoji: '⛔' } : x.type === 'rest' ? { label: 'Ruhetag', emoji: '😴' } : sport(x.type);
  const coach = x.fixed ? x.coach : x;
  const color = blocked || x.type === 'rest' ? 'var(--ink-3)' : sportColor(x.type);
  const minutes = x.durationMin || coach?.durationMin;
  const meta = [x.time, minutes && fmtDur(minutes), !x.fixed && compact ? null : s.label].filter(Boolean);
  const intensity = !blocked && coach?.intensity && coach.intensity !== 'Ruhe' ? `<span class="intensity i-${esc(coach.intensity)}">${esc(coach.intensity)}</span>` : '';
  return `<article class="plan-entry${x.fixed ? ' is-fixed' : ''}${blocked ? ' is-blocked' : ''}" style="--c:${color}">
    <span class="act-icon">${s.emoji}</span>
    <div class="plan-entry-main">
      <div class="plan-entry-top">
        <h3>${esc(x.title || coach?.title || s.label)}</h3>
        ${x.fixed ? `<span class="chip fixed-chip">${icon('lock', 12)}Fix</span>` : ''}${intensity}
      </div>
      <p class="plan-entry-meta">${meta.map(esc).join(' · ')}</p>
      ${coach?.details ? `<p class="plan-entry-details">${esc(coach.details)}</p>` : ''}
      ${coach?.nutrition && !compact ? `<p class="plan-food">🍽️ ${esc(coach.nutrition)}</p>` : ''}
    </div>
    ${editable && x.fixed && x.id ? `<button class="icon-btn sm" data-action="edit-fixed" data-id="${esc(x.id)}" aria-label="${esc(x.title || 'Termin')} bearbeiten">${icon('edit', 16)}</button>` : ''}
  </article>`;
}

/** The next entries from today on, for the home screen. */
function upcomingEntries(limit = 3) {
  const out = [];
  for (let i = 0; i < 7 && out.length < limit; i++) {
    const date = addDays(todayISO(), i);
    const { fixed, sessions } = dayItems(date);
    for (const x of [...fixed, ...sessions]) out.push({ date, x });
  }
  return out.slice(0, limit);
}

function emptyState(title, text, action = '') {
  return `<div class="empty">${icon('sparkles', 28)}<h3>${title}</h3><p>${text}</p>${action}</div>`;
}

// ───────────────────────── page: today ─────────────────────────
const KPIS = [
  { key: 'restingHr', label: 'Ruhepuls', icon: 'heart', unit: 'bpm', better: 'lower' },
  { key: 'hrv', label: 'HRV', icon: 'pulse', unit: 'ms', better: 'higher' },
  { key: 'sleepH', label: 'Schlaf', icon: 'moon', unit: 'h', digits: 1, better: 'higher' },
  { key: 'bodyBatteryHigh', label: 'Body Battery', icon: 'battery', unit: '', better: 'higher' },
  { key: 'stress', label: 'Stress', icon: 'gauge', unit: '', better: 'lower' },
  { key: 'steps', label: 'Schritte', icon: 'steps', unit: '', better: 'higher' },
];

function kpiTile(k, days) {
  const recent = days.slice(-14);
  const withValue = recent.filter((d) => typeof d[k.key] === 'number');
  const latest = withValue.at(-1);
  if (!latest) return '';
  const base = avg(withValue.slice(-8, -1).map((d) => d[k.key]));
  const delta = base == null ? null : latest[k.key] - base;
  let trend = '';
  if (delta != null && Math.abs(delta) >= (k.digits ? 0.1 : 1)) {
    const good = k.better === 'higher' ? delta > 0 : delta < 0;
    trend = `<span class="trend ${good ? 'good' : 'bad'}">${delta > 0 ? '↑' : '↓'} ${fmtNum(Math.abs(delta), k.digits || 0)} vs. Ø 7 T.</span>`;
  } else if (delta != null) {
    trend = '<span class="trend">→ wie Ø 7 T.</span>';
  }
  const when = latest.date === todayISO() ? '' : `<span class="kpi-when">${esc(relDay(latest.date))}</span>`;
  return `<article class="kpi">
    <header>${icon(k.icon, 16)}<span>${k.label}</span>${when}</header>
    <div class="kpi-value">${fmtNum(latest[k.key], k.digits || 0)}<small>${k.unit}</small></div>
    ${trend}
    ${sparkline(recent.map((d) => d[k.key]), 'var(--accent)')}
  </article>`;
}

function weekLoadCard(acts) {
  const today = todayISO();
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const cols = days.map((d) => {
    const dayActs = acts.filter((a) => a.date === d);
    const per = minutesBySport(dayActs);
    const lines = Object.entries(per).map(([t, m]) => `${esc(SPORT_LABELS[t] || t)}: ${fmtDur(m)}`);
    return {
      label: d === today ? 'Heute' : weekdayShort(d),
      tip: `<b>${esc(fmtDate(d))}</b><br>${lines.length ? lines.join('<br>') : 'Ruhetag'}`,
      segments: Object.entries(per).map(([type, value]) => ({ type, value })),
    };
  });
  const weekActs = acts.filter((a) => daysBetween(a.date, today) < 7);
  const total = weekActs.reduce((s, a) => s + (a.durationMin || 0), 0);
  const runKm = weekActs.filter((a) => a.type === 'run').reduce((s, a) => s + (a.distanceKm || 0), 0);
  const types = sportsIn(weekActs);
  return `<article class="card">
    <header class="card-head"><h2>Letzte 7 Tage</h2><a class="link" href="#/trends">Trends ${icon('chevron', 14)}</a></header>
    <div class="stat-row">
      <div><strong>${weekActs.length}</strong><span>Einheiten</span></div>
      <div><strong>${fmtDur(total)}</strong><span>Trainingszeit</span></div>
      <div><strong>${fmtNum(runKm, 1)}</strong><span>Lauf-km</span></div>
    </div>
    ${bars(cols, { unit: 'min', height: 150 })}
    ${types.length ? legend(types, SPORT_LABELS) : ''}
  </article>`;
}

function renderToday() {
  const acts = activities();
  const days = daily();
  const an = analysis();
  const snap = snapshot();
  const hour = new Date().getHours();
  const greet = hour < 11 ? 'Guten Morgen' : hour < 18 ? 'Hallo' : 'Guten Abend';
  const name = profile().name;
  const score = an?.readiness?.score ?? snap.readiness?.score;
  const upcoming = upcomingEntries(3);

  const readiness = `<article class="card readiness">
    ${ring(score, { label: 'Bereitschaft' })}
    <div>
      <p class="eyebrow">Tagesform</p>
      <h2>${esc(an?.readiness?.label || snap.readiness?.feedback || 'Noch keine Analyse')}</h2>
      <p class="muted">${esc(an?.readiness?.reasoning || 'Sobald der Coach deine Daten analysiert hat, siehst du hier deine Tagesform.')}</p>
      ${snap.readiness?.score != null && an?.readiness ? `<p class="chip-row"><span class="chip">${icon('watch', 14)} Garmin Readiness ${snap.readiness.score}</span>${snap.readiness.recoveryTimeH ? `<span class="chip">${icon('clock', 14)} Erholung ${snap.readiness.recoveryTimeH} h</span>` : ''}</p>` : ''}
    </div>
  </article>`;

  const brief = an ? `<article class="card coach-brief">
    <header class="card-head"><h2>${icon('sparkles', 18)} Coach</h2><span class="muted small">${esc(relTime(state.data.insights.generatedAt))}</span></header>
    <p class="lead">${esc(an.summary)}</p>
    ${(an.warnings || []).map((w) => `<p class="warn">${icon('alert', 16)}${esc(w)}</p>`).join('')}
    <ul class="mini-tips">${focusAreas(an).flatMap((f) => f.tips).filter((t) => t.priority === 'hoch').slice(0, 3)
      .map((t) => `<li><strong>${esc(t.title)}</strong></li>`).join('')}</ul>
    <a class="link" href="#/coach">Ganze Analyse ${icon('chevron', 14)}</a>
  </article>` : `<article class="card coach-brief">${emptyState('Noch keine Coach-Analyse', 'Starte die erste Analyse – Claude wertet dann alle Trainings und Gesundheitsdaten aus.', '<button class="btn btn-primary" data-action="analyze">Analyse starten</button>')}</article>`;

  const vo2 = snap.vo2max ? `<article class="kpi">
    <header>${icon('wind', 16)}<span>VO₂max</span></header>
    <div class="kpi-value">${fmtNum(snap.vo2max, 1)}</div>
    ${snap.fitnessAge ? `<span class="trend">Fitnessalter ${snap.fitnessAge}</span>` : ''}
  </article>` : '';

  return `
    ${pageHead(`${greet}${name ? `, ${esc(name)}` : ''}`, esc(fmtDate(todayISO(), { weekday: 'long', day: 'numeric', month: 'long' })),
      `<button class="btn hide-mobile" data-action="sync">${icon('refresh', 16)}<span>Sync</span></button><button class="btn btn-primary hide-mobile" data-action="add">${icon('plus', 16)}<span>Training</span></button>`)}
    ${demoBanner()}${pendingBanner()}
    <section class="grid hero">${readiness}${brief}</section>
    <section class="kpis">${KPIS.map((k) => kpiTile(k, days)).join('')}${vo2}</section>
    <section class="grid two">
      ${weekLoadCard(acts)}
      <article class="card">
        <header class="card-head"><h2>Als Nächstes</h2><a class="link" href="#/plan">Wochenplan ${icon('chevron', 14)}</a></header>
        ${upcoming.length ? `<div class="next-list">${upcoming.map(({ date, x }) => `<div class="next-item"><p class="next-day">${esc(relDay(date))}</p>${planEntry(x, { compact: true })}</div>`).join('')}</div>` : '<p class="muted">Der Coach erstellt dir nach der ersten Analyse einen Plan für die nächsten 7 Tage. Fixtermine trägst du im Plan ein.</p>'}
      </article>
    </section>
    <article class="card">
      <header class="card-head"><h2>Letzte Aktivitäten</h2><a class="link" href="#/aktivitaeten">Alle ${icon('chevron', 14)}</a></header>
      <div class="act-list">${acts.slice(0, 5).map(actRow).join('') || '<p class="muted">Noch keine Aktivitäten.</p>'}</div>
    </article>`;
}

// ───────────────────────── page: activities ─────────────────────────
function renderActivities() {
  const all = activities();
  const q = state.actQuery.trim().toLowerCase();
  const list = all.filter((a) => (state.actFilter === 'all' || a.type === state.actFilter)
    && (!q || `${actTitle(a)} ${a.notes || ''} ${a.football?.opponent || ''}`.toLowerCase().includes(q)));

  const groups = new Map();
  for (const a of list) {
    const wk = weekStart(a.date);
    if (!groups.has(wk)) groups.set(wk, []);
    groups.get(wk).push(a);
  }
  const thisWeek = weekStart(todayISO());
  const weekTitle = (wk) => {
    if (wk === thisWeek) return 'Diese Woche';
    if (wk === addDays(thisWeek, -7)) return 'Letzte Woche';
    return `KW ${isoWeek(wk)} · ${fmtDate(wk, { day: 'numeric', month: 'short' })} – ${fmtDate(addDays(wk, 6), { day: 'numeric', month: 'short' })}`;
  };

  const chips = ['all', ...sportsIn(all)].map((t) => `<button class="chip-btn${state.actFilter === t ? ' active' : ''}" data-action="filter" data-type="${t}" aria-pressed="${state.actFilter === t}">
    ${t === 'all' ? 'Alle' : `${sport(t).emoji} ${esc(sport(t).label)}`}</button>`).join('');

  return `
    ${pageHead('Verlauf', `${all.length} Einträge · Garmin & manuell`, `<button class="btn btn-primary hide-mobile" data-action="add">${icon('plus', 16)}<span>Training erfassen</span></button>`)}
    ${historyTabs()}
    ${demoBanner()}
    <div class="toolbar">
      <label class="search">${icon('search', 16)}<input type="search" id="act-search" placeholder="${footballOn() ? 'Suchen (Titel, Gegner, Notizen)' : 'Suchen (Titel, Notizen)'}" value="${esc(state.actQuery)}" aria-label="Aktivitäten durchsuchen"></label>
      <div class="chips" role="group" aria-label="Sportart filtern">${chips}</div>
    </div>
    ${[...groups].map(([wk, items]) => {
      const mins = items.reduce((s, a) => s + (a.durationMin || 0), 0);
      const km = items.filter((a) => a.type === 'run').reduce((s, a) => s + (a.distanceKm || 0), 0);
      return `<section class="week-group">
        <header><h2>${esc(weekTitle(wk))}</h2><span class="muted small">${items.length} Einheiten · ${fmtDur(mins)}${km ? ` · ${fmtNum(km, 1)} km Laufen` : ''}</span></header>
        <div class="card act-list">${items.map(actRow).join('')}</div>
      </section>`;
    }).join('') || emptyState('Nichts gefunden', 'Passe den Filter an oder erfasse ein neues Training.')}`;
}

// ───────────────────────── activity detail & form (dialog) ─────────────────────────
function openSheet(html) {
  sheet.innerHTML = html;
  sheet.scrollTop = 0;
  paintRanges(sheet);
  if (!sheet.open) sheet.showModal();
  // focus the sheet itself (not "Abbrechen"), so VoiceOver starts at the top and no focus ring flashes
  sheet.focus({ preventScroll: true });
}

/** Filled part of iOS-style sliders (WebKit has no ::range-progress). */
function paintRanges(root = document) {
  root.querySelectorAll('input[type=range]').forEach((el) => {
    const pct = ((el.value - el.min) / ((el.max - el.min) || 1)) * 100;
    el.style.setProperty('--fillp', pct);
  });
}

function openActivity(id) {
  const a = activities().find((x) => x.id === id);
  if (!a) return;
  const s = sport(a.type);
  const f = a.football || {};
  const stats = [
    ['Dauer', fmtDur(a.durationMin)],
    ['Distanz', a.distanceKm && `${fmtNum(a.distanceKm, 2)} km`],
    ['Pace', a.paceSecPerKm && `${fmtPace(a.paceSecPerKm)} /km`],
    ['Ø Puls', a.avgHr && `${a.avgHr} bpm`],
    ['Max. Puls', a.maxHr && `${a.maxHr} bpm`],
    ['Kalorien', a.calories && `${a.calories} kcal`],
    ['Training Load', a.trainingLoad],
    ['Aerober TE', a.aerobicTE],
    ['Anaerober TE', a.anaerobicTE],
    ['Höhenmeter', a.elevationGain && `${a.elevationGain} m`],
    ['Kadenz', a.cadence && `${a.cadence} spm`],
    ['RPE', a.rpe && `${a.rpe}/10 · ${RPE_LABELS[a.rpe]}`],
    ['Gefühl', a.feeling && `${FEELINGS[a.feeling]} ${a.feeling}/5`],
  ].filter(([, v]) => v);
  const footballStats = a.type === 'football' ? [
    ['Art', f.kind === 'match' ? 'Match' : 'Training'],
    ['Gegner', f.opponent], ['Resultat', f.result], ['Spielminuten', f.minutesPlayed],
    ['Tore', f.goals], ['Assists', f.assists],
  ].filter(([, v]) => v || v === 0) : [];
  const earlier = activities().filter((x) => (x.start || x.date) < (a.start || a.date));
  const exercisesHtml = a.exercises?.length ? `<h3 class="sub">Übungen</h3><div class="ex-summary">${a.exercises.map((e) => {
    const best = bestE1rm(e);
    const previous = earlier.flatMap((x) => (x.exercises || []).filter((y) => y.id === e.id)).map(bestE1rm).filter(Boolean);
    const record = best && previous.length && best > Math.max(...previous);
    return `<div class="ex-line">
      <div><strong>${esc(e.name)}</strong>${record ? ' <span class="chip good">🏆 Rekord</span>' : ''}</div>
      <span>${esc(fmtSets(e.sets, e.unit))}</span>
      ${best ? `<span class="muted small">≈ 1RM ${fmtNum(best)} kg</span>` : ''}
    </div>`;
  }).join('')}</div>` : '';
  if (volume(a.exercises)) stats.push(['Volumen', `${fmtNum(volume(a.exercises))} kg`]);
  const zones = a.hrZonesMin?.some(Boolean) ? hbars(a.hrZonesMin.map((m, i) => ({
    label: `Zone ${i + 1}`, value: m || 0, display: fmtDur(m), color: ZONE_COLORS[i],
  }))) : '';

  openSheet(`<div class="sheet-body">
    <header class="sheet-head">
      <span class="act-icon lg" style="--c:${sportColor(a.type)}">${s.emoji}</span>
      <div><h2>${esc(actTitle(a))}</h2><p class="muted">${esc(fmtDate(a.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}${a.start?.length > 10 ? ` · ${a.start.slice(11, 16)}` : ''} · ${a.source === 'garmin' ? 'Garmin' : 'Manuell'}</p></div>
      <button class="icon-btn" data-action="close-sheet" aria-label="Schliessen">${icon('close')}</button>
    </header>
    <dl class="stat-grid">${[...stats, ...footballStats].map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
    ${exercisesHtml}
    ${zones ? `<h3 class="sub">Herzfrequenzzonen</h3>${zones}` : ''}
    ${a.notes ? `<h3 class="sub">Notizen</h3><p>${esc(a.notes)}</p>` : ''}
    <footer class="sheet-actions">
      ${a.source === 'garmin'
        ? `<button class="btn" data-action="edit-activity" data-id="${esc(a.id)}">${icon('edit', 16)}Ergänzen (Übungen, RPE, Notizen)</button>`
        : `<button class="btn btn-danger" data-action="delete-activity" data-id="${esc(a.id)}">${icon('trash', 16)}Löschen</button>
           <button class="btn btn-primary" data-action="edit-activity" data-id="${esc(a.id)}">${icon('edit', 16)}Bearbeiten</button>`}
    </footer>
  </div>`);
}

function openForm(existing) {
  const mode = !existing ? 'new' : existing.source === 'garmin' ? 'garmin' : 'edit';
  const p = profile();
  const types = pickableSports(existing?.type);
  const a = existing || { type: types.find((k) => k !== 'other') || 'other', date: todayISO() };
  const f = a.football || { kind: 'training' };
  const showFootball = p.modules.football || a.type === 'football';
  const now = new Date();
  const time = a.start?.slice(11, 16) || `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const heading = { new: 'Training erfassen', edit: 'Training bearbeiten', garmin: 'Garmin-Aktivität ergänzen' }[mode];
  const all = activities();

  openSheet(`<form id="act-form" class="sheet-body form" data-mode="${mode}" data-id="${esc(a.id || '')}" novalidate>
    ${sheetBar(heading, { sub: mode === 'garmin' ? 'Messwerte kommen von der Uhr' : '' })}

    <fieldset class="type-picker">
      <legend>Sportart</legend>
      ${types.map((k) => `<label style="--c:${sportColor(k)}"><input type="radio" name="type" value="${k}" ${a.type === k ? 'checked' : ''}><span>${SPORTS[k].emoji}</span>${esc(SPORTS[k].label)}</label>`).join('')}
    </fieldset>

    <label class="field"><span>Titel <em>optional</em></span><input name="title" value="${esc(a.title || '')}" placeholder="z.B. Intervalle 6×800 m, Oberkörper" maxlength="80"></label>

    <div class="row no-garmin">
      <label class="field"><span>Datum</span><input type="date" name="date" value="${esc(a.date)}" max="${addDays(todayISO(), 30)}" required></label>
      <label class="field"><span>Uhrzeit</span><input type="time" name="time" value="${esc(time)}"></label>
    </div>
    <div class="row no-garmin">
      <label class="field"><span>Dauer (min)</span><input type="number" name="durationMin" inputmode="numeric" min="1" max="600" value="${esc(a.durationMin ?? '')}" required placeholder="60"></label>
      <label class="field distance-field"><span>Distanz (km)</span><input type="number" name="distanceKm" inputmode="decimal" step="0.01" min="0" value="${esc(a.distanceKm ?? '')}" placeholder="optional"></label>
      <label class="field"><span>Ø Puls</span><input type="number" name="avgHr" inputmode="numeric" min="40" max="230" value="${esc(a.avgHr ?? '')}" placeholder="optional"></label>
    </div>

    ${showFootball ? `<fieldset class="football-fields">
      <legend>Fussball</legend>
      <div class="segmented">
        <label><input type="radio" name="fkind" value="training" ${f.kind !== 'match' ? 'checked' : ''}>Training</label>
        <label><input type="radio" name="fkind" value="match" ${f.kind === 'match' ? 'checked' : ''}>Match</label>
      </div>
      <div class="row match-only">
        <label class="field grow"><span>Gegner</span><input name="opponent" value="${esc(f.opponent || '')}" placeholder="FC Beispiel"></label>
        <label class="field"><span>Resultat</span><input name="result" value="${esc(f.result || '')}" placeholder="2:1"></label>
      </div>
      <div class="row match-only">
        <label class="field"><span>Spielminuten</span><input type="number" name="minutesPlayed" inputmode="numeric" min="0" max="130" value="${esc(f.minutesPlayed ?? '')}"></label>
        <label class="field"><span>Tore</span><input type="number" name="goals" inputmode="numeric" min="0" max="20" value="${esc(f.goals ?? '')}"></label>
        <label class="field"><span>Assists</span><input type="number" name="assists" inputmode="numeric" min="0" max="20" value="${esc(f.assists ?? '')}"></label>
      </div>
    </fieldset>` : ''}

    <fieldset class="strength-fields">
      <legend>Übungen</legend>
      <div class="ex-list">${(a.exercises || []).map((e) => exerciseBlock(e, lastSession(all, e.id, a.id))).join('')}</div>
      <div class="ex-add">
        <input id="ex-search" list="ex-options" placeholder="Übung suchen oder neue eintippen …" autocomplete="off" enterkeyhint="done">
        <datalist id="ex-options">${catalog(p).map((e) => `<option value="${esc(e.name)}">${esc(e.group)}</option>`).join('')}</datalist>
        <button type="button" class="btn" data-action="ex-add">${icon('plus', 16)}Hinzufügen</button>
      </div>
      <p class="muted small">Gewicht leer lassen = Körpergewicht. Neue Übungen landen automatisch in deiner Liste (Einstellungen → Übungen).</p>
    </fieldset>

    <label class="field">
      <span>Anstrengung (RPE) <output id="rpe-out">${a.rpe ? `${a.rpe} · ${RPE_LABELS[a.rpe]}` : 'nicht bewertet'}</output></span>
      <input type="range" name="rpe" min="0" max="10" step="1" value="${a.rpe || 0}" class="rpe">
    </label>

    <fieldset class="feelings">
      <legend>Wie hat es sich angefühlt?</legend>
      ${[1, 2, 3, 4, 5].map((n) => `<label><input type="radio" name="feeling" value="${n}" ${a.feeling === n ? 'checked' : ''}><span aria-label="${n} von 5">${FEELINGS[n]}</span></label>`).join('')}
    </fieldset>

    <label class="field"><span>Notizen</span><textarea name="notes" rows="2" placeholder="Wie lief es? Schmerzen, Besonderheiten, Wetter …">${esc(a.notes || '')}</textarea></label>
    <div class="sheet-spacer"></div>
  </form>`);
}

async function submitActivity(form) {
  const fd = new FormData(form);
  const mode = form.dataset.mode;
  const num = (k) => (fd.get(k) === '' || fd.get(k) == null ? undefined : Number(fd.get(k)));
  const type = fd.get('type') || 'other';
  const football = type === 'football' ? Object.fromEntries(Object.entries({
    kind: fd.get('fkind') || 'training',
    ...(fd.get('fkind') === 'match' ? {
      opponent: fd.get('opponent')?.trim(), result: fd.get('result')?.trim(),
      minutesPlayed: num('minutesPlayed'), goals: num('goals'), assists: num('assists'),
    } : {}),
  }).filter(([, v]) => v !== undefined && v !== '')) : undefined;
  const common = {
    type,
    title: fd.get('title').trim() || undefined,
    rpe: num('rpe') || undefined,
    feeling: num('feeling'),
    notes: fd.get('notes').trim() || undefined,
    football,
  };
  const exercises = type === 'strength' ? readExercises(form) : [];
  if (exercises.length) common.exercises = exercises;
  const newExercises = JSON.parse(form.dataset.newExercises || '[]').filter((n) => exercises.some((e) => e.id === n.id));

  const submit = form.querySelector('[type=submit]');
  submit.disabled = true;
  try {
    if (mode === 'garmin') {
      await store.saveAnnotation(form.dataset.id, JSON.parse(JSON.stringify(common)));
    } else {
      const missing = [['date', 'Datum'], ['durationMin', 'Dauer']].filter(([k]) => !fd.get(k) || (k === 'durationMin' && !num(k)));
      if (missing.length) {
        missing.forEach(([k]) => form.elements[k].setAttribute('aria-invalid', 'true'));
        form.elements[missing[0][0]].focus();
        form.elements[missing[0][0]].scrollIntoView({ block: 'center', behavior: 'smooth' });
        toast(`Bitte ${missing.map(([, label]) => label).join(' und ')} angeben.`, 'error');
        submit.disabled = false;
        return;
      }
      const activity = JSON.parse(JSON.stringify({
        id: form.dataset.id || `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        source: 'manual',
        ...common,
        date: fd.get('date'),
        start: `${fd.get('date')}T${fd.get('time') || '12:00'}:00`,
        durationMin: num('durationMin'),
        distanceKm: SPORTS[type]?.distance ? num('distanceKm') : undefined,
        avgHr: num('avgHr'),
      }));
      if (activity.type === 'run' && activity.distanceKm) activity.paceSecPerKm = Math.round((activity.durationMin * 60) / activity.distanceKm);
      await store.saveActivity(activity);
    }
    if (newExercises.length) {
      await store.updateProfile((raw) => {
        const prof = normalizeProfile(raw);
        prof.customExercises = [...prof.customExercises, ...newExercises.filter((n) => !prof.customExercises.some((c) => c.id === n.id))];
        return prof;
      });
    }
    sheet.close();
    toast(mode === 'new' ? 'Training gespeichert' : 'Änderungen gespeichert');
    await reload();
    if (store.isLive() && store.getPrefs().analyzeAfterEntry) runCoach('manual-entry');
  } catch (err) {
    toast(`Speichern fehlgeschlagen: ${err.message}`, 'error');
    submit.disabled = false;
  }
}

// ───────────────────────── page: coach ─────────────────────────
function renderCoach() {
  const ins = state.data.insights || {};
  const an = ins.analysis;
  const head = pageHead('Coach', an ? `Analyse ${esc(relTime(ins.generatedAt))} · ${esc(ins.model || 'Claude')}` : 'KI-Analyse mit Claude',
    `<button class="btn btn-primary" data-action="analyze" ${state.pending ? 'disabled' : ''}>${icon('sparkles', 16)}<span>Neu analysieren</span></button>`);
  const p = profile();
  const weights = goalsSummary(p);
  const areas = { ...AREAS, ...FOOTBALL_AREAS };
  const mission = `<article class="card mission">
    <header class="card-head"><h2>${icon('target', 18)} Dein Auftrag an den Coach</h2><button class="btn btn-sm" data-action="edit-goals">${icon('edit', 14)}Anpassen</button></header>
    ${p.goals.notes ? `<p class="lead">«${esc(p.goals.notes)}»</p>` : '<p class="muted">Sag dem Coach, was du willst: mehr Ausdauer, mehr Kraft, ein Ziel mit Datum. Je genauer, desto besser passt der Plan.</p>'}
    ${weights.length ? `<div class="focus-meter">${weights.map(([k, w]) => `<div class="focus-row">
      <span>${areas[k].emoji} ${esc(areas[k].label)}</span>
      <span class="meter" role="img" aria-label="${esc(WEIGHT_LABELS[w])}">${[1, 2, 3, 4].map((n) => `<i class="${n <= w ? 'on' : ''}"></i>`).join('')}</span>
      <span class="muted small">${esc(WEIGHT_LABELS[w])}</span></div>`).join('')}</div>` : ''}
    ${p.goals.targets.length ? `<ul class="target-list">${p.goals.targets.map((t) => `<li>${icon('flame', 14)}<span>${esc(t.text)}</span>${t.date ? `<span class="muted small">bis ${esc(fmtDate(t.date, { day: 'numeric', month: 'short', year: 'numeric' }))}</span>` : ''}</li>`).join('')}</ul>` : ''}
    ${!p.goals.notes && !weights.length ? '<button class="btn btn-primary" data-action="edit-goals">Ziele festlegen</button>' : ''}
  </article>`;
  const ask = `<article class="card ask">
    <header class="card-head"><h2>Frag deinen Coach</h2></header>
    <form id="ask-form" class="ask-form">
      <textarea name="q" rows="2" maxlength="2000" placeholder="z.B. Wie werde ich in 6 Wochen fit für einen 10-km-Lauf, ohne an Kraft zu verlieren?" required aria-label="Frage an den Coach"></textarea>
      <button class="btn btn-primary" type="submit" ${state.pending ? 'disabled' : ''}>${icon('send', 16)}<span>Senden</span></button>
    </form>
    <div class="qa-list">${(ins.qa || []).map((x) => `<details class="qa" ${x === ins.qa[0] ? 'open' : ''}>
      <summary><strong>${esc(x.question)}</strong><span class="muted small">${esc(relTime(x.at))}</span></summary>
      <div class="prose">${md(x.answer)}</div>
    </details>`).join('')}</div>
  </article>`;

  if (!an) {
    return `${head}${demoBanner()}${pendingBanner()}
      ${mission}
      ${emptyState('Noch keine Analyse', 'Drück auf «Jetzt analysieren» – Claude wertet dann alle Trainings und Gesundheitsdaten aus. Analysen laufen nur auf Knopfdruck.', '<button class="btn btn-primary" data-action="analyze">Jetzt analysieren</button>')}
      ${ask}`;
  }

  const focus = focusAreas(an);
  const tab = Math.min(state.coachTab, Math.max(0, focus.length - 1));
  const loadStatus = an.load?.status || '';
  const loadClass = { 'zu niedrig': 'warn', aufbauend: 'good', optimal: 'good', hoch: 'warn', 'zu hoch': 'bad' }[loadStatus] || '';

  return `${head}${demoBanner()}${pendingBanner()}
    ${mission}
    <section class="grid hero">
      <article class="card readiness">
        ${ring(an.readiness?.score, { label: 'Bereitschaft' })}
        <div><p class="eyebrow">Tagesform</p><h2>${esc(an.readiness?.label)}</h2><p class="muted">${esc(an.readiness?.reasoning)}</p></div>
      </article>
      <article class="card">
        <p class="eyebrow">Trainingsbelastung</p>
        <h2 class="status ${loadClass}">${icon(loadClass === 'good' ? 'check' : 'alert', 18)}${esc(loadStatus)}</h2>
        <p class="muted">${esc(an.load?.comment)}</p>
      </article>
    </section>
    <article class="card">
      <p class="lead">${esc(an.summary)}</p>
      ${(an.warnings || []).map((w) => `<p class="warn">${icon('alert', 16)}${esc(w)}</p>`).join('')}
    </article>
    <article class="card">
      <div class="segmented tabs" role="tablist">${focus.map((f, i) => `<button role="tab" aria-selected="${tab === i}" data-action="coach-tab" data-tab="${i}">${esc(f.area)}</button>`).join('')}</div>
      <div class="tab-panel" role="tabpanel">${tipList(focus[tab]?.tips)}</div>
    </article>
    ${an.nutrition ? `<article class="card">
      <header class="card-head"><h2>🍽️ Ernährung</h2><span class="muted small">Faustregeln</span></header>
      ${an.nutrition.summary ? `<p class="lead">${esc(an.nutrition.summary)}</p>` : ''}
      <div style="margin-top:12px">${tipList(an.nutrition.tips)}</div>
      <p class="muted small" style="margin-top:12px">Allgemeine Empfehlungen auf Basis von Sporternährungs-Leitlinien (ACSM, ISSN${p.modules.football ? ', UEFA' : ''}) – keine medizinische oder ernährungstherapeutische Beratung.</p>
    </article>` : ''}
    <a class="card link-card" href="#/plan">
      <span class="act-icon" style="--c:var(--accent)">${icon('calendar', 22)}</span>
      <span><strong>Dein Wochenplan</strong><span class="muted small">${(an.plan || []).length} Einheiten, um deine Fixtermine herum geplant</span></span>
      ${icon('chevron', 18)}
    </a>
    ${ask}`;
}

// ───────────────────────── page: trends ─────────────────────────
function renderTrends() {
  const weeks = state.trendWeeks;
  const today = todayISO();
  const from = addDays(weekStart(today), -(weeks - 1) * 7);
  const acts = activities().filter((a) => a.date >= from);
  const days = daily().filter((d) => d.date >= from);

  const weekStarts = Array.from({ length: weeks }, (_, i) => addDays(from, i * 7));
  const weekLabel = (wk) => `KW${isoWeek(wk)}`;
  const volumeCols = weekStarts.map((wk) => {
    const wa = acts.filter((a) => a.date >= wk && a.date < addDays(wk, 7));
    const per = minutesBySport(wa);
    return {
      label: weekLabel(wk),
      tip: `<b>KW ${isoWeek(wk)}</b> (${esc(fmtDate(wk, { day: 'numeric', month: 'short' }))})<br>${Object.entries(per).map(([t, m]) => `${esc(SPORT_LABELS[t])}: ${fmtDur(m)}`).join('<br>') || 'Kein Training'}`,
      segments: Object.entries(per).map(([type, value]) => ({ type, value: Math.round((value / 60) * 10) / 10 })),
    };
  });
  const kmCols = weekStarts.map((wk) => {
    const km = acts.filter((a) => a.type === 'run' && a.date >= wk && a.date < addDays(wk, 7)).reduce((s, a) => s + (a.distanceKm || 0), 0);
    return { label: weekLabel(wk), tip: `<b>KW ${isoWeek(wk)}</b><br>${fmtNum(km, 1)} km`, segments: [{ type: 'run', value: Math.round(km * 10) / 10 }] };
  });

  const ms = (iso) => parseDay(iso).getTime();
  const xLabels = (dates) => {
    if (dates.length < 2) return [];
    const n = Math.min(5, dates.length);
    return Array.from({ length: n }, (_, i) => dates[Math.round((i * (dates.length - 1)) / (n - 1))])
      .map((d) => ({ x: ms(d), label: fmtDate(d, { day: 'numeric', month: 'short' }) }));
  };

  const runs = acts.filter((a) => a.type === 'run' && a.paceSecPerKm && (a.distanceKm || 0) >= 2).reverse();
  // rolling average over the last 5 runs – single runs zig-zag between easy and tempo days
  const paceChart = line(runs.map((r, i) => {
    const rolling = avg(runs.slice(Math.max(0, i - 4), i + 1).map((x) => x.paceSecPerKm));
    return {
      x: ms(r.date), y: rolling,
      tip: `<b>${esc(actTitle(r))}</b><br>${esc(fmtDate(r.date))}<br>${fmtPace(r.paceSecPerKm)} /km · ${fmtNum(r.distanceKm, 1)} km${r.avgHr ? ` · ${r.avgHr} bpm` : ''}<br>Ø letzte 5 Läufe: ${fmtPace(rolling)} /km`,
    };
  }), { invert: true, yFormat: fmtPace, steps: [10, 15, 30, 60, 120], color: 'var(--s-run)', xLabels: xLabels(runs.map((r) => r.date)), area: false });

  const metricLine = (key, label, unit, digits = 0) => {
    const pts = days.filter((d) => typeof d[key] === 'number');
    return line(pts.map((d) => ({ x: ms(d.date), y: d[key], tip: `<b>${esc(fmtDate(d.date))}</b><br>${label}: ${fmtNum(d[key], digits)} ${unit}` })),
      { color: 'var(--series-1)', xLabels: xLabels(pts.map((d) => d.date)) });
  };

  const sleepDays = days.slice(-Math.min(days.length, weeks <= 4 ? 28 : 42)).filter((d) => d.sleepH);
  const sleepCols = sleepDays.map((d) => ({
    label: fmtDate(d.date, { day: 'numeric', month: 'numeric' }),
    tip: `<b>${esc(fmtDate(d.date))}</b><br>${fmtNum(d.sleepH, 1)} h Schlaf${d.sleepScore ? `<br>Score ${d.sleepScore}` : ''}${d.deepH ? `<br>Tief ${fmtNum(d.deepH, 1)} h · REM ${fmtNum(d.remH, 1)} h` : ''}`,
    segments: [{ type: 'sleep', value: d.sleepH, color: 'var(--series-1)' }],
  }));

  const per = minutesBySport(acts);
  const dist = Object.entries(per).sort((a, b) => b[1] - a[1]).map(([t, m]) => ({
    label: `${sport(t).emoji} ${SPORT_LABELS[t]}`, value: m, display: fmtDur(m), color: sportColor(t),
  }));

  const snap = snapshot();
  const races = snap.racePredictions;
  const types = sportsIn(acts);

  return `
    ${pageHead('Verlauf', 'Entwicklung über die Zeit', `<div class="segmented" role="group" aria-label="Zeitraum">${[4, 12, 26, 52].map((w) => `<button data-action="trend-range" data-weeks="${w}" aria-pressed="${weeks === w}">${w === 52 ? '1 J' : `${w} W`}</button>`).join('')}</div>`)}
    ${historyTabs()}
    ${demoBanner()}
    <section class="grid two">
      <article class="card wide">
        <header class="card-head"><h2>Trainingsumfang pro Woche</h2><span class="muted small">Stunden nach Sportart</span></header>
        ${bars(volumeCols, { unit: 'h' })}
        ${types.length ? legend(types, SPORT_LABELS) : ''}
      </article>
      <article class="card">
        <header class="card-head"><h2>Lauf-Pace</h2><span class="muted small">Ø 5 Läufe · höher = schneller</span></header>
        ${paceChart}
      </article>
      <article class="card">
        <header class="card-head"><h2>Laufkilometer pro Woche</h2></header>
        ${bars(kmCols, { unit: 'km' })}
      </article>
      <article class="card">
        <header class="card-head"><h2>HRV (Nacht)</h2><span class="muted small">ms</span></header>
        ${metricLine('hrv', 'HRV', 'ms')}
      </article>
      <article class="card">
        <header class="card-head"><h2>Ruhepuls</h2><span class="muted small">bpm</span></header>
        ${metricLine('restingHr', 'Ruhepuls', 'bpm')}
      </article>
      <article class="card">
        <header class="card-head"><h2>Schlaf</h2><span class="muted small">Stunden pro Nacht</span></header>
        ${sleepCols.length ? bars(sleepCols, { unit: 'h', height: 150 }) : '<p class="empty-chart">Keine Schlafdaten.</p>'}
      </article>
      <article class="card">
        <header class="card-head"><h2>Verteilung</h2><span class="muted small">Trainingszeit im Zeitraum</span></header>
        ${dist.length ? hbars(dist) : '<p class="muted">Keine Aktivitäten im Zeitraum.</p>'}
      </article>
      ${strengthTrends(acts, ms, xLabels)}
      ${races || snap.lactateThreshold || snap.vo2max ? `<article class="card">
        <header class="card-head"><h2>Leistungswerte</h2><span class="muted small">Garmin</span></header>
        <dl class="stat-grid">
          ${snap.vo2max ? `<div><dt>VO₂max</dt><dd>${fmtNum(snap.vo2max, 1)}</dd></div>` : ''}
          ${snap.lactateThreshold?.heartRate ? `<div><dt>Laktatschwelle</dt><dd>${snap.lactateThreshold.heartRate} bpm${snap.lactateThreshold.paceSecPerKm ? ` · ${fmtPace(snap.lactateThreshold.paceSecPerKm)}/km` : ''}</dd></div>` : ''}
          ${races ? [['5 km', races['5k']], ['10 km', races['10k']], ['Halbmarathon', races.half], ['Marathon', races.marathon]].filter(([, v]) => v).map(([k, v]) => `<div><dt>Prognose ${k}</dt><dd>${fmtClock(v)}</dd></div>`).join('') : ''}
        </dl>
      </article>` : ''}
    </section>`;
}

function strengthTrends(acts, ms, xLabels) {
  const sessions = acts.filter((a) => a.exercises?.length).reverse(); // oldest first
  if (!sessions.length) return '';
  const counts = new Map();
  for (const a of sessions) for (const e of a.exercises) counts.set(e.id, { name: e.name, unit: e.unit, n: (counts.get(e.id)?.n || 0) + 1 });
  const options = [...counts].sort((x, y) => y[1].n - x[1].n);
  if (!counts.has(state.trendExercise)) state.trendExercise = options[0][0];
  const current = counts.get(state.trendExercise);

  const points = sessions.flatMap((a) => {
    const e = a.exercises.find((x) => x.id === state.trendExercise);
    if (!e) return [];
    const best = bestE1rm(e);
    const y = best ?? Math.max(...e.sets.map((s) => s.reps || 0));
    return [{ x: ms(a.date), y, date: a.date, tip: `<b>${esc(fmtDate(a.date))}</b><br>${esc(fmtSets(e.sets, e.unit))}${best ? `<br>≈ 1RM ${fmtNum(best)} kg` : ''}` }];
  });
  const weighted = points.length && sessions.some((a) => a.exercises.some((e) => e.id === state.trendExercise && bestE1rm(e)));
  const unit = weighted ? 'kg' : current.unit === 's' ? 's' : 'Wdh.';

  const perGroup = {};
  for (const a of sessions) for (const e of a.exercises) perGroup[e.group || 'Eigene'] = (perGroup[e.group || 'Eigene'] || 0) + e.sets.length;
  const groups = Object.entries(perGroup).sort((x, y) => y[1] - x[1])
    .map(([g, n]) => ({ label: g, value: n, display: `${n} ${n === 1 ? 'Satz' : 'Sätze'}`, color: 'var(--s-strength)' }));

  return `<article class="card">
      <header class="card-head"><h2>Kraft-Fortschritt</h2>
        <select id="trend-ex" class="mini-select" aria-label="Übung wählen">${options.map(([id, o]) => `<option value="${esc(id)}" ${id === state.trendExercise ? 'selected' : ''}>${esc(o.name)}</option>`).join('')}</select>
      </header>
      ${line(points, { color: 'var(--s-strength)', yFormat: (v) => `${fmtNum(v)}`, xLabels: xLabels(points.map((p) => p.date)) })}
      <p class="muted small" style="margin-top:8px">${weighted ? 'Geschätztes Maximalgewicht (1RM, Epley-Formel) pro Training in kg' : `Beste Leistung pro Training in ${unit}`}</p>
    </article>
    <article class="card">
      <header class="card-head"><h2>Sätze pro Muskelgruppe</h2><span class="muted small">im Zeitraum</span></header>
      ${hbars(groups)}
    </article>`;
}

// ───────────────────────── page: settings ─────────────────────────
function renderSettings() {
  const cfg = store.getConfig();
  const prefs = store.getPrefs();
  const p = profile();
  const live = store.isLive();
  const fb = p.modules.football;
  const connection = `<article class="card">
        <header class="card-head"><h2>${icon('link', 18)} GitHub-Verbindung</h2>${live ? '<span class="chip good">Verbunden</span>' : ''}</header>
        <p class="muted small">Deine Daten liegen als JSON-Dateien in einem (privaten) GitHub-Repository. Der Token bleibt nur auf diesem Gerät gespeichert. Anleitung im README.</p>
        <form id="cfg-form" class="form">
          <div class="row">
            <label class="field"><span>GitHub-Benutzer</span><input name="owner" value="${esc(cfg.owner || store.detectedRepo().owner || '')}" placeholder="schnre" required autocomplete="username" autocapitalize="off" spellcheck="false"></label>
            <label class="field"><span>Branch</span><input name="branch" value="${esc(cfg.branch || 'main')}" autocapitalize="off" spellcheck="false"></label>
          </div>
          <div class="row">
            <label class="field"><span>Daten-Repo</span><input name="dataRepo" value="${esc(cfg.dataRepo || '')}" placeholder="healthy_football_data" required autocapitalize="off" spellcheck="false"></label>
            <label class="field"><span>App-Repo (Workflows)</span><input name="codeRepo" value="${esc(live ? store.appRepo() : (cfg.codeRepo || store.detectedRepo().codeRepo || ''))}" placeholder="Healthy_Football" autocapitalize="off" spellcheck="false"></label>
          </div>
          <label class="field"><span>Fine-grained Personal Access Token</span><input name="token" type="password" value="${esc(cfg.token || '')}" placeholder="github_pat_…" autocomplete="off"></label>
          <div class="form-actions">
            ${live ? `<button type="button" class="btn btn-danger" data-action="disconnect">Trennen</button>` : ''}
            <button type="submit" class="btn btn-primary">${icon('check', 16)}Speichern & testen</button>
          </div>
        </form>
      </article>`;
  return `
    ${pageHead('Einstellungen', live ? `Verbunden mit ${esc(cfg.owner)}/${esc(cfg.dataRepo)}` : 'Demo-Modus')}
    <section class="grid two settings">
      ${live ? '' : connection}
      <article class="card">
        <header class="card-head"><h2>${icon('user', 18)} Profil für den Coach</h2></header>
        <form id="profile-form" class="form">
          <div class="row">
            <label class="field grow"><span>Name</span><input name="name" value="${esc(p.name || '')}" autocomplete="given-name"></label>
            <label class="field"><span>Alter</span><input name="age" type="number" inputmode="numeric" min="10" max="99" value="${esc(p.age ?? '')}"></label>
          </div>
          <div class="row">
            <label class="field"><span>Gewicht (kg)</span><input name="weightKg" type="number" inputmode="decimal" step="0.1" value="${esc(p.weightKg ?? '')}"></label>
            <label class="field"><span>Max. Puls</span><input name="maxHr" type="number" inputmode="numeric" value="${esc(p.maxHr ?? '')}"></label>
            <label class="field"><span>Tage/Woche</span><input name="trainingDays" type="number" inputmode="numeric" min="1" max="7" value="${esc(p.trainingDays ?? '')}"></label>
          </div>
          ${fb ? `<div class="row">
            <label class="field grow"><span>Position</span>
              <select name="position">${['', 'Sturm', 'Flügel', 'Offensives Mittelfeld', 'Zentrales Mittelfeld', 'Defensives Mittelfeld', 'Aussenverteidigung', 'Innenverteidigung', 'Torhüter'].map((o) => `<option ${p.position === o ? 'selected' : ''}>${o}</option>`).join('')}</select>
            </label>
            <label class="field grow"><span>Niveau / Liga</span><input name="level" value="${esc(p.level || '')}" placeholder="z.B. 4. Liga"></label>
          </div>` : ''}
          <fieldset class="type-picker">
            <legend>Deine Sportarten <em class="muted">(steuert die Auswahl beim Erfassen und den Coach)</em></legend>
            ${Object.keys(SPORTS).filter((k) => k !== 'other' && (k !== 'football' || fb)).map((k) => `<label style="--c:${sportColor(k)}"><input type="checkbox" name="sports" value="${k}" ${!p.sports?.length || p.sports.includes(k) ? 'checked' : ''}><span>${SPORTS[k].emoji}</span>${esc(SPORTS[k].label)}</label>`).join('')}
          </fieldset>
          <label class="field"><span>Verletzungen / Einschränkungen</span><textarea name="injuries" rows="2">${esc(p.injuries || '')}</textarea></label>
          <p class="muted small">Ziele legst du im <a class="link" href="#/coach">Coach</a> fest, Fixtermine im <a class="link" href="#/plan">Plan</a>.</p>
          <div class="form-actions"><button type="submit" class="btn btn-primary">${icon('check', 16)}Profil speichern</button></div>
        </form>
      </article>

      <article class="card">
        <header class="card-head"><h2>${icon('sparkles', 18)} Module</h2></header>
        <label class="switch"><input type="checkbox" data-module="football" ${fb ? 'checked' : ''}><span></span>⚽ Fussball</label>
        <p class="muted small">Blendet Match-Felder (Gegner, Resultat, Tore), Position, Liga, Saisonphase und das Ziel «Matchfitness» ein. Der Coach berücksichtigt dann zusätzlich Matchtage.</p>
      </article>

      ${nutritionCard(p)}
      ${exercisesCard(p)}

      <article class="card">
        <header class="card-head"><h2>${icon('refresh', 18)} Automatisierung</h2></header>
        <label class="switch"><input type="checkbox" data-pref="analyzeAfterEntry" ${prefs.analyzeAfterEntry ? 'checked' : ''}><span></span>Nach jedem erfassten Training automatisch analysieren (kostet API-Guthaben)</label>
        <p class="muted small">Garmin wird automatisch alle 3 Stunden synchronisiert – das ist gratis. Claude analysiert nur, wenn du «Neu analysieren» drückst oder eine Frage stellst (ca. 0.10–0.20 USD pro Analyse).</p>
        <p class="muted small">Letzter Garmin-Sync: <strong>${esc(relTime(state.data?.garmin?.updatedAt))}</strong> · Letzte Analyse: <strong>${esc(relTime(state.data?.insights?.generatedAt))}</strong></p>
        <div class="form-actions">
          <button class="btn" data-action="sync">${icon('refresh', 16)}Garmin jetzt synchronisieren</button>
          <button class="btn" data-action="analyze">${icon('sparkles', 16)}Analyse starten</button>
        </div>
      </article>

      <article class="card">
        <header class="card-head"><h2>${icon('sun', 18)} Darstellung & Geräte</h2></header>
        <div class="segmented" role="group" aria-label="Farbschema">${[['system', 'System'], ['light', 'Hell'], ['dark', 'Dunkel']].map(([k, l]) => `<button data-action="theme" data-theme="${k}" aria-pressed="${prefs.theme === k}">${l}</button>`).join('')}</div>
        <h3 class="sub">Anderes Gerät verbinden</h3>
        <p class="muted small">Kopiert einen Link mit deiner Konfiguration <strong>inklusive Token</strong>. Öffne ihn auf dem Handy und füge die App danach zum Home-Bildschirm hinzu. Schicke ihn nur an dich selbst.</p>
        <div class="form-actions">
          <button class="btn" data-action="copy-link" ${live ? '' : 'disabled'}>${icon('link', 16)}Setup-Link kopieren</button>
          <button class="btn" data-action="export">${icon('download', 16)}Daten exportieren</button>
          ${live ? '' : `<button class="btn" data-action="reset-demo">Demo zurücksetzen</button>`}
        </div>
      </article>
      ${live ? connection : ''}
    </section>`;
}

function targetRow(t = {}) {
  return `<div class="row target-row">
    <label class="field grow"><span>Messbares Ziel</span><input name="targetText" value="${esc(t.text || '')}" placeholder="z.B. 10 km unter 45:00 · Back Squat 100 kg"></label>
    <label class="field"><span>Bis</span><input name="targetDate" type="date" value="${esc(t.date || '')}"></label>
    <button type="button" class="icon-btn" data-action="remove-target" aria-label="Ziel entfernen">${icon('trash', 16)}</button>
  </div>`;
}

/** Goals sheet: free text first (what the user wants), then focus sliders, measurable targets. */
function openGoalsForm() {
  const p = profile();
  const g = p.goals;
  const areas = { ...AREAS, ...(p.modules.football ? FOOTBALL_AREAS : {}) };
  openSheet(`<form id="goals-form" class="sheet-body form">
    ${sheetBar('Dein Auftrag', { sub: 'Fliesst in die nächste Analyse ein' })}
    <label class="field"><span>Was willst du erreichen?</span>
      <textarea name="notes" rows="3" maxlength="1500" placeholder="z.B. Mehr Kraft im Oberkörper, 2× pro Woche laufen, im Frühling einen Halbmarathon. Ich mag keine Bahnintervalle.">${esc(g.notes)}</textarea>
    </label>
    <fieldset class="sliders">
      <legend>Schwerpunkte</legend>
      ${Object.entries(areas).map(([k, a]) => {
        const w = g.weights[k] || 0;
        return `<label class="slider-row">
          <span class="slider-label">${a.emoji} ${esc(a.label)}</span>
          <output data-for="w_${k}">${esc(WEIGHT_LABELS[w])}</output>
          <input type="range" name="w_${k}" min="0" max="4" step="1" value="${w}" aria-label="${esc(a.label)}" aria-valuetext="${esc(WEIGHT_LABELS[w])}">
        </label>`;
      }).join('')}
    </fieldset>
    <div class="targets">${(g.targets.length ? g.targets : [{}]).map(targetRow).join('')}</div>
    <button type="button" class="btn btn-sm add-target" data-action="add-target">${icon('plus', 14)}Weiteres Ziel</button>
    ${p.modules.football ? `<fieldset>
      <legend>Saisonphase</legend>
      <div class="segmented">${Object.entries(PHASES).map(([k, l]) => `<label><input type="radio" name="phase" value="${k}" ${g.phase === k ? 'checked' : ''}>${esc(l)}</label>`).join('')}</div>
    </fieldset>` : ''}
    <div class="sheet-spacer"></div>
  </form>`);
}

function nutritionCard(p) {
  const n = p.nutrition;
  return `<article class="card">
    <header class="card-head"><h2>🍽️ Ernährung</h2>${n.enabled ? '<span class="chip good">Aktiv</span>' : ''}</header>
    <form id="nutrition-form" class="form">
      <label class="switch"><input type="checkbox" name="enabled" ${n.enabled ? 'checked' : ''}><span></span>Ernährungstipps vom Coach (Faustregeln vor und nach dem Training)</label>
      <div class="row">
        <label class="field"><span>Ernährungsform</span><select name="diet">${DIETS.map((d) => `<option ${n.diet === d ? 'selected' : ''}>${d}</option>`).join('')}</select></label>
        <label class="field grow"><span>Unverträglichkeiten / Allergien</span><input name="intolerances" value="${esc(n.intolerances)}" placeholder="z.B. Laktose, Nüsse"></label>
      </div>
      <p class="muted small">Grundlage: Leitlinien von ACSM und ISSN${p.modules.football ? ' sowie UEFA' : ''} zur Sporternährung. Keine medizinische Beratung – bei Allergien oder Erkrankungen Fachperson fragen.</p>
      <div class="form-actions"><button type="submit" class="btn btn-primary">${icon('check', 16)}Speichern</button></div>
    </form>
  </article>`;
}

function exercisesCard(p) {
  const custom = p.customExercises;
  return `<article class="card">
    <header class="card-head"><h2>🏋️ Übungen</h2><span class="muted small">${custom.length} eigene</span></header>
    ${custom.length ? `<ul class="custom-ex">${custom.map((e) => `<li><span>${esc(e.name)} <span class="muted small">· ${esc(e.group || 'Eigene')}${e.unit === 's' ? ' · Sekunden' : ''}</span></span>
      <button class="icon-btn sm" data-action="remove-exercise" data-id="${esc(e.id)}" aria-label="${esc(e.name)} entfernen">${icon('trash', 16)}</button></li>`).join('')}</ul>` : '<p class="muted small">Noch keine eigenen Übungen. Du kannst sie hier oder direkt beim Erfassen eines Krafttrainings anlegen.</p>'}
    <form id="exercise-form" class="form" style="margin-top:14px">
      <div class="row">
        <label class="field grow"><span>Neue Übung</span><input name="name" placeholder="z.B. Sled Push" required maxlength="60"></label>
        <label class="field"><span>Gruppe</span><select name="group">${MUSCLE_GROUPS.map((g) => `<option ${g === 'Eigene' ? 'selected' : ''}>${g}</option>`).join('')}</select></label>
        <label class="field"><span>Messung</span><select name="unit"><option value="">Wiederholungen</option><option value="s">Sekunden</option></select></label>
      </div>
      <div class="form-actions"><button type="submit" class="btn">${icon('plus', 16)}Übung hinzufügen</button></div>
    </form>
    <details class="builtin-ex"><summary class="muted small">Standardliste anzeigen</summary>
      ${MUSCLE_GROUPS.filter((g) => g !== 'Eigene').map((g) => `<p class="small"><strong>${g}:</strong> ${catalog({}).filter((e) => e.group === g).map((e) => esc(e.name)).join(', ')}</p>`).join('')}
    </details>
  </article>`;
}

async function saveProfile(mutate, message) {
  try {
    const next = await store.updateProfile((raw) => JSON.parse(JSON.stringify(mutate(normalizeProfile(raw)))));
    state.data.profile = next;
    toast(message);
    render();
  } catch (err) {
    toast(`Speichern fehlgeschlagen: ${err.message}`, 'error');
  }
}

function submitGoals(form) {
  const fd = new FormData(form);
  const texts = fd.getAll('targetText');
  const dates = fd.getAll('targetDate');
  const weights = {};
  for (const [k, v] of fd) if (k.startsWith('w_') && Number(v) > 0) weights[k.slice(2)] = Number(v);
  sheet.close();
  return saveProfile((p) => ({
    ...p,
    goals: {
      ...p.goals,
      weights: { ...(p.modules.football ? {} : { match_fitness: p.goals.weights.match_fitness }), ...weights },
      ...(fd.has('phase') ? { phase: fd.get('phase') || '' } : {}),
      targets: texts.map((text, i) => ({ text: text.trim(), date: dates[i] || '' })).filter((t) => t.text),
      notes: fd.get('notes').trim(),
    },
  }), 'Ziele gespeichert – tippe auf «Neu analysieren», damit der Coach sie umsetzt');
}

function submitNutrition(form) {
  const fd = new FormData(form);
  const nutrition = { enabled: fd.get('enabled') === 'on', diet: fd.get('diet'), intolerances: fd.get('intolerances').trim() };
  return saveProfile((p) => ({ ...p, nutrition }), nutrition.enabled ? 'Ernährungstipps aktiviert' : 'Ernährung gespeichert');
}

function submitExercise(form) {
  const fd = new FormData(form);
  const name = fd.get('name').trim();
  if (!name) return null;
  if (catalog(profile()).some((e) => e.name.toLowerCase() === name.toLowerCase())) { toast('Diese Übung gibt es schon.', 'error'); return null; }
  const exercise = { id: `c_${slug(name)}`, name, group: fd.get('group'), ...(fd.get('unit') ? { unit: 's' } : {}) };
  return saveProfile((p) => ({ ...p, customExercises: [...p.customExercises, exercise] }), `«${name}» hinzugefügt`);
}

function addExercise() {
  const input = $('#ex-search');
  const form = $('#act-form');
  const name = input.value.trim();
  if (!name || !form) return;
  let exercise = catalog(profile()).find((e) => e.name.toLowerCase() === name.toLowerCase());
  if (!exercise) {
    exercise = { id: `c_${slug(name)}`, name, group: 'Eigene' };
    form.dataset.newExercises = JSON.stringify([...JSON.parse(form.dataset.newExercises || '[]'), exercise]);
  }
  if ([...form.querySelectorAll('.ex-block')].some((b) => b.dataset.exId === exercise.id)) { toast('Diese Übung ist schon drin.'); return; }
  form.querySelector('.ex-list').insertAdjacentHTML('beforeend', exerciseBlock(exercise, lastSession(activities(), exercise.id, form.dataset.id)));
  input.value = '';
  form.querySelector('.ex-block:last-child [data-f=kg]')?.focus();
}

async function submitConfig(form) {
  const fd = Object.fromEntries(new FormData(form));
  const cfg = {
    owner: fd.owner.trim(), dataRepo: fd.dataRepo.trim(),
    codeRepo: fd.codeRepo.trim() || store.detectedRepo().codeRepo || fd.dataRepo.trim(), branch: fd.branch.trim() || 'main', token: fd.token.trim(),
  };
  store.saveConfig(cfg);
  try {
    const info = await store.testConnection();
    if (!info.canWrite) toast('Verbunden, aber der Token hat keine Schreibrechte auf das Daten-Repo («Contents: Read and write»).', 'error', 8000);
    else if (!info.workflows) toast(`Daten OK, aber kein Zugriff auf die Workflows in ${info.codeRepo}. Der Token braucht auch dieses Repo mit «Actions: Read and write».`, 'error', 10000);
    else toast(`Verbunden mit ${info.dataRepo}${info.private ? ' (privat)' : ''} · Workflows in ${info.codeRepo} erreichbar`);
    await reload();
  } catch (err) {
    toast(`Verbindung fehlgeschlagen: ${err.message}`, 'error', 6000);
  }
}

function submitProfile(form) {
  const fd = new FormData(form);
  const basics = { sports: fd.getAll('sports') };
  // position/level only exist with the football module – keep the stored values when the fields are hidden
  for (const k of ['name', 'position', 'level', 'injuries']) if (fd.has(k)) basics[k] = (fd.get(k) || '').trim() || undefined;
  for (const k of ['age', 'weightKg', 'maxHr', 'trainingDays']) basics[k] = fd.get(k) ? Number(fd.get(k)) : undefined;
  return saveProfile((p) => {
    const { raceGoal, ...rest } = p; // folded into goals.targets by normalizeProfile
    const keepFootball = p.sports?.includes('football') && !p.modules.football;
    return { ...rest, ...basics, sports: keepFootball ? [...basics.sports, 'football'] : basics.sports };
  }, 'Profil gespeichert');
}

// ───────────────────────── page: plan ─────────────────────────
function renderPlan() {
  const ins = state.data.insights || {};
  const an = analysis();
  const p = profile();
  const today = todayISO();
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const stale = an && !(an.plan || []).some((x) => x.date >= addDays(today, 1));
  const head = pageHead('Plan', an ? `Vom Coach erstellt ${esc(relTime(ins.generatedAt))}` : 'Deine nächsten 7 Tage',
    `<button class="btn btn-primary" data-action="analyze" ${state.pending ? 'disabled' : ''}>${icon('sparkles', 16)}<span>Neu planen</span></button>`);

  const week = days.map((d) => {
    const { fixed, sessions, blocked } = dayItems(d);
    const items = [...fixed, ...sessions];
    return `<section class="plan-day${d === today ? ' is-today' : ''}${blocked ? ' is-blocked' : ''}" aria-label="${esc(fmtDate(d, { weekday: 'long', day: 'numeric', month: 'long' }))}">
      <header><span class="plan-dow">${d === today ? 'Heute' : esc(fmtDate(d, { weekday: 'long' }))}</span><span class="plan-date">${esc(fmtDate(d, { day: 'numeric', month: 'short' }))}</span></header>
      <div class="plan-items">${items.map((x) => planEntry(x, { editable: true })).join('') || `<p class="plan-empty">${an ? 'Nichts geplant' : '–'}</p>`}</div>
    </section>`;
  }).join('');

  const weekly = [...p.schedule.recurring].sort((a, b) => a.weekday - b.weekday || (a.time || '').localeCompare(b.time || ''));
  const once = p.schedule.once.filter((o) => o.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  const fixedRow = (f, when) => `<button class="list-row" data-action="edit-fixed" data-id="${esc(f.id)}">
      <span class="act-icon sm" style="--c:${f.kind === 'blocked' ? 'var(--ink-3)' : sportColor(f.type)}">${f.kind === 'blocked' ? '⛔' : sport(f.type).emoji}</span>
      <span class="list-row-main"><strong>${esc(f.title || (f.kind === 'blocked' ? 'Keine Zeit' : sport(f.type).label))}</strong><span class="muted small">${esc(when)}</span></span>
      ${icon('chevron', 16)}
    </button>`;

  return `${head}${demoBanner()}${pendingBanner()}
    ${!an ? `<div class="banner">${icon('sparkles', 18)}<p>Trag zuerst deine Fixtermine ein und starte dann die Analyse. Der Coach plant die Woche um deine Termine herum.</p></div>` : ''}
    ${stale ? `<div class="banner">${icon('alert', 18)}<p>Dieser Plan ist älter als eine Woche. Tippe auf «Neu planen», dann erstellt der Coach die nächsten 7 Tage.</p></div>` : ''}
    <div class="week">${week}</div>
    <section class="grid two">
      <article class="card">
        <header class="card-head"><h2>${icon('lock', 18)} Wöchentliche Fixtermine</h2><button class="btn btn-sm" data-action="add-fixed" data-kind="recurring">${icon('plus', 14)}Termin</button></header>
        ${weekly.length ? `<div class="list">${weekly.map((f) => fixedRow(f, `Jeden ${WEEKDAYS[f.weekday - 1]}${f.time ? ` · ${f.time}` : ''}${f.durationMin ? ` · ${fmtDur(f.durationMin)}` : ''}`)).join('')}</div>`
          : '<p class="muted small">Zum Beispiel Teamtraining, Kurs oder Lauftreff. Der Coach plant diese Termine fest ein.</p>'}
        ${p.scheduleNote ? `<p class="note">${icon('edit', 14)}<span>Deine frühere Notiz: «${esc(p.scheduleNote)}». Der Coach liest sie weiterhin. Trag die Termine oben ein und entferne sie danach. <button class="link" data-action="clear-schedule-note">Notiz entfernen</button></span></p>` : ''}
      </article>
      <article class="card">
        <header class="card-head"><h2>${icon('calendar', 18)} Einmalige Termine</h2><button class="btn btn-sm" data-action="add-fixed" data-kind="once">${icon('plus', 14)}Termin</button></header>
        ${once.length ? `<div class="list">${once.map((f) => fixedRow(f, `${fmtDate(f.date, { weekday: 'short', day: 'numeric', month: 'short' })}${f.time ? ` · ${f.time}` : ''}${f.kind === 'blocked' ? ' · keine Zeit' : f.durationMin ? ` · ${fmtDur(f.durationMin)}` : ''}`)).join('')}</div>`
          : '<p class="muted small">Ein Wettkampf, ein Event oder ein Tag, an dem du keine Zeit hast (Ferien, Arbeit).</p>'}
      </article>
    </section>`;
}

function openFixedForm(existing, kind = 'recurring') {
  const p = profile();
  const isOnce = existing ? Boolean(existing.date) : kind === 'once';
  const f = existing || { type: pickableSports().find((k) => k !== 'other') || 'other', time: '18:00', durationMin: 60, weekday: 1, date: todayISO(), kind: 'session' };
  const types = pickableSports(f.type);
  openSheet(`<form id="fixed-form" class="sheet-body form" data-id="${esc(f.id || '')}" data-list="${isOnce ? 'once' : 'recurring'}" novalidate>
    ${sheetBar(existing ? 'Termin bearbeiten' : isOnce ? 'Einmaliger Termin' : 'Wöchentlicher Termin')}
    ${isOnce ? `<div class="segmented full">
        <label><input type="radio" name="kind" value="session" ${f.kind !== 'blocked' ? 'checked' : ''}>Training / Event</label>
        <label><input type="radio" name="kind" value="blocked" ${f.kind === 'blocked' ? 'checked' : ''}>Keine Zeit</label>
      </div>
      <label class="field"><span>Datum</span><input type="date" name="date" value="${esc(f.date)}" min="${todayISO()}" required></label>`
    : `<fieldset class="weekday-picker"><legend>Wochentag</legend>
        ${WEEKDAYS.map((w, i) => `<label><input type="radio" name="weekday" value="${i + 1}" ${Number(f.weekday) === i + 1 ? 'checked' : ''}><span aria-label="${w}">${w.slice(0, 2)}</span></label>`).join('')}
      </fieldset>`}
    <div class="row">
      <label class="field"><span>Uhrzeit <em>optional</em></span><input type="time" name="time" value="${esc(f.time || '')}"></label>
      <label class="field session-only"><span>Dauer (min)</span><input type="number" name="durationMin" inputmode="numeric" min="5" max="600" value="${esc(f.durationMin ?? '')}"></label>
    </div>
    <fieldset class="type-picker session-only">
      <legend>Sportart</legend>
      ${types.map((k) => `<label style="--c:${sportColor(k)}"><input type="radio" name="type" value="${k}" ${f.type === k ? 'checked' : ''}><span>${SPORTS[k].emoji}</span>${esc(SPORTS[k].label)}</label>`).join('')}
    </fieldset>
    <label class="field"><span>Titel</span><input name="title" value="${esc(f.title || '')}" maxlength="60" placeholder="${isOnce ? 'z.B. Stadtlauf 10 km, Ferien' : 'z.B. Teamtraining, Spinning-Kurs'}"></label>
    ${p.modules.football && !isOnce ? '<p class="muted small">Tipp: Nenne Matches «Match», dann plant der Coach den Vortag locker.</p>' : ''}
    ${existing ? `<button type="button" class="btn btn-danger btn-block" data-action="delete-fixed" data-id="${esc(f.id)}" data-list="${isOnce ? 'once' : 'recurring'}">${icon('trash', 16)}Termin löschen</button>` : ''}
    <div class="sheet-spacer"></div>
  </form>`);
}

function submitFixed(form) {
  const fd = new FormData(form);
  const list = form.dataset.list;
  const blocked = fd.get('kind') === 'blocked';
  if (list === 'once' && !fd.get('date')) { form.elements.date.setAttribute('aria-invalid', 'true'); toast('Bitte ein Datum wählen.', 'error'); return null; }
  const entry = JSON.parse(JSON.stringify({
    id: form.dataset.id || uid('f'),
    ...(list === 'once' ? { date: fd.get('date'), kind: blocked ? 'blocked' : 'session' } : { weekday: Number(fd.get('weekday') || 1) }),
    time: fd.get('time') || undefined,
    durationMin: blocked ? undefined : Number(fd.get('durationMin')) || undefined,
    type: blocked ? undefined : fd.get('type') || 'other',
    title: fd.get('title').trim() || undefined,
  }));
  sheet.close();
  return saveProfile((p) => {
    const items = p.schedule[list].filter((x) => x.id !== entry.id);
    return { ...p, schedule: { ...p.schedule, [list]: [...items, entry] } };
  }, 'Termin gespeichert – mit «Neu planen» baut der Coach ihn ein');
}

function findFixed(id) {
  const p = profile();
  return p.schedule.recurring.find((x) => x.id === id) || p.schedule.once.find((x) => x.id === id);
}

// ───────────────────────── page: history (activities · trends · records) ─────────────────────────
function historyTabs() {
  return `<nav class="segmented full history-tabs" aria-label="Verlauf">${Object.entries(HISTORY_TABS).map(([k, l]) =>
    `<a href="#/verlauf${k ? `/${k}` : ''}" ${state.sub === k ? 'aria-current="page"' : ''}>${l}</a>`).join('')}</nav>`;
}

function renderHistory() {
  if (state.sub === 'trends') return renderTrends();
  if (state.sub === 'bestwerte') return renderRecords();
  return renderActivities();
}

function renderRecords() {
  const p = profile();
  const grouped = [...recordsByExercise(p.records).values()].sort((a, b) => a.name.localeCompare(b.name, 'de'));
  const suggestions = recordSuggestions(activities(), p.records);
  const kg = (v) => fmtKg(v);

  const suggestCard = suggestions.length ? `<article class="card">
    <header class="card-head"><h2>${icon('sparkles', 18)} Neu aus deinen Trainings</h2></header>
    <div class="list">${suggestions.map((s) => `<div class="list-row static">
      <span class="act-icon sm" style="--c:var(--accent)">🏆</span>
      <span class="list-row-main"><strong>${esc(s.name)} · ${s.reps}RM ${kg(s.kg)}</strong>
        <span class="muted small">${esc(relDay(s.date))}${s.previous ? ` · bisher ${kg(s.previous)}` : ' · noch kein Eintrag'}</span></span>
      <button class="btn btn-sm" data-action="accept-record" data-ex="${esc(s.exId)}" data-name="${esc(s.name)}" data-reps="${s.reps}" data-kg="${s.kg}" data-date="${esc(s.date)}">Übernehmen</button>
    </div>`).join('')}</div>
  </article>` : '';

  const cards = grouped.map((ex) => {
    const max = oneRepMax(p.records, ex.exId);
    return `<button class="card record-card" data-action="open-record" data-ex="${esc(ex.exId)}">
      <header><strong>${esc(ex.name)}</strong>${icon('chevron', 16)}</header>
      <div class="record-values">${[...ex.byReps].map(([reps, list]) => {
        const best = list.reduce((b, r) => (r.kg > b.kg ? r : b));
        const prev = list.find((r) => r !== best && r.date < best.date);
        return `<div class="record-value">
          <span class="rm">${reps}RM</span>
          <span class="num">${fmtNum(best.kg, best.kg % 1 ? 1 : 0)}<small>kg</small></span>
          <span class="muted small">${esc(fmtDate(best.date, { day: 'numeric', month: 'short', year: '2-digit' }))}${prev ? ` · <span class="trend good">+${fmtKg(best.kg - prev.kg, false)}</span>` : ''}</span>
        </div>`;
      }).join('')}</div>
      ${max?.estimated ? `<p class="muted small">≈ 1RM ${kg(Math.round(max.kg * 2) / 2)} (geschätzt)</p>` : ''}
    </button>`;
  }).join('');

  return `${pageHead('Verlauf', `${grouped.length} ${grouped.length === 1 ? 'Übung' : 'Übungen'} mit Bestwerten`, `<button class="btn btn-primary" data-action="add-record">${icon('plus', 16)}<span>Bestwert</span></button>`)}
    ${historyTabs()}
    ${demoBanner()}
    ${suggestCard}
    ${grouped.length ? `<section class="records">${cards}</section>`
      : emptyState('Noch keine Bestwerte', 'Trag dein 1RM, 3RM oder eine andere Wiederholungszahl ein, z.B. für Back Squat, Deadlift oder Snatch. Der Coach rechnet deine Trainingsgewichte dann in Prozent davon.', `<button class="btn btn-primary" data-action="add-record">${icon('plus', 16)}Bestwert eintragen</button>`)}`;
}

function openRecordDetail(exId) {
  const p = profile();
  const ex = recordsByExercise(p.records).get(exId);
  if (!ex) return;
  const max = oneRepMax(p.records, exId);
  const ms = (iso) => parseDay(iso).getTime();
  const reps = [...ex.byReps.keys()];
  const chartReps = reps.reduce((best, r) => (ex.byReps.get(r).length > ex.byReps.get(best).length ? r : best), reps[0]);
  const series = [...ex.byReps.get(chartReps)].reverse();
  const chart = line(series.map((r) => ({ x: ms(r.date), y: r.kg, tip: `<b>${esc(fmtDate(r.date))}</b><br>${chartReps}RM ${fmtKg(r.kg)}` })), {
    color: 'var(--accent)', yFormat: (v) => fmtNum(v),
    xLabels: series.length > 1 ? [series[0], series.at(-1)].map((r) => ({ x: ms(r.date), label: fmtDate(r.date, { month: 'short', year: '2-digit' }) })) : [],
  });
  const pcts = [95, 90, 85, 80, 75, 70, 65, 60];
  const round = (v) => Math.round(v / 2.5) * 2.5;

  openSheet(`<div class="sheet-body">
    <header class="sheet-bar">
      <span class="bar-btn" aria-hidden="true"></span>
      <div class="sheet-title"><h2>${esc(ex.name)}</h2><p>${max ? `1RM ${fmtKg(max.kg)}${max.estimated ? ' (geschätzt)' : ''}` : ''}</p></div>
      <button type="button" class="bar-btn strong" data-action="close-sheet">Fertig</button>
    </header>
    <h3 class="sub">${chartReps}RM-Verlauf</h3>
    ${chart}
    ${max ? `<h3 class="sub">Prozenttabelle</h3>
    <div class="pct-grid">${pcts.map((pc) => `<div><span class="muted small">${pc} %</span><strong>${fmtKg(round(max.kg * pc / 100), false)}</strong></div>`).join('')}</div>
    <p class="muted small">Auf 2.5 kg gerundet, Basis: ${max.estimated ? 'aus deinem besten Mehrfach-Max geschätzt (Epley)' : 'dein eingetragenes 1RM'}.</p>` : ''}
    <h3 class="sub">Alle Einträge</h3>
    <div class="list">${p.records.filter((r) => r.exId === exId).sort((a, b) => b.date.localeCompare(a.date)).map((r) => `<div class="list-row static">
      <span class="rm">${r.reps}RM</span>
      <span class="list-row-main"><strong>${fmtKg(r.kg)}</strong><span class="muted small">${esc(fmtDate(r.date, { day: 'numeric', month: 'long', year: 'numeric' }))}${r.note ? ` · ${esc(r.note)}` : ''}</span></span>
      <button class="icon-btn sm" data-action="delete-record" data-id="${esc(r.id)}" aria-label="Eintrag vom ${esc(fmtDate(r.date))} löschen">${icon('trash', 16)}</button>
    </div>`).join('')}</div>
    <footer class="sheet-actions">
      <button class="btn btn-primary" data-action="add-record" data-ex="${esc(exId)}">${icon('plus', 16)}Neuer Eintrag</button>
    </footer>
  </div>`);
}

function openRecordForm(preset = {}) {
  const p = profile();
  const reps = preset.reps || 1;
  const choice = reps === 1 || reps === 3 ? String(reps) : 'x';
  const weighted = catalog(p).filter((e) => !e.bw && e.unit !== 's');
  openSheet(`<form id="record-form" class="sheet-body form" novalidate>
    ${sheetBar('Bestwert eintragen')}
    <label class="field"><span>Übung</span>
      <input name="exercise" list="record-ex-options" value="${esc(preset.name || '')}" placeholder="z.B. Back Squat, Deadlift, Snatch" required autocomplete="off">
      <datalist id="record-ex-options">${weighted.map((e) => `<option value="${esc(e.name)}">${esc(e.group)}</option>`).join('')}</datalist>
    </label>
    <fieldset>
      <legend>Wiederholungen</legend>
      <div class="segmented full">
        <label><input type="radio" name="repsChoice" value="1" ${choice === '1' ? 'checked' : ''}>1RM</label>
        <label><input type="radio" name="repsChoice" value="3" ${choice === '3' ? 'checked' : ''}>3RM</label>
        <label><input type="radio" name="repsChoice" value="x" ${choice === 'x' ? 'checked' : ''}>Andere</label>
      </div>
    </fieldset>
    <div class="row">
      <label class="field reps-custom"><span>Wiederholungen</span><input type="number" name="repsCustom" inputmode="numeric" min="1" max="30" value="${choice === 'x' ? reps : 5}"></label>
      <label class="field"><span>Gewicht (kg)</span><input type="number" name="kg" inputmode="decimal" step="0.5" min="1" max="500" value="${esc(preset.kg ?? '')}" required placeholder="100"></label>
      <label class="field"><span>Datum</span><input type="date" name="date" value="${esc(preset.date || todayISO())}" max="${todayISO()}" required></label>
    </div>
    <label class="field"><span>Notiz <em>optional</em></span><input name="note" maxlength="80" placeholder="z.B. mit Gürtel, Wettkampf"></label>
    <div class="sheet-spacer"></div>
  </form>`);
}

/** Save a rep max; unknown exercise names become custom exercises. */
function saveRecord({ name, exId, reps, kg, date, note }) {
  const p = profile();
  let exercise = exId ? catalog(p).find((e) => e.id === exId) : catalog(p).find((e) => e.name.toLowerCase() === name.toLowerCase());
  const isNew = !exercise;
  if (!exercise) exercise = { id: `c_${slug(name)}`, name, group: 'Eigene' };
  const best = bestRecord(p.records, exercise.id, reps);
  const record = JSON.parse(JSON.stringify({ id: uid('r'), exId: exercise.id, name: exercise.name, reps, kg, date, note: note || undefined }));
  return saveProfile((prof) => ({
    ...prof,
    records: [...prof.records, record],
    customExercises: isNew && !prof.customExercises.some((c) => c.id === exercise.id) ? [...prof.customExercises, exercise] : prof.customExercises,
  }), !best || kg > best.kg ? `🏆 Neuer Bestwert: ${exercise.name} ${reps}RM ${fmtKg(kg)}` : 'Eintrag gespeichert');
}

function submitRecord(form) {
  const fd = new FormData(form);
  const name = fd.get('exercise').trim();
  const reps = fd.get('repsChoice') === 'x' ? Math.round(Number(fd.get('repsCustom'))) : Number(fd.get('repsChoice'));
  const kg = Number(fd.get('kg'));
  const missing = [[!name, 'exercise', 'Übung'], [!(kg > 0), 'kg', 'Gewicht'], [!(reps >= 1 && reps <= 30), 'repsCustom', 'Wiederholungen'], [!fd.get('date'), 'date', 'Datum']].filter(([bad]) => bad);
  if (missing.length) {
    missing.forEach(([, k]) => form.elements[k].setAttribute('aria-invalid', 'true'));
    toast(`Bitte ${missing.map(([, , l]) => l).join(', ')} angeben.`, 'error');
    return null;
  }
  sheet.close();
  return saveRecord({ name, reps, kg, date: fd.get('date'), note: fd.get('note').trim() });
}

// ───────────────────────── workflows (sync / coach) ─────────────────────────
function requireLive() {
  if (store.isLive()) return true;
  toast('Im Demo-Modus nicht verfügbar – verbinde zuerst GitHub in den Einstellungen.', 'error', 5000);
  return false;
}

async function poll(check, { interval = 8000, timeout = 8 * 60000 } = {}) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    await new Promise((r) => setTimeout(r, interval));
    if (await check()) return true;
  }
  return false;
}

async function runWorkflow({ kind, workflow, inputs, fileKey, question, prepare }) {
  if (!requireLive()) return;
  if (state.pending) { toast('Es läuft bereits ein Vorgang – einen Moment bitte.'); return; }
  const stamp = (d) => (fileKey === 'insights' ? d.insights?.generatedAt : d.garmin?.updatedAt);
  const before = stamp(state.data);
  try {
    if (prepare) await prepare();
    await store.dispatch(workflow, inputs);
  } catch (err) {
    const repo = `${store.getConfig().owner}/${store.appRepo()}`;
    toast(err.status === 404 || err.status === 403
      ? `Workflow in ${repo} nicht erreichbar. Prüfe in den Einstellungen das App-Repo und ob der Token Zugriff auf ${repo} mit «Actions: Read and write» hat.`
      : `Start fehlgeschlagen: ${err.message}`, 'error', 10000);
    return;
  }
  const since = Date.now();
  state.pending = { kind, question };
  render();
  try {
    const done = await poll(async () => {
      const value = await store.loadFile(fileKey).catch(() => null);
      const changed = fileKey === 'insights' ? value?.generatedAt : value?.updatedAt;
      if (changed && changed !== before) return true;
      const run = await store.latestRun(workflow).catch(() => null);
      if (run && run.status === 'completed' && run.conclusion !== 'success' && new Date(run.created_at).getTime() > since - 60000) {
        throw Object.assign(new Error(`Workflow «${run.name}» ist fehlgeschlagen`), { url: run.html_url });
      }
      return false;
    });
    state.pending = null;
    await reload();
    if (done) toast(kind === 'sync' ? 'Garmin-Daten aktualisiert' : question ? 'Der Coach hat geantwortet' : 'Neue Coach-Analyse ist da');
    else toast('Das dauert länger als erwartet – schau später nochmals rein.', 'error', 6000);
    if (done && stamp(state.data) === before && kind === 'sync') toast('Keine neuen Garmin-Daten.');
  } catch (err) {
    state.pending = null;
    render();
    toast(`${err.message} – Details im Actions-Tab auf GitHub.`, 'error', 8000);
    if (err.url) console.warn('Workflow-Log:', err.url);
  }
}

const runCoach = (trigger, question = '') => runWorkflow({
  kind: 'coach', workflow: 'coach.yml', inputs: { trigger }, fileKey: 'insights', question,
  prepare: question ? () => store.saveQuestion(question) : null,
});
const runSync = () => runWorkflow({ kind: 'sync', workflow: 'garmin-sync.yml', inputs: { days: '', analyze: 'false' }, fileKey: 'garmin' });

// ───────────────────────── rendering & routing ─────────────────────────
function render(transition = false) {
  const doRender = () => {
    if (!state.data && state.route !== 'einstellungen') {
      view.innerHTML = state.error
        ? emptyState('Daten konnten nicht geladen werden', esc(state.error), '<a class="btn btn-primary" href="#/einstellungen">Einstellungen prüfen</a>')
        : '<div class="loading"><span class="spinner"></span></div>';
    } else {
      view.innerHTML = ROUTES[state.route].render();
    }
    document.title = `${ROUTES[state.route].title} · ${APP_NAME}`;
    $('#topbar-title').textContent = ROUTES[state.route].title;
    document.querySelectorAll('[data-route]').forEach((el) => {
      if (el.dataset.route === state.route) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current');
    });
    renderStatus();
  };
  if (transition && document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.startViewTransition(doRender);
  } else {
    doRender();
  }
}

function renderStatus() {
  const el = $('#side-status');
  if (!state.data) { el.innerHTML = ''; return; }
  el.innerHTML = state.data.mode === 'demo'
    ? `<span class="dot"></span>Demo-Modus`
    : `<span class="dot live"></span>Sync ${esc(relTime(state.data.garmin?.updatedAt))}`;
}

function navigate() {
  let path = location.hash.replace(/^#\/?/, '') || 'heute';
  if (ROUTE_ALIASES[path]) {
    path = ROUTE_ALIASES[path];
    history.replaceState(null, '', `#/${path}`);
  }
  const [route, sub = ''] = path.split('/');
  const next = ROUTES[route] ? route : 'heute';
  const nextSub = next === 'verlauf' && HISTORY_TABS[sub] ? sub : '';
  const changed = next !== state.route || nextSub !== state.sub;
  state.route = next;
  state.sub = nextSub;
  if (sheet.open) sheet.close();
  render(changed && booted); // no cross-fade on the very first paint
  booted = true;
  if (changed) scrollTo({ top: 0 });
}
let booted = false;

async function reload() {
  try {
    state.data = await store.loadAll();
    state.error = null;
  } catch (err) {
    state.error = err.status === 401 ? 'Der Token ist ungültig oder abgelaufen.' : err.message;
    if (state.data) toast(`Aktualisieren fehlgeschlagen: ${state.error}`, 'error');
  }
  render();
}

function applyTheme() {
  const { theme } = store.getPrefs();
  if (theme === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}

function buildNav() {
  const link = (r, cls) => `<a href="#/${r}" data-route="${r}" class="${cls}">${icon(ROUTES[r].icon, 22)}<span>${ROUTES[r].title}</span></a>`;
  $('#side-nav').innerHTML = Object.keys(ROUTES).map((r) => link(r, 'nav-link')).join('');
  // tabs navigate, actions live in the toolbar (tab-bars.md › Best practices)
  $('#tabbar').innerHTML = Object.keys(ROUTES).map((r) => link(r, 'tab')).join('');
  $('#topbar-actions').innerHTML = `<button class="icon-btn glass" data-action="sync" aria-label="Garmin synchronisieren">${icon('refresh')}</button>
    <button class="icon-btn glass prominent" data-action="add" aria-label="Training erfassen">${icon('plus')}</button>`;
  $('#side-add').innerHTML = `${icon('plus', 18)}<span>Training erfassen</span>`;
}

// ───────────────────────── events ─────────────────────────
const actions = {
  add: () => openForm(),
  'open-activity': (el) => openActivity(el.dataset.id),
  'edit-activity': (el) => openForm(activities().find((a) => a.id === el.dataset.id)),
  'delete-activity': async (el) => {
    if (!confirm('Dieses Training wirklich löschen?')) return;
    try {
      await store.deleteActivity(el.dataset.id);
      sheet.close();
      toast('Training gelöscht');
      await reload();
    } catch (err) { toast(`Löschen fehlgeschlagen: ${err.message}`, 'error'); }
  },
  'close-sheet': () => sheet.close(),
  sync: () => runSync(),
  analyze: () => runCoach('button'),
  'coach-tab': (el) => { state.coachTab = Number(el.dataset.tab); render(); },
  filter: (el) => { state.actFilter = el.dataset.type; render(); },
  'trend-range': (el) => { state.trendWeeks = Number(el.dataset.weeks); render(); },
  'ex-add': () => addExercise(),
  'ex-remove': (el) => el.closest('.ex-block').remove(),
  'set-add': (el) => {
    const block = el.closest('.ex-block');
    const rows = block.querySelectorAll('.set-row');
    const prev = rows[rows.length - 1];
    const set = prev ? { kg: prev.querySelector('[data-f=kg]').value, reps: prev.querySelector('[data-f=reps]').value } : {};
    block.querySelector('.sets').insertAdjacentHTML('beforeend', setRow(set, block.dataset.exUnit));
  },
  'set-remove': (el) => el.closest('.set-row').remove(),
  'ex-copy-last': (el) => {
    const block = el.closest('.ex-block');
    block.querySelector('.sets').innerHTML = JSON.parse(el.dataset.sets).map((s) => setRow(s, block.dataset.exUnit)).join('');
  },
  'edit-goals': () => openGoalsForm(),
  'add-fixed': (el) => openFixedForm(null, el.dataset.kind),
  'edit-fixed': (el) => { const f = findFixed(el.dataset.id); if (f) openFixedForm(f); },
  'delete-fixed': (el) => {
    const { id, list } = el.dataset;
    if (!confirm('Diesen Termin löschen?')) return;
    sheet.close();
    saveProfile((p) => ({ ...p, schedule: { ...p.schedule, [list]: p.schedule[list].filter((x) => x.id !== id) } }), 'Termin gelöscht');
  },
  'clear-schedule-note': () => saveProfile((p) => { const { scheduleNote, ...rest } = p; return rest; }, 'Notiz entfernt'),
  'add-record': (el) => {
    const ex = el.dataset.ex && catalog(profile()).find((e) => e.id === el.dataset.ex);
    const name = ex?.name || recordsByExercise(profile().records).get(el.dataset.ex)?.name;
    openRecordForm(name ? { name } : {});
  },
  'open-record': (el) => openRecordDetail(el.dataset.ex),
  'accept-record': (el) => {
    const d = el.dataset;
    saveRecord({ exId: d.ex, name: d.name, reps: Number(d.reps), kg: Number(d.kg), date: d.date, note: 'aus Training übernommen' });
  },
  'delete-record': (el) => {
    const r = profile().records.find((x) => x.id === el.dataset.id);
    if (!r || !confirm(`${r.name} ${r.reps}RM ${fmtKg(r.kg)} vom ${fmtDate(r.date)} löschen?`)) return;
    const left = profile().records.filter((x) => x.exId === r.exId && x.id !== r.id).length;
    saveProfile((p) => ({ ...p, records: p.records.filter((x) => x.id !== r.id) }), 'Eintrag gelöscht')
      .then(() => { if (left) openRecordDetail(r.exId); else sheet.close(); });
  },
  'add-target': () => $('#goals-form .targets').insertAdjacentHTML('beforeend', targetRow()),
  'remove-target': (el) => el.closest('.target-row').remove(),
  'remove-exercise': (el) => {
    const ex = profile().customExercises.find((e) => e.id === el.dataset.id);
    if (!ex || !confirm(`«${ex.name}» aus deiner Liste entfernen? Bereits erfasste Trainings bleiben erhalten.`)) return;
    saveProfile((p) => ({ ...p, customExercises: p.customExercises.filter((e) => e.id !== ex.id) }), `«${ex.name}» entfernt`);
  },
  theme: (el) => { store.savePrefs({ theme: el.dataset.theme }); applyTheme(); render(); },
  'copy-link': async () => {
    try { await navigator.clipboard.writeText(store.setupLink()); toast('Setup-Link kopiert – nur an dich selbst senden!'); }
    catch { prompt('Link kopieren:', store.setupLink()); }
  },
  export: () => {
    const blob = new Blob([JSON.stringify(state.data, null, 1)], { type: 'application/json' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `pulse-coach-${todayISO()}.json` });
    a.click();
    URL.revokeObjectURL(a.href);
  },
  'reset-demo': async () => { store.resetDemo(); await reload(); toast('Demo-Daten zurückgesetzt'); },
  disconnect: async () => {
    if (!confirm('Verbindung auf diesem Gerät trennen? Deine Daten im Repo bleiben erhalten.')) return;
    store.disconnect();
    await reload();
  },
};

const forms = {
  'act-form': submitActivity,
  'cfg-form': submitConfig,
  'profile-form': submitProfile,
  'goals-form': submitGoals,
  'fixed-form': submitFixed,
  'record-form': submitRecord,
  'nutrition-form': submitNutrition,
  'exercise-form': submitExercise,
  'ask-form': (form) => {
    const q = new FormData(form).get('q').trim();
    if (q) runCoach('question', q);
  },
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (el && actions[el.dataset.action]) actions[el.dataset.action](el, e);
});
document.addEventListener('submit', (e) => {
  if (forms[e.target.id]) { e.preventDefault(); forms[e.target.id](e.target); }
});
document.addEventListener('input', (e) => {
  if (e.target.getAttribute?.('aria-invalid')) e.target.removeAttribute('aria-invalid');
  if (e.target.type === 'range') paintRanges(e.target.parentElement);
  if (e.target.id === 'act-search') {
    state.actQuery = e.target.value;
    const pos = e.target.selectionStart;
    render();
    const input = $('#act-search');
    input.focus();
    input.setSelectionRange(pos, pos);
  }
  if (e.target.name === 'rpe') {
    const v = Number(e.target.value);
    $('#rpe-out').textContent = v ? `${v} · ${RPE_LABELS[v]}` : 'nicht bewertet';
  }
  if (e.target.name?.startsWith('w_')) {
    const label = WEIGHT_LABELS[Number(e.target.value)];
    $(`output[data-for="${e.target.name}"]`).textContent = label;
    e.target.setAttribute('aria-valuetext', label);
  }
});
document.addEventListener('change', (e) => {
  if (e.target.dataset.pref) store.savePrefs({ [e.target.dataset.pref]: e.target.checked });
  if (e.target.dataset.module) {
    const { module } = e.target.dataset;
    const on = e.target.checked;
    // switching the module on also makes football pickable when the user narrowed their sports list
    const sports = (p) => (on && p.sports?.length && !p.sports.includes('football') ? [...p.sports, 'football'] : p.sports);
    saveProfile((p) => ({ ...p, sports: sports(p), modules: { ...p.modules, [module]: on } }), on ? 'Fussball-Modul aktiviert' : 'Fussball-Modul ausgeschaltet');
  }
  if (e.target.id === 'trend-ex') { state.trendExercise = e.target.value; render(); }
  // picking a suggestion from the exercise list adds it right away
  if (e.target.id === 'ex-search' && catalog(profile()).some((x) => x.name.toLowerCase() === e.target.value.trim().toLowerCase())) addExercise();
});
document.addEventListener('keydown', (e) => {
  if (e.target.id === 'ex-search' && e.key === 'Enter') { e.preventDefault(); addExercise(); }
});
// close the sheet when tapping the backdrop
sheet.addEventListener('click', (e) => { if (e.target === sheet) sheet.close(); });

// swipe down on the grabber or header to dismiss the sheet (sheets.md › "Support swiping to dismiss a sheet")
let drag = null;
sheet.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'mouse' || !matchMedia('(max-width: 640px)').matches) return;
  if (!e.target.closest('.sheet-bar, .sheet-head') || e.target.closest('button, input, a')) return;
  if (sheet.scrollTop > 0) return;
  drag = { y: e.clientY, dy: 0 };
  sheet.style.transition = 'none';
});
sheet.addEventListener('pointermove', (e) => {
  if (!drag) return;
  drag.dy = Math.max(0, e.clientY - drag.y);
  sheet.style.translate = `0 ${drag.dy}px`;
});
const endDrag = () => {
  if (!drag) return;
  sheet.style.transition = '';
  sheet.style.translate = '';
  if (drag.dy > 110) sheet.close();
  drag = null;
};
sheet.addEventListener('pointerup', endDrag);
sheet.addEventListener('pointercancel', endDrag);

let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) hiddenAt = Date.now();
  else if (hiddenAt && Date.now() - hiddenAt > 5 * 60000 && !state.pending) reload();
});

// ───────────────────────── boot ─────────────────────────
async function init() {
  applyTheme();
  buildNav();
  initTooltip();
  if (store.importSetupFromHash()) toast('Gerät verbunden');
  if (store.isLive()) state.data = store.cached();
  // compact nav bar title and scroll edge effect once the large title scrolls away
  const onScroll = () => document.body.classList.toggle('scrolled', scrollY > 44);
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  window.addEventListener('hashchange', navigate);
  navigate();
  await reload();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}

init();
