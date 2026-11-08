// Strength exercises, goals and nutrition options shared by the forms, detail views and trends.
import { esc, icon, fmtDate, fmtNum } from './util.js';

export const MUSCLE_GROUPS = ['Beine', 'Gesäss & Hüfte', 'Gewichtheben', 'Brust', 'Rücken', 'Schultern', 'Arme', 'Rumpf', 'Prävention & Sprung', 'Eigene'];

// unit 's' = timed exercise (seconds instead of repetitions); bw = usually bodyweight
const ex = (id, name, group, extra = {}) => ({ id, name, group, ...extra });
export const EXERCISES = [
  ex('squat', 'Back Squat (Kniebeuge)', 'Beine'),
  ex('front_squat', 'Front Squat (Frontkniebeuge)', 'Beine'),
  ex('goblet_squat', 'Goblet Squat', 'Beine'),
  ex('leg_press', 'Beinpresse', 'Beine'),
  ex('lunge', 'Ausfallschritte', 'Beine'),
  ex('bulgarian_split_squat', 'Bulgarian Split Squat', 'Beine'),
  ex('step_up', 'Step-ups', 'Beine'),
  ex('leg_extension', 'Beinstrecker (Maschine)', 'Beine'),
  ex('leg_curl', 'Beinbeuger (Maschine)', 'Beine'),
  ex('calf_raise', 'Wadenheben', 'Beine'),
  ex('deadlift', 'Deadlift (Kreuzheben)', 'Gesäss & Hüfte'),
  ex('romanian_deadlift', 'Rumänisches Kreuzheben', 'Gesäss & Hüfte'),
  ex('hip_thrust', 'Hip Thrust', 'Gesäss & Hüfte'),
  ex('glute_bridge', 'Glute Bridge', 'Gesäss & Hüfte', { bw: true }),
  ex('kettlebell_swing', 'Kettlebell Swing', 'Gesäss & Hüfte'),
  ex('good_morning', 'Good Morning', 'Gesäss & Hüfte'),
  ex('hip_adduction', 'Adduktoren (Maschine)', 'Gesäss & Hüfte'),
  ex('hip_abduction', 'Abduktoren (Maschine)', 'Gesäss & Hüfte'),
  ex('snatch', 'Snatch', 'Gewichtheben'),
  ex('power_snatch', 'Power Snatch', 'Gewichtheben'),
  ex('clean', 'Clean', 'Gewichtheben'),
  ex('power_clean', 'Power Clean', 'Gewichtheben'),
  ex('clean_and_jerk', 'Clean & Jerk', 'Gewichtheben'),
  ex('jerk', 'Jerk', 'Gewichtheben'),
  ex('push_press', 'Push Press', 'Gewichtheben'),
  ex('overhead_squat', 'Overhead Squat', 'Gewichtheben'),
  ex('bench_press', 'Bankdrücken (Bench Press)', 'Brust'),
  ex('incline_bench', 'Schrägbankdrücken', 'Brust'),
  ex('db_bench', 'Kurzhantel-Bankdrücken', 'Brust'),
  ex('push_up', 'Liegestütze', 'Brust', { bw: true }),
  ex('dips', 'Dips', 'Brust', { bw: true }),
  ex('chest_fly', 'Butterfly', 'Brust'),
  ex('pull_up', 'Klimmzüge', 'Rücken', { bw: true }),
  ex('lat_pulldown', 'Latzug', 'Rücken'),
  ex('barbell_row', 'Langhantelrudern', 'Rücken'),
  ex('db_row', 'Kurzhantelrudern', 'Rücken'),
  ex('cable_row', 'Rudern am Kabel', 'Rücken'),
  ex('face_pull', 'Face Pulls', 'Rücken'),
  ex('back_extension', 'Rückenstrecker', 'Rücken', { bw: true }),
  ex('overhead_press', 'Schulterdrücken (Langhantel)', 'Schultern'),
  ex('db_shoulder_press', 'Kurzhantel-Schulterdrücken', 'Schultern'),
  ex('lateral_raise', 'Seitheben', 'Schultern'),
  ex('reverse_fly', 'Reverse Flys', 'Schultern'),
  ex('biceps_curl', 'Bizepscurls', 'Arme'),
  ex('hammer_curl', 'Hammercurls', 'Arme'),
  ex('triceps_pushdown', 'Trizepsdrücken am Kabel', 'Arme'),
  ex('skull_crusher', 'French Press', 'Arme'),
  ex('plank', 'Unterarmstütz (Plank)', 'Rumpf', { unit: 's', bw: true }),
  ex('side_plank', 'Seitstütz', 'Rumpf', { unit: 's', bw: true }),
  ex('dead_bug', 'Dead Bug', 'Rumpf', { bw: true }),
  ex('pallof_press', 'Pallof Press', 'Rumpf'),
  ex('hanging_leg_raise', 'Beinheben hängend', 'Rumpf', { bw: true }),
  ex('ab_wheel', 'Ab Roller', 'Rumpf', { bw: true }),
  ex('russian_twist', 'Russian Twist', 'Rumpf'),
  ex('nordic_curl', 'Nordic Hamstring Curls', 'Prävention & Sprung', { bw: true }),
  ex('copenhagen', 'Copenhagen Plank', 'Prävention & Sprung', { unit: 's', bw: true }),
  ex('eccentric_calf', 'Exzentrisches Wadenheben', 'Prävention & Sprung'),
  ex('single_leg_rdl', 'Einbeiniges Kreuzheben', 'Prävention & Sprung'),
  ex('band_walk', 'Seitgang mit Miniband', 'Prävention & Sprung', { bw: true }),
  ex('single_leg_squat', 'Einbeinige Kniebeuge', 'Prävention & Sprung', { bw: true }),
  ex('box_jump', 'Box Jumps', 'Prävention & Sprung', { bw: true }),
  ex('pogo_jump', 'Pogo Jumps', 'Prävention & Sprung', { bw: true }),
  ex('broad_jump', 'Standweitsprung', 'Prävention & Sprung', { bw: true }),
];

