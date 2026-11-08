"""Claude coach: analyse all training + health data and write data/insights.json.

Environment:
    ANTHROPIC_API_KEY   required
    TRIGGER             why the analysis runs (garmin-sync, manual-entry, button, question)
    QUESTION            optional question (the app stores it in data/question.json instead,
                        because workflow inputs are visible in public Actions logs)
    CLAUDE_MODEL        default claude-opus-5-5
    COACH_EFFORT        low | medium | high | xhigh | max (default medium)
    DRY_RUN=1           print the prompt instead of calling the API
"""

from __future__ import annotations

import json
import os
import sys
from collections import defaultdict
from datetime import date, timedelta
from statistics import mean
from typing import Any

import anthropic

from common import SPORT_LABELS, iso_today, merged_activities, now_iso, read_json, write_json

MODEL = os.environ.get("CLAUDE_MODEL", "claude-opus-5-5")
EFFORT = os.environ.get("COACH_EFFORT", "medium")

# Typical session RPE per sport when the user did not rate the session.
DEFAULT_RPE = {"run": 5, "football": 6, "strength": 5, "cycle": 4, "swim": 5, "hiit": 7, "mobility": 2, "walk": 2, "other": 4}

SPORT_ENUM = list(SPORT_LABELS) + ["rest"]
TIP = {
    "type": "object",
    "properties": {
        "title": {"type": "string", "description": "Kurzer, konkreter Titel (max. 8 Wörter)"},
        "detail": {"type": "string", "description": "1-3 Sätze: was genau, wie oft, warum – bezogen auf die Daten"},
        "priority": {"type": "string", "enum": ["hoch", "mittel", "niedrig"]},
    },
    "required": ["title", "detail", "priority"],
    "additionalProperties": False,
}
PLAN_ITEM = {
    "date": {"type": "string", "description": "YYYY-MM-DD"},
    "type": {"type": "string", "enum": SPORT_ENUM},
    "title": {"type": "string"},
    "durationMin": {"type": "integer"},
    "intensity": {"type": "string", "enum": ["Ruhe", "locker", "mittel", "hart"]},
    "fixed": {"type": "boolean", "description": "true, wenn dieser Eintrag ein Fixtermin des Athleten ist (Titel und Sportart übernehmen)"},
    "details": {"type": "string", "description": "Konkreter Ablauf, z.B. 10' einlaufen, 6x400m @4:15 oder Back Squat 3x5 @ 80 % (84 kg)"},
}


def build_schema(nutrition: bool) -> dict:
    """JSON schema for the structured answer; the nutrition fields only exist when the user enabled them."""
    plan_props = dict(PLAN_ITEM)
    if nutrition:
        plan_props["nutrition"] = {"type": "string", "description": "Ernährungs-Faustregel für diesen Tag, 1-2 Sätze"}
    props: dict[str, Any] = {
        "summary": {"type": "string", "description": "2-4 Sätze Gesamteinschätzung der aktuellen Form"},
        "readiness": {
            "type": "object",
            "properties": {
                "score": {"type": "integer", "description": "0-100, Bereitschaft für hartes Training heute"},
                "label": {"type": "string", "description": "1-3 Wörter, z.B. 'Bereit für Tempo'"},
                "reasoning": {"type": "string"},
            },
            "required": ["score", "label", "reasoning"],
            "additionalProperties": False,
        },
        "load": {
            "type": "object",
            "properties": {
                "status": {"type": "string", "enum": ["zu niedrig", "aufbauend", "optimal", "hoch", "zu hoch"]},
                "comment": {"type": "string"},
            },
            "required": ["status", "comment"],
            "additionalProperties": False,
        },
        "focus": {
            "type": "array",
            "description": "2-4 Tipp-Bereiche passend zu Zielen und Sportarten, wichtigster zuerst",
            "items": {
                "type": "object",
                "properties": {
                    "area": {"type": "string", "description": "Emoji + 1-2 Wörter, z.B. '🏃 Ausdauer', '🏋️ Kraft', '😴 Erholung'"},
                    "tips": {"type": "array", "items": TIP, "description": "1-4 Tipps"},
                },
                "required": ["area", "tips"],
                "additionalProperties": False,
            },
        },
        "warnings": {"type": "array", "items": {"type": "string"}, "description": "Nur echte Warnsignale, sonst leer"},
        "plan": {
            "type": "array",
            "description": "Plan für die nächsten 7 Tage ab heute: jeder Tag mindestens ein Eintrag (Ruhetag = type 'rest'), "
                           "mehrere Einträge pro Tag erlaubt. Jeder Fixtermin erscheint als eigener Eintrag mit fixed=true.",
            "items": {"type": "object", "properties": plan_props, "required": list(plan_props), "additionalProperties": False},
        },
        "answer": {"type": "string", "description": "Antwort auf die Frage, leer wenn keine Frage"},
    }
    if nutrition:
        props["nutrition"] = {
            "type": "object",
            "properties": {
                "summary": {"type": "string", "description": "1-2 Sätze: worauf es diese Woche bei der Ernährung ankommt"},
                "tips": {"type": "array", "items": TIP, "description": "2-4 Faustregeln"},
            },
            "required": ["summary", "tips"],
            "additionalProperties": False,
        }
    return {"type": "object", "properties": props, "required": list(props), "additionalProperties": False}


