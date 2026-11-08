// Data layer. Live mode: JSON files in a GitHub repo via the REST API (token stays on this device).
// Demo mode: generated sample data kept in localStorage.
import { demoData } from './demo.js';

const CFG_KEY = 'hf.config';
const CACHE_KEY = 'hf.cache';
const DEMO_KEY = 'hf.demo.v2'; // v2: Pulse Coach demo (no football)
const PREFS_KEY = 'hf.prefs';
const API = 'https://api.github.com';

export const FILES = {
  garmin: 'data/garmin.json',
  manual: 'data/manual.json',
  profile: 'data/profile.json',
  insights: 'data/insights.json',
};
const EMPTY = { garmin: {}, manual: { activities: [], annotations: {} }, profile: {}, insights: {} };

const readLocal = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
};
const writeLocal = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full or blocked */ }
};

export const getConfig = () => readLocal(CFG_KEY, {});
export const saveConfig = (cfg) => writeLocal(CFG_KEY, cfg);
export const isLive = () => { const c = getConfig(); return Boolean(c.owner && c.dataRepo); };
export const getPrefs = () => ({ analyzeAfterEntry: false, theme: 'system', ...readLocal(PREFS_KEY, {}) });
export const savePrefs = (p) => writeLocal(PREFS_KEY, { ...getPrefs(), ...p });
export const cached = () => readLocal(CACHE_KEY, null);

export function disconnect() {
  localStorage.removeItem(CFG_KEY);
  localStorage.removeItem(CACHE_KEY);
}
export function resetDemo() { localStorage.removeItem(DEMO_KEY); localStorage.removeItem('hf.demo'); }

// ── GitHub REST helpers ──
async function gh(path, { method = 'GET', body, accept = 'application/vnd.github+json' } = {}) {
  const { token } = getConfig();
  const res = await fetch(`${API}${path}`, {
    method,
    cache: 'no-store',
    headers: {
      Accept: accept,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = new Error(await res.json().then((j) => j.message).catch(() => res.statusText));
    err.status = res.status;
    throw err;
  }
  return res.status === 204 ? null : res;
}

const b64encode = (str) => {
  let bin = '';
  new TextEncoder().encode(str).forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin);
};
const b64decode = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, '')), (c) => c.charCodeAt(0)));

const repoPath = (repo) => `/repos/${getConfig().owner}/${repo}`;
const dataRepo = () => repoPath(getConfig().dataRepo);
/** On GitHub Pages (owner.github.io/Repo/) the app repo is known from the URL. */
export function detectedRepo() {
  const host = location.hostname.match(/^([^.]+)\.github\.io$/i);
  if (!host) return {};
  const repo = location.pathname.split('/').filter(Boolean)[0];
  return { owner: host[1], codeRepo: repo || `${host[1]}.github.io` };
}
/** Repo holding the workflows. An empty field or one equal to the data repo falls back to the Pages repo. */
export function appRepo() {
  const cfg = getConfig();
  if (cfg.codeRepo && cfg.codeRepo !== cfg.dataRepo) return cfg.codeRepo;
  return detectedRepo().codeRepo || cfg.codeRepo || cfg.dataRepo;
}
const codeRepo = () => repoPath(appRepo());

async function readFile(path) {
  try {
    const res = await gh(`${dataRepo()}/contents/${path}`);
    const meta = await res.json();
    let text = meta.content ? b64decode(meta.content) : '';
    if (!text && meta.size > 0) {
      // files > 1 MB come without inline content
      text = await (await gh(`${dataRepo()}/contents/${path}`, { accept: 'application/vnd.github.raw+json' })).text();
    }
    return { data: text ? JSON.parse(text) : null, sha: meta.sha };
  } catch (err) {
    if (err.status === 404) return { data: null, sha: null };
    throw err;
  }
}

/** Read-modify-write a JSON file, retrying once if someone else (e.g. the sync workflow) wrote in between. */
async function updateFile(path, mutate, message) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, sha } = await readFile(path);
    const next = mutate(structuredClone(data ?? {}));
    try {
      await gh(`${dataRepo()}/contents/${path}`, {
        method: 'PUT',
        body: { message, content: b64encode(`${JSON.stringify(next, null, 1)}\n`), ...(sha ? { sha } : {}) },
      });
      return next;
    } catch (err) {
      if (attempt === 0 && (err.status === 409 || err.status === 422)) continue;
      throw err;
    }
  }
  return null;
}