// Focus areas the user weights with a slider (0 = no focus … 4 = top priority). Keep in sync with sync/coach.py.
export const AREAS = {
  endurance: { label: 'Ausdauer', emoji: '🫀' },
  strength: { label: 'Kraft', emoji: '🏋️' },
  speed: { label: 'Schnelligkeit', emoji: '⚡' },
  mobility: { label: 'Beweglichkeit', emoji: '🧘' },
  weight: { label: 'Gewicht', emoji: '⚖️' },
};
// only offered with the football module
export const FOOTBALL_AREAS = { match_fitness: { label: 'Matchfitness', emoji: '⚽' } };
export const WEIGHT_LABELS = ['Kein Fokus', 'Nebenbei', 'Wichtig', 'Sehr wichtig', 'Top-Priorität'];
export const PHASES = { prep: 'Vorbereitung', season: 'Saison', offseason: 'Pause', none: 'Keine Saison' };
export const DIETS = ['Alles', 'Vegetarisch', 'Vegan', 'Pescetarisch'];
export const WEEKDAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];

// old goal keys → slider areas
const LEGACY_FOCUS = {
  endurance: ['endurance'], speed: ['speed'], strength: ['strength'], hypertrophy: ['strength'],
  weight_loss: ['weight'], injury_prevention: ['mobility'], match_fitness: ['match_fitness'], general: ['endurance', 'strength', 'mobility'],
};

/** Profile with defaults; converts older formats (free-text goals and schedule, main/secondary goal lists). */
export function normalizeProfile(raw = {}) {
  const p = { ...raw };
  if (typeof p.goals === 'string' || !p.goals) {
    const notes = typeof p.goals === 'string' ? p.goals : '';
    p.goals = { targets: p.raceGoal ? [{ text: p.raceGoal, date: '' }] : [], notes };
  }
  const g = { weights: {}, targets: [], notes: '', phase: '', ...p.goals };
  if (!Object.keys(g.weights).length && (g.main || g.secondary?.length)) {
    for (const k of g.secondary || []) for (const a of LEGACY_FOCUS[k] || []) g.weights[a] = Math.max(g.weights[a] || 0, 2);
    for (const a of LEGACY_FOCUS[g.main] || []) g.weights[a] = 4;
  }
  delete g.main;
  delete g.secondary;
  p.goals = g;
  p.nutrition = { enabled: false, diet: 'Alles', intolerances: '', ...(p.nutrition || {}) };
  p.modules = { football: false, ...(p.modules || {}) };
  if (typeof p.schedule === 'string') {
    if (p.schedule.trim()) p.scheduleNote = p.schedule;
    p.schedule = undefined;
  }
  p.schedule = { recurring: [], once: [], ...(p.schedule || {}) };
  p.customExercises ??= [];
  p.records ??= [];
  return p;
}