# Focus sliders (keep in sync with AREAS / FOOTBALL_AREAS in web/js/training.js)
AREA_LABELS = {
    "endurance": "Ausdauer", "strength": "Kraft", "speed": "Schnelligkeit", "mobility": "Beweglichkeit",
    "weight": "Gewicht / Körperzusammensetzung", "match_fitness": "Matchfitness (Fussball)",
}
WEIGHT_LABELS = ["kein Fokus", "nebenbei", "wichtig", "sehr wichtig", "Top-Priorität"]
LEGACY_FOCUS = {
    "endurance": ["endurance"], "speed": ["speed"], "strength": ["strength"], "hypertrophy": ["strength"],
    "weight_loss": ["weight"], "injury_prevention": ["mobility"], "match_fitness": ["match_fitness"],
    "general": ["endurance", "strength", "mobility"],
}
PHASE_LABELS = {"prep": "Vorbereitung", "season": "Saison", "offseason": "Pause", "none": "keine Saison"}
WEEKDAY_LABELS = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"]

PRINCIPLES = """Grundsätze:
- Die Schwerpunkte und der Freitext des Athleten sind dein Auftrag. Verteile Umfang und Qualität nach der Gewichtung:
  Top-Priorität bekommt die meisten und wichtigsten Einheiten, "nebenbei" nur Erhaltung.
- Beziehe dich auf konkrete Zahlen aus den Daten (Pace, Puls, Umfang, HRV, Schlaf, Belastung, Gewichte und Wiederholungen).
- Berücksichtige Erholung: niedrige HRV, schlechter Schlaf, hoher Ruhepuls oder ACWR > 1.3 → Belastung reduzieren.
- Fixtermine sind gesetzt: übernimm jeden als eigenen Plan-Eintrag mit fixed=true (gleiche Sportart und gleicher Titel)
  und ergänze in 'details', wie der Athlet ihn nutzen soll. Plane die übrigen Einheiten darum herum: keine harte Einheit
  direkt vor oder nach einem harten Fixtermin, kein schweres Beintraining am Tag vor einer harten Lauf- oder Sprinteinheit.
  An Tagen mit "keine Zeit" nur Ruhe oder höchstens 15 Minuten Mobility.
- Krafttraining: progressive Belastung anhand der erfassten Sätze. Wenn Bestwerte (1RM/3RM …) vorhanden sind, gib die
  Arbeitsgewichte als Prozent des 1RM mit kg in Klammern an (z.B. "Back Squat 5x3 @ 80 % (84 kg)"), auf 2.5 kg gerundet.
  Fehlt ein 1RM, schätze es aus dem besten Mehrfach-Max (Epley) und sag, dass es geschätzt ist. Bei Stagnation Varianten oder Deload.
- Der Wochenplan muss zu Trainingstagen, Zielen, Fixterminen und Einschränkungen passen.
- Gib Intensitäten konkret an (Pace in min/km, Herzfrequenzbereiche, RPE, % 1RM oder kg x Wiederholungen).
- Bei Schmerzen oder Verletzungsverdacht: zur ärztlichen Abklärung raten, keine Diagnose stellen.
- Gliedere die Tipps in 2-4 Bereiche ('focus') entlang der Schwerpunkte, den wichtigsten zuerst.
  Erholung/Prävention bekommt einen eigenen Bereich, sofern es etwas Relevantes gibt.
- Schreibe auf Deutsch in Schweizer Rechtschreibung (ss statt ß), direkt und motivierend, in der Du-Form."""

