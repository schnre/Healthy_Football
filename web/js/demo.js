// Realistic sample data so the app is explorable before GitHub/Garmin are connected.
import { todayISO, addDays, parseDay } from './util.js';

function rng(seed) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

const kg = (v) => Math.round(v / 2.5) * 2.5;
const sets = (n, reps, weight) => Array.from({ length: n }, () => (weight ? { kg: weight, reps } : { reps }));
// weekly lower-body session with slow, realistic progression
function legSession(progress) {
  return [
    { id: 'squat', name: 'Back Squat (Kniebeuge)', group: 'Beine', sets: sets(3, 5, kg(80 + progress * 15)) },
    { id: 'romanian_deadlift', name: 'Rumänisches Kreuzheben', group: 'Gesäss & Hüfte', sets: sets(3, 8, kg(65 + progress * 12)) },
    { id: 'bulgarian_split_squat', name: 'Bulgarian Split Squat', group: 'Beine', sets: sets(3, 8, kg(14 + progress * 6)) },
    { id: 'plank', name: 'Unterarmstütz (Plank)', group: 'Rumpf', unit: 's', sets: sets(3, Math.round(40 + progress * 20)) },
  ];
}
// Saturday: Olympic lifting + pulling
function liftSession(progress, heavy) {
  return [
    { id: 'power_clean', name: 'Power Clean', group: 'Gewichtheben', sets: heavy ? [{ kg: kg(70 + progress * 8), reps: 3 }, { kg: kg(75 + progress * 8), reps: 3 }, { kg: kg(80 + progress * 7.5), reps: 1 }] : sets(5, 3, kg(65 + progress * 8)) },
    { id: 'deadlift', name: 'Deadlift (Kreuzheben)', group: 'Gesäss & Hüfte', sets: sets(3, 5, kg(110 + progress * 15)) },
    { id: 'pull_up', name: 'Klimmzüge', group: 'Rücken', sets: sets(3, Math.round(6 + progress * 3)) },
    { id: 'push_press', name: 'Push Press', group: 'Gewichtheben', sets: sets(3, 5, kg(50 + progress * 7.5)) },
  ];
}