export const uid = (prefix) => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Fixed appointments on one day: the weekly ones for that weekday plus one-off entries, sorted by time. */
export function fixedOn(profile, iso) {
  const weekday = ((new Date(`${iso}T00:00:00`).getDay() + 6) % 7) + 1; // 1 = Monday
  const weekly = profile.schedule.recurring.filter((r) => Number(r.weekday) === weekday).map((r) => ({ ...r, date: iso, repeat: true }));
  const once = profile.schedule.once.filter((o) => o.date === iso);
  return [...weekly, ...once].sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));
}

// ── personal records (rep maxes) ──
/** Records grouped by exercise → reps → entries, newest first. */
export function recordsByExercise(records) {
  const out = new Map();
  for (const r of [...records].sort((a, b) => b.date.localeCompare(a.date))) {
    if (!out.has(r.exId)) out.set(r.exId, { exId: r.exId, name: r.name, byReps: new Map() });
    const ex = out.get(r.exId);
    if (!ex.byReps.has(r.reps)) ex.byReps.set(r.reps, []);
    ex.byReps.get(r.reps).push(r);
  }
  for (const ex of out.values()) ex.byReps = new Map([...ex.byReps].sort((a, b) => a[0] - b[0]));
  return out;
}
/** Heaviest entry for an exercise at exactly this rep count. */
export function bestRecord(records, exId, reps) {
  return records.filter((r) => r.exId === exId && r.reps === reps).reduce((best, r) => (!best || r.kg > best.kg ? r : best), null);
}
/** 1RM: the logged single, otherwise estimated from the best multi-rep max (Epley, up to 10 reps). */
export function oneRepMax(records, exId) {
  const single = bestRecord(records, exId, 1);
  if (single) return { kg: single.kg, estimated: false };
  const est = records.filter((r) => r.exId === exId && r.reps <= 10).map((r) => r.kg * (1 + r.reps / 30));
  return est.length ? { kg: Math.max(...est), estimated: true } : null;
}
/** Logged sets that beat a tracked rep max (1RM, 3RM and every rep count already recorded for the exercise). */
export function recordSuggestions(activities, records, limit = 5) {
  const out = [];
  for (const a of activities) {
    for (const e of a.exercises || []) {
      if (e.unit === 's') continue;
      const tracked = new Set([1, 3, ...records.filter((r) => r.exId === e.id).map((r) => r.reps)]);
      for (const st of e.sets || []) {
        if (!st.kg || !tracked.has(st.reps)) continue;
        const best = bestRecord(records, e.id, st.reps);
        if (best && st.kg <= best.kg) continue;
        const known = out.find((o) => o.exId === e.id && o.reps === st.reps);
        if (known && known.kg >= st.kg) continue;
        if (known) Object.assign(known, { kg: st.kg, date: a.date });
        else out.push({ exId: e.id, name: e.name, reps: st.reps, kg: st.kg, date: a.date, previous: best?.kg });
      }
    }
  }
  return out.sort((x, y) => y.date.localeCompare(x.date)).slice(0, limit);
}

export const catalog = (profile) => [...EXERCISES, ...(profile.customExercises || [])];

/** Estimated one-rep max (Epley) – only meaningful for weighted sets up to 12 reps. */
export function e1rm(set) {
  if (!set?.kg || !set?.reps || set.reps > 12) return null;
  return set.kg * (1 + set.reps / 30);
}
export const bestE1rm = (exercise) => Math.max(0, ...exercise.sets.map((s) => e1rm(s) || 0)) || null;
export const volume = (exercises = []) => exercises.reduce((sum, e) => sum + e.sets.reduce((s, x) => s + (x.kg || 0) * (e.unit === 's' ? 0 : x.reps || 0), 0), 0);