FOOTBALL_RULES = """Fussball (Modul vom Athleten aktiviert):
- Mannschaftstrainings und Matches sind Fixtermine. Keine harten Einheiten am Vortag eines Matches,
  kein schweres Krafttraining innerhalb von 48 h vor einem Match.
- Berücksichtige Position, Niveau und Saisonphase; Matchfitness heisst wiederholte Sprints, Richtungswechsel und Erholung zwischen Belastungen."""

NUTRITION_RULES = """Ernährung (vom Athleten aktiviert):
- Gib alltagstaugliche FAUSTREGELN mit Beispielen für Lebensmittel – keine Grammrechnungen pro Mahlzeit, keine Kalorienpläne.
- Stütze dich auf die Leitlinien: ACSM/Academy of Nutrition and Dietetics/Dietitians of Canada (2016) – Kohlenhydratbedarf
  steigt mit der Belastung, 1-4 h vor intensiven Einheiten kohlenhydratbetont und fett-/ballaststoffarm essen;
  ISSN-Positionspapier Protein – Protein über den Tag verteilen, nach dem Training Protein + Kohlenhydrate.
- Richte die Tagesregeln nach der geplanten Einheit (hart → mehr Kohlenhydrate, Ruhetag → ausgewogen).
- Berücksichtige Ernährungsform und Unverträglichkeiten. Bei Gewichtsziel nur ein moderates Defizit an leichten Tagen,
  nie vor harten Einheiten oder Wettkämpfen.
- Keine Supplement-Empfehlungen ausser gut belegten Basics (z.B. Koffein vor Wettkämpfen) mit Hinweis; keine medizinischen Aussagen."""
NUTRITION_FOOTBALL = """- UEFA-Expertenstatement zur Ernährung im Fussball (2021): am Vortag und am Matchtag Kohlenhydrate betonen,
  in der Halbzeit schnelle Kohlenhydrate, nach dem Match Regeneration, ausreichend trinken."""


def normalize_profile(raw: dict) -> dict:
    """Mirror of normalizeProfile() in web/js/training.js – converts older goal and schedule formats."""
    p = dict(raw or {})
    goals = p.get("goals")
    if not isinstance(goals, dict):
        goals = {"notes": goals or "", "targets": [{"text": p["raceGoal"], "date": ""}] if p.get("raceGoal") else []}
    g = {"weights": {}, "targets": [], "notes": "", "phase": "", **goals}
    if not g["weights"] and (g.get("main") or g.get("secondary")):
        for k in g.get("secondary") or []:
            for a in LEGACY_FOCUS.get(k, []):
                g["weights"][a] = max(g["weights"].get(a, 0), 2)
        for a in LEGACY_FOCUS.get(g.get("main"), []):
            g["weights"][a] = 4
    g.pop("main", None)
    g.pop("secondary", None)
    p["goals"] = g
    p["nutrition"] = p.get("nutrition") or {}
    p["modules"] = {"football": False, **(p.get("modules") or {})}
    if isinstance(p.get("schedule"), str):
        if p["schedule"].strip():
            p["scheduleNote"] = p["schedule"]
        p["schedule"] = None
    p["schedule"] = {"recurring": [], "once": [], **(p.get("schedule") or {})}
    p.setdefault("records", [])
    return p