// ── public API ──
export async function loadAll() {
  if (!isLive()) {
    let demo = readLocal(DEMO_KEY, null);
    if (!demo) { demo = demoData(); writeLocal(DEMO_KEY, demo); }
    return { ...demo, mode: 'demo' };
  }
  const entries = await Promise.all(
    Object.entries(FILES).map(async ([key, path]) => [key, (await readFile(path)).data ?? EMPTY[key]]),
  );
  const data = { ...EMPTY, ...Object.fromEntries(entries), mode: 'live', loadedAt: new Date().toISOString() };
  writeLocal(CACHE_KEY, data);
  return data;
}

export async function loadFile(key) {
  if (!isLive()) return null;
  return (await readFile(FILES[key])).data ?? EMPTY[key];
}

function mutateDemo(key, mutate) {
  const demo = readLocal(DEMO_KEY, demoData());
  demo[key] = mutate(structuredClone(demo[key] ?? EMPTY[key]));
  writeLocal(DEMO_KEY, demo);
  return demo[key];
}

function write(key, mutate, message) {
  return isLive() ? updateFile(FILES[key], mutate, message) : Promise.resolve(mutateDemo(key, mutate));
}

export function saveActivity(activity) {
  return write('manual', (m) => {
    m.activities ??= [];
    const i = m.activities.findIndex((a) => a.id === activity.id);
    if (i >= 0) m.activities[i] = activity; else m.activities.unshift(activity);
    return m;
  }, `Training: ${activity.title || activity.type} (${activity.date})`);
}

export function deleteActivity(id) {
  return write('manual', (m) => {
    m.activities = (m.activities ?? []).filter((a) => a.id !== id);
    return m;
  }, `Training gelöscht (${id})`);
}

export function saveAnnotation(id, annotation) {
  return write('manual', (m) => {
    m.annotations ??= {};
    m.annotations[id] = annotation;
    return m;
  }, `Garmin-Aktivität ergänzt (${id})`);
}

/** Read-modify-write the profile so separate settings forms never overwrite each other. */
export function updateProfile(mutate) {
  return write('profile', mutate, 'Profil aktualisiert');
}

// Questions go into the private data repo – workflow inputs show up in the (public) Actions logs.
export function saveQuestion(question) {
  return updateFile('data/question.json', () => ({ question, askedAt: new Date().toISOString() }), 'Frage an den Coach');
}

export async function dispatch(workflow, inputs = {}) {
  const { branch = 'main' } = getConfig();
  await gh(`${codeRepo()}/actions/workflows/${workflow}/dispatches`, { method: 'POST', body: { ref: branch, inputs } });
}

export async function latestRun(workflow) {
  const res = await gh(`${codeRepo()}/actions/workflows/${workflow}/runs?per_page=1&event=workflow_dispatch`);
  return (await res.json()).workflow_runs?.[0] ?? null;
}

export async function testConnection() {
  const cfg = getConfig();
  const data = await (await gh(dataRepo())).json();
  const result = { dataRepo: data.full_name, private: data.private, canWrite: Boolean(data.permissions?.push), codeRepo: `${cfg.owner}/${appRepo()}` };
  // GitHub answers 404 (not 403) when the token may not see a repo or its workflows
  try {
    await gh(`${codeRepo()}/actions/workflows/coach.yml`);
    result.workflows = true;
  } catch (err) {
    if (err.status !== 404 && err.status !== 403) throw err;
    result.workflows = false;
  }
  return result;
}

// Setup link for other devices: config travels in the URL fragment (never sent to a server).
export const setupLink = () => `${location.origin}${location.pathname}#setup=${b64encode(JSON.stringify(getConfig()))}`;
export function importSetupFromHash() {
  const m = location.hash.match(/^#setup=(.+)$/);
  if (!m) return false;
  try {
    saveConfig(JSON.parse(b64decode(decodeURIComponent(m[1]))));
    history.replaceState(null, '', location.pathname);
    return true;
  } catch {
    return false;
  }
}