/** Compact summary: consecutive identical sets are grouped, e.g. "3 × 5 @ 85 kg · 1 × 3 @ 90 kg". */
export function fmtSets(sets, unit) {
  const groups = [];
  for (const s of sets) {
    const last = groups[groups.length - 1];
    if (last && last.kg === s.kg && last.reps === s.reps) last.n += 1;
    else groups.push({ ...s, n: 1 });
  }
  return groups.map((g) => {
    const reps = `${g.reps ?? '–'}${unit === 's' ? ' s' : ''}`;
    const kg = g.kg ? ` @ ${fmtNum(g.kg, g.kg % 1 ? 1 : 0)} kg` : unit === 's' ? '' : ' Wdh.';
    return `${g.n} × ${reps}${kg}`;
  }).join(' · ');
}

/** Most recent logged sets of an exercise, skipping the activity being edited. */
export function lastSession(activities, exId, skipId) {
  for (const a of activities) {
    if (a.id === skipId) continue;
    const hit = (a.exercises || []).find((e) => e.id === exId);
    if (hit?.sets?.length) return { date: a.date, sets: hit.sets };
  }
  return null;
}

// ── form fragments ──
export function setRow(set = {}, unit) {
  return `<div class="set-row">
    <span class="set-no"></span>
    <label><input type="number" data-f="kg" inputmode="decimal" step="0.5" min="0" max="500" value="${esc(set.kg ?? '')}" placeholder="${unit === 's' ? '+kg' : 'kg'}" aria-label="Gewicht in kg"><small>kg</small></label>
    <span class="times">×</span>
    <label><input type="number" data-f="reps" inputmode="numeric" min="0" max="600" value="${esc(set.reps ?? '')}" placeholder="${unit === 's' ? 'Sek.' : 'Wdh.'}" aria-label="${unit === 's' ? 'Sekunden' : 'Wiederholungen'}"><small>${unit === 's' ? 's' : 'Wdh.'}</small></label>
    <button type="button" class="icon-btn sm" data-action="set-remove" aria-label="Satz entfernen">${icon('close', 16)}</button>
  </div>`;
}

export function exerciseBlock(exercise, last) {
  const sets = exercise.sets?.length ? exercise.sets : [{}];
  return `<div class="ex-block" data-ex-id="${esc(exercise.id)}" data-ex-name="${esc(exercise.name)}" data-ex-group="${esc(exercise.group || 'Eigene')}" data-ex-unit="${esc(exercise.unit || '')}">
    <header>
      <div><strong>${esc(exercise.name)}</strong>
      <span class="muted small">${last ? `Letztes Mal (${esc(fmtDate(last.date, { day: 'numeric', month: 'short' }))}): ${esc(fmtSets(last.sets, exercise.unit))}` : esc(exercise.group || '')}</span></div>
      <button type="button" class="icon-btn sm" data-action="ex-remove" aria-label="Übung entfernen">${icon('trash', 16)}</button>
    </header>
    <div class="sets">${sets.map((s) => setRow(s, exercise.unit)).join('')}</div>
    <div class="ex-actions">
      <button type="button" class="btn btn-sm" data-action="set-add">${icon('plus', 14)}Satz</button>
      ${last ? `<button type="button" class="btn btn-sm" data-action="ex-copy-last" data-sets="${esc(JSON.stringify(last.sets))}">Wie letztes Mal</button>` : ''}
    </div>
  </div>`;
}

/** Read the exercise blocks of the activity form. */
export function readExercises(form) {
  const num = (v) => (v === '' ? undefined : Number(v));
  return [...form.querySelectorAll('.ex-block')].map((b) => ({
    id: b.dataset.exId,
    name: b.dataset.exName,
    group: b.dataset.exGroup,
    ...(b.dataset.exUnit ? { unit: b.dataset.exUnit } : {}),
    sets: [...b.querySelectorAll('.set-row')]
      .map((r) => ({ kg: num(r.querySelector('[data-f=kg]').value), reps: num(r.querySelector('[data-f=reps]').value) }))
      .filter((s) => s.kg || s.reps)
      .map((s) => JSON.parse(JSON.stringify(s))),
  })).filter((e) => e.sets.length);
}

export const slug = (name) => name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);