def build_system(profile: dict, sports: list[str]) -> str:
    g = profile["goals"]
    football = profile["modules"].get("football")
    lines = []
    weights = sorted(((k, w) for k, w in g["weights"].items() if w and (k != "match_fitness" or football)), key=lambda x: -x[1])
    if weights:
        lines.append("- Schwerpunkte (0-4): " + ", ".join(f"{AREA_LABELS.get(k, k)} = {WEIGHT_LABELS[min(int(w), 4)]}" for k, w in weights))
    if football and g.get("phase"):
        lines.append(f"- Saisonphase: {PHASE_LABELS.get(g['phase'], g['phase'])}")
    for t in g.get("targets") or []:
        lines.append(f"- Messbares Ziel: {t['text']}" + (f" (bis {t['date']})" if t.get("date") else ""))
    if g.get("notes"):
        lines.append(f"- In eigenen Worten: {g['notes']}")
    goals = "\n".join(lines) or "- Keine Ziele angegeben: leite sinnvolle Schwerpunkte aus den Sportarten und Daten ab."

    text = f"""Du bist ein erfahrener persönlicher Trainer und Sportwissenschaftler für Ausdauer- und Krafttraining.
Du betreust eine einzelne Person (Hobby-/Amateursport), die ihre Garmin-Daten, zusätzlich erfasste Trainings
(z.B. Krafttraining mit Sätzen, Gewichten und Wiederholungen), Bestwerte und feste Termine mit dir teilt.

Sportarten: {", ".join(sports) or "nicht angegeben"}
Ziele:
{goals}

Deine Aufgabe: Analysiere die Daten ehrlich und konkret und gib umsetzbare Empfehlungen, die genau auf diese Ziele
einzahlen – ohne Überlastung.

{PRINCIPLES}"""
    if football:
        text += "\n\n" + FOOTBALL_RULES
    if profile["nutrition"].get("enabled"):
        text += "\n\n" + NUTRITION_RULES + ("\n" + NUTRITION_FOOTBALL if football else "")
    return text


def fixed_next_days(profile: dict, days: int = 7) -> list[dict]:
    """Weekly and one-off appointments expanded to concrete dates for the planning window."""
    out = []
    for i in range(days):
        d = date.today() + timedelta(days=i)
        weekday = d.weekday() + 1  # 1 = Monday
        for r in profile["schedule"]["recurring"]:
            if int(r.get("weekday") or 0) == weekday:
                out.append({"datum": d.isoformat(), "wochentag": WEEKDAY_LABELS[d.weekday()], "art": "wöchentlich",
                            **{k: r[k] for k in ("time", "durationMin", "type", "title") if r.get(k)}})
        for o in profile["schedule"]["once"]:
            if o.get("date") == d.isoformat():
                entry = {"datum": d.isoformat(), "wochentag": WEEKDAY_LABELS[d.weekday()],
                         "art": "keine Zeit" if o.get("kind") == "blocked" else "einmalig"}
                entry.update({k: o[k] for k in ("time", "durationMin", "type", "title") if o.get(k)})
                out.append(entry)
    return out


def records_block(records: list[dict]) -> list[dict]:
    """Best value per exercise and rep count, with the previous best for progress."""
    best: dict[tuple[str, int], list[dict]] = defaultdict(list)
    for r in records:
        if r.get("exId") and r.get("reps") and r.get("kg"):
            best[(r["exId"], int(r["reps"]))].append(r)
    out = []
    for (_, reps), entries in sorted(best.items(), key=lambda x: (x[1][0].get("name", ""), x[0][1])):
        entries.sort(key=lambda r: r.get("date", ""), reverse=True)
        top = max(entries, key=lambda r: r["kg"])
        item = {"übung": top.get("name"), "wiederholungen": reps, "kg": top["kg"], "datum": top.get("date")}
        older = [r["kg"] for r in entries if r.get("date", "") < top.get("date", "")]
        if older:
            item["vorherBestKg"] = max(older)
        out.append(item)
    return out