export function demoData() {
  const rand = rng(42);
  const jitter = (base, spread) => base + (rand() - 0.5) * 2 * spread;
  const today = todayISO();
  const garminActs = [];
  const manualActs = [];
  const daily = [];

  for (let back = 83; back >= 0; back--) {
    const date = addDays(today, -back);
    const dow = (parseDay(date).getDay() + 6) % 7; // 0 = Monday
    const progress = (83 - back) / 83; // fitness improves over time

    if ([0, 3, 6].includes(dow) && back > 0) {
      const kind = dow === 0 ? 'easy' : dow === 3 ? 'tempo' : 'long';
      const km = kind === 'long' ? jitter(11 + progress * 4, 1.5) : kind === 'tempo' ? jitter(8, 1) : jitter(6.5, 1);
      const pace = (kind === 'tempo' ? 290 : kind === 'long' ? 335 : 350) - progress * 15 + jitter(0, 8);
      const dur = (km * pace) / 60;
      const hr = kind === 'tempo' ? jitter(166, 4) : jitter(146, 5);
      garminActs.push({
        id: `gdemo${back}`, source: 'garmin', type: 'run', garminType: 'running',
        title: kind === 'tempo' ? 'Lauftreff Tempo' : kind === 'long' ? 'Langer Lauf' : 'Lockerer Lauf',
        date, start: `${date}T${kind === 'long' ? '09:30' : '18:30'}:00`,
        durationMin: Math.round(dur * 10) / 10, distanceKm: Math.round(km * 100) / 100,
        paceSecPerKm: Math.round(pace), avgHr: Math.round(hr), maxHr: Math.round(hr + 14),
        calories: Math.round(km * 68), elevationGain: Math.round(jitter(60, 30)),
        trainingLoad: Math.round(dur * (kind === 'tempo' ? 2.4 : 1.5)),
        aerobicTE: Math.round(jitter(kind === 'tempo' ? 3.6 : 2.8, 0.3) * 10) / 10,
        anaerobicTE: Math.round(jitter(kind === 'tempo' ? 1.8 : 0.4, 0.3) * 10) / 10,
        cadence: Math.round(jitter(172, 3)),
        hrZonesMin: kind === 'tempo' ? [4, 8, 10, 18, 3].map((m) => Math.round(m * dur / 43)) : [6, 22, 10, 2, 0].map((m) => Math.round(m * dur / 40)),
      });
    }
    if (dow === 1 && back > 0) {
      manualActs.push({
        id: `mdemo${back}`, source: 'manual', type: 'hiit', title: 'Functional-Kurs',
        date, start: `${date}T19:00:00`, durationMin: 60, avgHr: Math.round(jitter(150, 5)),
        rpe: Math.round(jitter(7, 1)), feeling: Math.round(jitter(4, 1)), notes: back % 14 < 7 ? 'Viel Rudern und Burpees' : 'Kettlebell-Zirkel',
      });
    }
    if (dow === 2 && back > 0) {
      garminActs.push({
        id: `gdemos${back}`, source: 'garmin', type: 'strength', garminType: 'strength_training',
        title: 'Kraft Beine & Rumpf', date, start: `${date}T07:00:00`, durationMin: Math.round(jitter(55, 8)),
        avgHr: Math.round(jitter(118, 6)), calories: Math.round(jitter(320, 40)), trainingLoad: Math.round(jitter(45, 10)),
        exercises: legSession(progress),
      });
    }
    if (dow === 5 && back > 0) {
      manualActs.push({
        id: `mdemol${back}`, source: 'manual', type: 'strength', title: 'Gewichtheben & Zug',
        date, start: `${date}T10:00:00`, durationMin: Math.round(jitter(65, 8)), avgHr: Math.round(jitter(124, 5)),
        rpe: Math.round(jitter(7, 1)), feeling: Math.round(jitter(4, 1)),
        exercises: liftSession(progress, back < 8), notes: back < 8 ? 'Power Clean schwer – fühlte sich schnell an' : '',
      });
    }

    const load = back % 7 === 1 ? 1 : 0;
    daily.push({
      date,
      restingHr: Math.round(jitter(52 - progress * 2 + load * 2, 1.5)),
      hrv: Math.round(jitter(58 + progress * 5 - load * 6, 5)),
      hrvStatus: 'BALANCED',
      sleepH: Math.round(jitter(7.3, 0.7) * 100) / 100,
      sleepScore: Math.round(jitter(78, 9)),
      deepH: Math.round(jitter(1.5, 0.3) * 100) / 100,
      remH: Math.round(jitter(1.8, 0.3) * 100) / 100,
      bodyBatteryHigh: Math.round(jitter(82, 10)),
      bodyBatteryLow: Math.round(jitter(22, 8)),
      bodyBattery: Math.round(jitter(65, 15)),
      stress: Math.round(jitter(28, 8)),
      steps: Math.round(jitter(9800, 2500)),
    });
  }

  // a "no time" day 2–6 days ahead that does not clash with the weekly appointments (Tue, Thu)
  const blockedDay = [2, 3, 4, 5, 6].map((i) => addDays(today, i)).find((d) => ![1, 3].includes((parseDay(d).getDay() + 6) % 7));
  // one template per weekday (0 = Monday); fixed = the user's fixed appointment, filled in by the coach
  const week = [
    [{ type: 'run', title: 'Lockerer Lauf', durationMin: 40, intensity: 'locker', details: '7 km bei 5:40–5:50/km, Puls unter 145. Danach 4 Steigerungsläufe.', nutrition: 'Normal essen, Protein auf alle Mahlzeiten verteilen.' }],
    [{ type: 'hiit', title: 'Functional-Kurs', durationMin: 60, intensity: 'hart', fixed: true, details: 'Fixtermin. Bei Sprüngen und Burpees sauber bleiben – morgen früh ist Kraft dran.', nutrition: '2–3 h vorher eine kohlenhydratbetonte Mahlzeit.' }],
    [{ type: 'strength', title: 'Kraft Beine', durationMin: 55, intensity: 'mittel', details: 'Back Squat 3×5 @ 80 % (80 kg), Rumänisches Kreuzheben 3×8 @ 75 kg, Bulgarian Split Squat 3×8 @ 20 kg.', nutrition: 'Danach Protein + Kohlenhydrate, z.B. Quark mit Haferflocken und Beeren.' }],
    [{ type: 'run', title: 'Lauftreff', durationMin: 60, intensity: 'hart', fixed: true, details: 'Fixtermin. Ziel: 3×10′ bei 4:35/km (Schwelle), 2′ Trabpause.', nutrition: 'Vorher leicht Verdauliches, z.B. Banane oder Toast mit Honig.' }],
    [],
    [{ type: 'strength', title: 'Gewichtheben & Zug', durationMin: 65, intensity: 'hart', details: 'Power Clean 5×2 @ 80 % (68 kg), Deadlift 3×3 @ 85 % (115 kg), Klimmzüge 3×8.', nutrition: 'Am Morgen kohlenhydratreich frühstücken, danach Protein.' }],
    [{ type: 'run', title: 'Langer Lauf', durationMin: 85, intensity: 'locker', details: '14 km bei 5:35/km, die letzten 2 km etwas zügiger.', nutrition: 'Bei über 75 Minuten unterwegs trinken; danach Kohlenhydrate + Protein.' },
      { type: 'mobility', title: 'Mobility', durationMin: 15, intensity: 'locker', details: 'Hüfte und Sprunggelenk, 2×10 Glute Bridges.' }],
  ];
  const plan = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(today, i);
    if (date === blockedDay) return [{ date, type: 'rest', title: 'Ruhetag (keine Zeit)', durationMin: 0, intensity: 'Ruhe', fixed: false, details: 'Geschäftsreise – nutze den Tag zur Erholung, 8 h Schlaf einplanen.', nutrition: 'Ausgewogen essen, genug trinken.' }];
    const items = week[(parseDay(date).getDay() + 6) % 7];
    return (items.length ? items : [{ type: 'rest', title: 'Ruhetag', durationMin: 0, intensity: 'Ruhe', details: 'Spaziergang, früh schlafen.', nutrition: 'Ausgewogen essen.' }])
      .map((x) => ({ date, fixed: false, ...x }));
  }).flat();

  const rec = (id, exId, name, reps, weight, daysAgo) => ({ id, exId, name, reps, kg: weight, date: addDays(today, -daysAgo) });
  const records = [
    rec('r1', 'squat', 'Back Squat (Kniebeuge)', 1, 95, 120), rec('r2', 'squat', 'Back Squat (Kniebeuge)', 1, 100, 60), rec('r3', 'squat', 'Back Squat (Kniebeuge)', 1, 105, 9),
    rec('r4', 'squat', 'Back Squat (Kniebeuge)', 3, 90, 60), rec('r5', 'squat', 'Back Squat (Kniebeuge)', 3, 95, 16),
    rec('r6', 'deadlift', 'Deadlift (Kreuzheben)', 1, 130, 90), rec('r7', 'deadlift', 'Deadlift (Kreuzheben)', 1, 135, 30),
    rec('r8', 'deadlift', 'Deadlift (Kreuzheben)', 5, 120, 23),
    rec('r9', 'snatch', 'Snatch', 1, 55, 70), rec('r10', 'snatch', 'Snatch', 1, 60, 12),
    rec('r11', 'power_clean', 'Power Clean', 3, 75, 40),
  ];

  return {
    garmin: {
      updatedAt: new Date(Date.now() - 42 * 60000).toISOString(),
      activities: garminActs.reverse(),
      daily,
      snapshot: {
        readiness: { score: 74, level: 'HIGH', feedback: 'Gut erholt', recoveryTimeH: 6 },
        trainingStatus: { phrase: 'PRODUCTIVE', acuteLoad: 560, chronicLoad: 510, acwr: 1.1 },
        vo2max: 52.1, fitnessAge: 26,
        racePredictions: { '5k': 1290, '10k': 2700, half: 6010, marathon: 12900 },
        lactateThreshold: { heartRate: 170, paceSecPerKm: 275 },
      },
    },
    manual: { activities: manualActs.reverse(), annotations: {} },
    profile: {
      name: '', age: 31, trainingDays: 5, weightKg: 78, injuries: 'Leichte Achillessehnen-Reizung rechts im Frühling', maxHr: 190,
      sports: ['run', 'strength', 'hiit', 'mobility', 'cycle'],
      modules: { football: false },
      schedule: {
        recurring: [
          { id: 'fdemo1', weekday: 2, time: '19:00', durationMin: 60, type: 'hiit', title: 'Functional-Kurs' },
          { id: 'fdemo2', weekday: 4, time: '18:30', durationMin: 60, type: 'run', title: 'Lauftreff' },
        ],
        once: [{ id: 'fdemo3', date: blockedDay, kind: 'blocked', title: 'Geschäftsreise' }],
      },
      goals: {
        weights: { strength: 4, endurance: 3, mobility: 2 },
        targets: [{ text: '10 km unter 45:00', date: addDays(today, 70) }, { text: 'Back Squat 1RM 110 kg', date: '' }],
        notes: 'Ich will stärker werden – vor allem Back Squat und Deadlift – und trotzdem 10 km unter 45 Minuten laufen.',
      },
      nutrition: { enabled: true, diet: 'Alles', intolerances: '' },
      customExercises: [],
      records,
    },
    insights: {
      generatedAt: new Date(Date.now() - 3 * 3600000).toISOString(),
      model: 'claude-opus-5-5 (Demo)',
      trigger: 'button',
      analysis: {
        summary: 'Deine Form zeigt klar nach oben: Die Pace der lockeren Läufe ist in 12 Wochen um rund 15 s/km schneller geworden, bei gleichem Puls. Dein Back Squat ist mit 105 kg (1RM) auf Kurs Richtung 110 kg. Mit zwei Kraft-, drei Lauf- und einer Kurseinheit pro Woche liegst du an der oberen Grenze dessen, was du gut verkraftest.',
        readiness: { score: 78, label: 'Bereit für Tempo', reasoning: 'HRV über deinem 3-Wochen-Schnitt (64 vs. 60 ms), Ruhepuls bei 50, Schlaf 7.4 h. Die letzte harte Einheit liegt 2 Tage zurück.' },
        load: { status: 'optimal', comment: 'ACWR 1.10 – du steigerst dich kontrolliert. Halte den Wochenumfang konstant, solange die Kraftwerte steigen.' },
        focus: [{ area: '🏋️ Kraft', tips: [
          { title: 'Squat in Wellen steigern', detail: 'Arbeite 3 Wochen mit 80 → 82.5 → 85 % deines 1RM (105 kg) für 3×5, dann eine leichte Woche. So ist 110 kg in 6–8 Wochen realistisch.', priority: 'hoch' },
          { title: 'Deadlift nur 1× pro Woche schwer', detail: 'Mit dem langen Lauf am Sonntag reicht ein schwerer Zugtag. 3×3 @ 85 % (115 kg) am Samstag, sonst nur rumänisches Kreuzheben.', priority: 'mittel' },
          { title: 'Power Clean vor dem Deadlift', detail: 'Explosive Übungen immer zuerst, wenn du frisch bist. Dein 3RM von 75 kg passt zu einem 1RM von etwa 82 kg.', priority: 'niedrig' },
        ] }, { area: '🫀 Ausdauer', tips: [
          { title: 'Ein Qualitätslauf pro Woche reicht', detail: 'Der Lauftreff am Donnerstag ist deine harte Einheit. Montag und Sonntag bleiben locker, damit die Beine fürs Krafttraining frisch sind.', priority: 'hoch' },
          { title: 'Schwellentempo bei 4:35/km', detail: 'Deine Laktatschwelle liegt bei 170 bpm bzw. 4:35/km. 3×10′ in diesem Bereich bauen genau die Ausdauer für die 10 km unter 45 Minuten auf.', priority: 'mittel' },
        ] }, { area: '😴 Erholung', tips: [
          { title: 'Kein Squat nach dem Kurs', detail: 'Zwischen Functional-Kurs (Di Abend) und Beintag (Mi früh) liegen nur 12 h. Wenn die Beine schwer sind, tausch den Beintag auf Freitag.', priority: 'mittel' },
          { title: 'Achillessehne im Blick behalten', detail: 'Exzentrisches Wadenheben 3×15 an 3 Tagen pro Woche. Bei Schmerzen am Morgen das Lauftempo reduzieren und ärztlich abklären lassen.', priority: 'niedrig' },
        ] }],
        nutrition: {
          summary: 'Du willst Kraft aufbauen und schneller laufen – genug Protein und Kohlenhydrate rund um die harten Tage sind dein wichtigster Hebel.',
          tips: [
            { title: 'Protein über den Tag verteilen', detail: 'Bei jeder Hauptmahlzeit eine Proteinquelle (Milchprodukte, Eier, Fleisch, Fisch, Hülsenfrüchte) – besonders in den 1–2 h nach dem Krafttraining.', priority: 'hoch' },
            { title: 'Kohlenhydrate vor dem Lauftreff', detail: '2–3 h vor der harten Einheit kohlenhydratbetont essen, wenig Fett und Ballaststoffe.', priority: 'mittel' },
            { title: 'Trinken nicht vergessen', detail: 'Bei Einheiten über 60 Minuten oder bei Hitze unterwegs trinken.', priority: 'niedrig' },
          ],
        },
        warnings: [],
        plan,
        answer: '',
      },
      qa: [
        { question: 'Soll ich am Tag nach dem Beintag laufen gehen?', answer: 'Ja, aber nur sehr locker: 30–40 Minuten im Wohlfühltempo (Puls unter 145) fördern die Durchblutung. Wenn deine HRV am Morgen deutlich unter dem Schnitt liegt oder die Beine schwer sind, ersetze den Lauf durch 20 Minuten Velo oder Mobility.', at: new Date(Date.now() - 2 * 86400000).toISOString() },
      ],
      history: [],
    },
  };
}