def day_offset(iso: str) -> int:
    return (date.today() - date.fromisoformat(iso[:10])).days


def session_load(a: dict) -> float:
    """Session-RPE load (minutes x RPE) so Garmin and manual sessions are comparable."""
    rpe = a.get("rpe") or DEFAULT_RPE.get(a.get("type", "other"), 4)
    if a.get("type") == "football" and (a.get("football") or {}).get("kind") == "match" and not a.get("rpe"):
        rpe = 7
    return (a.get("durationMin") or 0) * rpe


def avg(values: list[Any]) -> float | None:
    clean = [v for v in values if isinstance(v, (int, float))]
    return round(mean(clean), 1) if clean else None


def e1rm(st: dict) -> float | None:
    """Estimated one-rep max (Epley), only for weighted sets up to 12 reps."""
    kg, reps = st.get("kg"), st.get("reps")
    return kg * (1 + reps / 30) if kg and reps and reps <= 12 else None


def fmt_sets(exercise: dict) -> str:
    unit = "s" if exercise.get("unit") == "s" else ""
    return ", ".join(
        (f"{st['kg']:g}kg x{st.get('reps', '?')}{unit}" if st.get("kg") else f"{st.get('reps', '?')}{unit or ' Wdh'}")
        for st in exercise.get("sets", [])
    )


def strength_block(acts: list[dict]) -> dict:
    per_ex: dict[str, dict] = {}
    sets_per_group: dict[str, int] = defaultdict(int)
    for a in acts:  # newest first
        if not a.get("exercises") or not a.get("date") or day_offset(a["date"]) >= 56:
            continue
        for e in a["exercises"]:
            d = per_ex.setdefault(e["id"], {"übung": e["name"], "einheiten28Tage": 0, "_recent": [], "_prev": [],
                                            "letzteSätze": fmt_sets(e), "letztesDatum": a["date"]})
            best = max((e1rm(st) or 0 for st in e.get("sets", [])), default=0)
            if day_offset(a["date"]) < 28:
                d["einheiten28Tage"] += 1
                d["_recent"].append(best)
            else:
                d["_prev"].append(best)
            if day_offset(a["date"]) < 7:
                sets_per_group[e.get("group") or "Eigene"] += len(e.get("sets", []))
    exercises = []
    for d in per_ex.values():
        recent, prev = d.pop("_recent"), d.pop("_prev")
        if max(recent, default=0):
            d["best1RM28Tage"] = round(max(recent), 1)
        if max(prev, default=0):
            d["best1RMvorherige28Tage"] = round(max(prev), 1)
        exercises.append(d)
    return {"uebungen": exercises, "saetzeProMuskelgruppe7Tage": dict(sets_per_group),
            "hinweis": "1RM = geschätztes Maximalgewicht nach Epley"} if exercises else {}


def compute_metrics(acts: list[dict], daily: list[dict], football: bool = False) -> dict:
    in_days = lambda lo, hi: [a for a in acts if a.get("date") and lo <= day_offset(a["date"]) < hi]

    acute = sum(session_load(a) for a in in_days(0, 7))
    chronic_weekly = sum(session_load(a) for a in in_days(0, 28)) / 4
    weeks = []
    for w in range(6):
        week_acts = in_days(w * 7, w * 7 + 7)
        per_sport: dict[str, float] = defaultdict(float)
        for a in week_acts:
            per_sport[a.get("type", "other")] += a.get("durationMin") or 0
        weeks.append({
            "wocheVorHeute": w,
            "einheiten": len(week_acts),
            "minutenProSport": {SPORT_LABELS.get(k, k): round(v) for k, v in per_sport.items()},
            "laufKm": round(sum(a.get("distanceKm") or 0 for a in week_acts if a.get("type") == "run"), 1),
            "belastung": round(sum(session_load(a) for a in week_acts)),
        })

    def run_block(lo: int, hi: int) -> dict:
        runs = [a for a in in_days(lo, hi) if a.get("type") == "run"]
        paced = [a for a in runs if a.get("paceSecPerKm")]
        return {
            "laeufe": len(runs),
            "km": round(sum(a.get("distanceKm") or 0 for a in runs), 1),
            "laengsterLaufKm": max((a.get("distanceKm") or 0 for a in runs), default=0),
            "durchschnittsPaceSecPerKm": avg([a["paceSecPerKm"] for a in paced]),
            "durchschnittsPuls": avg([a.get("avgHr") for a in runs]),
        }

    def football_block(lo: int, hi: int) -> dict:
        sessions = [a for a in in_days(lo, hi) if a.get("type") == "football"]
        return {
            "einheiten": len(sessions),
            "matches": sum(1 for a in sessions if (a.get("football") or {}).get("kind") == "match"),
            "minuten": round(sum(a.get("durationMin") or 0 for a in sessions)),
        }

    def health_block(lo: int, hi: int) -> dict:
        days = [d for d in daily if lo <= day_offset(d["date"]) < hi]
        return {k: avg([d.get(k) for d in days]) for k in ("restingHr", "hrv", "sleepH", "sleepScore", "bodyBatteryHigh", "stress")}

    metrics = {
        "belastung": {
            "akut7Tage": round(acute),
            "chronischProWoche28Tage": round(chronic_weekly),
            "acwr": round(acute / chronic_weekly, 2) if chronic_weekly else None,
            "hinweis": "Belastung = Minuten x RPE (Session-RPE); ACWR 0.8-1.3 gilt als günstiger Bereich",
        },
        "wochen": weeks,
        "laufen": {"letzte28Tage": run_block(0, 28), "vorherige28Tage": run_block(28, 56)},
        "kraft": strength_block(acts),
        "gesundheit": {"letzte7Tage": health_block(0, 7), "vorherige21Tage": health_block(7, 28)},
    }
    if football:
        metrics["fussball"] = {"letzte28Tage": football_block(0, 28), "vorherige28Tage": football_block(28, 56)}
    return metrics


def compact_activity(a: dict) -> dict:
    keys = ("date", "type", "title", "durationMin", "distanceKm", "paceSecPerKm", "avgHr", "maxHr",
            "trainingLoad", "aerobicTE", "anaerobicTE", "hrZonesMin", "rpe", "feeling", "notes", "football", "source")
    out = {k: a[k] for k in keys if a.get(k) not in (None, "", [], {})}
    if a.get("exercises"):
        out["uebungen"] = [{"name": e["name"], "saetze": fmt_sets(e)} for e in a["exercises"]]
    return out


def build_prompt(garmin: dict, manual: dict, profile: dict, previous: dict, question: str) -> str:
    acts = merged_activities(garmin, manual)
    daily = garmin.get("daily", [])
    recent_acts = [compact_activity(a) for a in acts if a.get("date") and day_offset(a["date"]) < 42]
    recent_daily = [d for d in daily if day_offset(d["date"]) < 21]
    last = previous.get("analysis") or {}

    football = bool(profile["modules"].get("football"))
    hidden = {"goals", "customExercises", "raceGoal", "schedule", "records", "modules", "nutrition"}
    if not football:
        hidden |= {"position", "level"}
    athlete = {k: v for k, v in profile.items() if k not in hidden and v not in (None, "", [], {})}
    if profile["nutrition"].get("enabled"):
        athlete["ernaehrung"] = {k: v for k, v in profile["nutrition"].items() if k != "enabled" and v}
    sections = {
        "heute": f"{iso_today()} ({WEEKDAY_LABELS[date.today().weekday()]})",
        "athletenprofil": athlete or "nicht ausgefüllt",
        "fixtermineNaechste7Tage": fixed_next_days(profile) or "keine",
        "bestwerte": records_block(profile["records"]) or "keine eingetragen",
        "kennzahlen": compute_metrics(acts, daily, football),
        "garminSnapshot": garmin.get("snapshot", {}),
        "aktivitaetenLetzte42Tage": recent_acts,
        "gesundheitLetzte21Tage": recent_daily,
        "letzteAnalyse": {"datum": previous.get("generatedAt"), "zusammenfassung": last.get("summary"),
                           "plan": last.get("plan")} if last else None,
    }
    prompt = "Hier sind meine aktuellen Daten als JSON:\n\n" + json.dumps(sections, ensure_ascii=False, indent=1)
    prompt += ("\n\nErstelle deine Analyse und den Plan für die nächsten 7 Tage (ab heute). "
               "Übernimm alle Fixtermine (fixed=true) und plane die übrigen Einheiten passend zu meinen Schwerpunkten darum herum.")
    if question:
        prompt += f"\n\nMeine Frage an dich (beantworte sie im Feld 'answer'):\n{question}"
    return prompt


def main() -> None:
    trigger = os.environ.get("TRIGGER") or "manual"
    pending = read_json("question.json", {})
    question = (os.environ.get("QUESTION") or pending.get("question") or "").strip()[:2000]

    garmin = read_json("garmin.json", {})
    manual = read_json("manual.json", {})
    profile = normalize_profile(read_json("profile.json", {}))
    insights = read_json("insights.json", {})

    recent_types = {a.get("type") for a in merged_activities(garmin, manual) if a.get("date") and day_offset(a["date"]) < 42}
    sports = [SPORT_LABELS.get(k, k) for k in (profile.get("sports") or sorted(t for t in recent_types if t))]
    system = build_system(profile, sports)
    schema = build_schema(bool(profile["nutrition"].get("enabled")))

    prompt = build_prompt(garmin, manual, profile, insights, question)
    if os.environ.get("DRY_RUN"):
        print(system, "\n\n", prompt)
        return

    client = anthropic.Anthropic()
    try:
        response = client.beta.messages.create(
            model=MODEL,
            max_tokens=16000,
            system=system,
            messages=[{"role": "user", "content": prompt}],
            output_config={"effort": EFFORT, "format": {"type": "json_schema", "schema": schema}},
            # Re-run on Anthropic's recommended model if a safety classifier declines the request.
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
        )
    except anthropic.RateLimitError as err:
        sys.exit(f"Claude API Rate-Limit – später erneut versuchen ({err.message}).")
    except anthropic.APIStatusError as err:
        sys.exit(f"Claude API Fehler {err.status_code}: {err.message}")
    except anthropic.APIConnectionError:
        sys.exit("Keine Verbindung zur Claude API.")

    if response.stop_reason == "refusal":
        sys.exit("Claude hat die Analyse abgelehnt (refusal).")
    if response.stop_reason == "max_tokens":
        sys.exit("Antwort wurde abgeschnitten (max_tokens) – COACH_EFFORT senken oder max_tokens erhöhen.")

    text = next(b.text for b in response.content if b.type == "text")
    analysis = json.loads(text)

    history = insights.get("history", [])
    if insights.get("analysis"):
        old = insights["analysis"]
        history = [{"at": insights.get("generatedAt"), "summary": old.get("summary"),
                    "readiness": (old.get("readiness") or {}).get("score")}] + history
    qa = insights.get("qa", [])
    if question:
        qa = [{"question": question, "answer": analysis.get("answer", ""), "at": now_iso()}] + qa

    if pending.get("question"):
        write_json("question.json", {})  # answered – clear it
    write_json("insights.json", {
        "generatedAt": now_iso(),
        "model": response.model,
        "trigger": trigger,
        "analysis": analysis,
        "qa": qa[:30],
        "history": history[:20],
    })
    usage = response.usage
    print(f"Analyse gespeichert ({response.model}, {usage.input_tokens} in / {usage.output_tokens} out Tokens).")


if __name__ == "__main__":
    main()
