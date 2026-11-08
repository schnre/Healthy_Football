# Pulse Coach 🫀🏋️

Dein persönlicher Trainings-Coach. Du sagst ihm, was du willst (mehr Ausdauer, mehr Kraft, ein Ziel mit Datum), er plant deine Woche um deine Fixtermine herum. Die App läuft auf GitHub Pages, funktioniert im Browser und auf dem iPhone als installierbare App im iOS-Stil, und sie

- übernimmt **Läufe, Trainings und Gesundheitsdaten automatisch von Garmin Connect** (alle 3 Stunden),
- lässt dich **zusätzliche Trainings erfassen** und Garmin-Aktivitäten ergänzen (RPE, Gefühl, Notizen, Sportart),
- hat einen **Plan-Reiter**: die nächsten 7 Tage mit deinen **Fixterminen** (wöchentlich, einmalig oder «keine Zeit») und den Einheiten, die der Coach darum herum plant,
- führt **Bestwerte** (1RM, 3RM oder beliebige Wiederholungszahl) mit Verlauf und Prozenttabelle. Neue Rekorde aus deinen Trainings schlägt sie dir automatisch vor,
- hat ein **Kraft-Logbuch** mit über 60 Übungen inkl. Gewichtheben (Snatch, Clean & Jerk …): Sätze mit kg × Wiederholungen, «Letztes Mal», Fortschritt in den Trends,
- kennt deinen **Auftrag**: Freitext plus Schwerpunkt-Regler (Ausdauer, Kraft, Schnelligkeit, Beweglichkeit, Gewicht), messbare Ziele mit Datum, auf Wunsch **Ernährungs-Faustregeln**,
- lässt **Claude** auf Knopfdruck alles analysieren: Tagesform, Belastung, Tipps nach deinen Schwerpunkten, einen 7-Tage-Plan mit Kraftgewichten in % deines 1RM und Antworten auf deine Fragen.

**Fussball** ist ein optionales Modul (Einstellungen → Module): Es blendet Match-Felder, Position, Liga, Saisonphase und das Ziel «Matchfitness» ein.

Ohne Einrichtung startet die App im **Demo-Modus** mit Beispieldaten.

> **Selbst nutzen?** Folge der Schritt-für-Schritt-Anleitung in [SETUP.md](SETUP.md). Mit Claude Code reicht: *«Lies SETUP.md und richte mir Pulse Coach ein.»*

## Architektur

Es gibt keinen eigenen Server: GitHub übernimmt Hosting, Speicher und Rechenzeit.

```
 Handy / Browser ── GitHub Pages (web/) ──┐
        │                                  │ liest/schreibt JSON über die GitHub API
        │ startet Workflows                ▼
        │                          Daten-Repo (privat)  data/garmin.json
        ▼                                               data/manual.json
 GitHub Actions (dieses Repo)  ───────────────────────► data/profile.json
   • garmin-sync.yml  (alle 3 h): python-garminconnect   data/insights.json
   • coach.yml        (bei Bedarf): Claude API
```

| Datei | Wer schreibt | Inhalt |
|---|---|---|
| `data/garmin.json` | Workflow *Garmin Sync* | Aktivitäten, Tageswerte (Ruhepuls, HRV, Schlaf, Body Battery, Stress, Schritte), VO₂max, Readiness, Wettkampfprognosen |
| `data/manual.json` | App | Manuell erfasste Trainings und Ergänzungen zu Garmin-Aktivitäten |
| `data/profile.json` | App | Dein Profil (Ziele, Fixtermine, Bestwerte, Verletzungen, Module) |
| `data/question.json` | App (der Coach leert sie nach der Antwort) | Offene Frage an den Coach |
| `data/insights.json` | Workflow *Coach Analyse* | Analyse, Tipps, 7-Tage-Plan, Fragen & Antworten |

Die App schreibt nur `manual.json` und `profile.json`, die Workflows nur `garmin.json` und `insights.json`. Deshalb gibt es keine Schreibkonflikte.

```
web/            Statische Web-App (HTML, CSS, JS-Module, PWA), kein Build-Schritt nötig
sync/           Python: garmin_login.py (einmalig lokal), garmin_sync.py, coach.py
.github/        Workflows für Pages-Deployment, Garmin Sync und Coach-Analyse
```

## Einrichtung (ca. 15 Minuten)

### 1. Daten-Repo anlegen

Deine Gesundheitsdaten gehören nicht in ein öffentliches Repo. Erstelle deshalb ein **privates** Repo, z.B. `schnre/healthy_football_data`, und lege dabei eine README an (das Repo braucht mindestens einen Commit).

> Alternative: Lässt du die Variable `DATA_REPO` weg, landen die Daten im Ordner `data/` dieses Repos. Das ist nur sinnvoll, wenn dieses Repo privat ist.

### 2. GitHub Pages aktivieren

Dieses Repo → **Settings → Pages → Source: GitHub Actions**. Nach dem Merge auf `main` deployt der Workflow *Deploy Web App* den Ordner `web/`. Die App ist dann unter `https://schnre.github.io/Healthy_Football/` erreichbar.

> GitHub Pages ist für öffentliche Repos kostenlos. Für Pages aus einem privaten Repo brauchst du GitHub Pro.

### 3. Garmin-Token erzeugen (einmalig, lokal)

Garmin verlangt beim Login oft einen MFA-Code, und den kann ein Workflow nicht eingeben. Deshalb loggst du dich einmal lokal ein und speicherst das Token als Secret. Das Skript braucht **Python ≥ 3.12**:

```bash
pip install -r sync/requirements.txt
python sync/garmin_login.py --repo schnre/Healthy_Football   # setzt das Secret GARMIN_TOKENS direkt (gh CLI)
# ohne gh CLI: python sync/garmin_login.py  → Ausgabe als Secret GARMIN_TOKENS speichern
```

Garmin erneuert das Token regelmässig. Der Sync-Workflow schreibt das neue Token automatisch zurück ins Secret, dafür braucht er `GH_PAT` (siehe unten).

### 4. Secrets und Variablen im App-Repo

**Settings → Secrets and variables → Actions**

| Name | Typ | Wert |
|---|---|---|
| `GARMIN_TOKENS` | Secret | aus Schritt 3 |
| `ANTHROPIC_API_KEY` | Secret | API-Key von [console.anthropic.com](https://console.anthropic.com) |
| `GH_PAT` | Secret | Fine-grained Token für die Workflows (siehe unten) |
| `DATA_REPO` | Variable | `schnre/healthy_football_data` |
| `CLAUDE_MODEL` | Variable (optional) | Standard `claude-opus-5-5` |
| `COACH_EFFORT` | Variable (optional) | `low` · `medium` (Standard) · `high` |
| `AUTO_ANALYZE` | Variable (optional) | `true` = nach jedem Sync mit neuen Aktivitäten automatisch analysieren. Standard: aus, Analyse nur auf Knopfdruck. |
| `GARMIN_EMAIL` / `GARMIN_PASSWORD` | Secret (optional) | Fallback-Login, funktioniert nur ohne MFA |

**`GH_PAT` für die Workflows**: [Fine-grained Token erstellen](https://github.com/settings/personal-access-tokens/new)
- Repository access: `Healthy_Football` **und** `healthy_football_data`
- Permissions: **Contents: Read and write** (Daten-Repo) und **Secrets: Read and write** (App-Repo, für die Token-Erneuerung)

### 5. Token für die App (pro Gerät)

Erstelle ein zweites fine-grained Token, nur für die Web-App:
- Repository access: `Healthy_Football` und `healthy_football_data`
- Permissions: **Contents: Read and write** und **Actions: Read and write**

Öffne die App → **Einstellungen → GitHub-Verbindung** und trage ein: Benutzer `schnre`, Daten-Repo `healthy_football_data`, App-Repo `Healthy_Football`, Token. Klicke auf *Speichern & testen*.

Das Token bleibt im `localStorage` dieses Browsers und geht nur an `api.github.com`.

### 6. Erster Sync

**Actions → Garmin Sync → Run workflow**, mit `days = 90` und angehaktem *Danach eine Coach-Analyse starten*. Danach läuft der Sync automatisch alle 3 Stunden (06–23 Uhr). Claude analysiert nur, wenn du in der App **«Neu analysieren»** drückst oder eine Frage stellst.

### 7. Aufs Handy

Am Desktop: **Einstellungen → Setup-Link kopieren**, den Link an dich selbst schicken und auf dem Handy öffnen. Danach im Browser **«Zum Home-Bildschirm hinzufügen»** wählen. Die App startet dann wie eine native App.

> Der Setup-Link enthält dein Token. Teile ihn mit niemandem.

## Kosten

- **GitHub**: Pages und Actions sind für öffentliche Repos kostenlos. Die Workflows laufen im App-Repo, das private Daten-Repo wird nur ausgecheckt.
- **Claude API**: Eine Analyse schickt rund 8–10k Tokens rein und bekommt 2–4k zurück. Das sind mit Claude Opus 5.5 grob **0.10–0.20 USD pro Analyse**. Da Analysen nur auf Knopfdruck laufen, zahlst du nur, was du auslöst. Eine Analyse pro Tag kostet etwa 3–6 USD pro Monat. Günstiger wird es mit `COACH_EFFORT=low` oder `CLAUDE_MODEL=claude-sonnet-5-5`.

## Gut zu wissen

- **Öffentliches App-Repo**: Code, Workflows und Actions-Logs sind öffentlich, deine Daten nicht. Die Workflows schreiben keine Gesundheitsdaten in die Logs. Fragen an den Coach gehen deshalb über `data/question.json` im privaten Daten-Repo und nicht über die (öffentlich sichtbaren) Workflow-Eingaben. Wenn du eigene Workflow-Schritte ergänzt: keine Daten mit `print`/`echo` ausgeben.
- **Geplante Workflows** deaktiviert GitHub nach 60 Tagen ohne Commit im App-Repo. Du bekommst dann eine E-Mail und kannst den Workflow mit einem Klick wieder aktivieren.
- **Fussball mit der Uhr aufgezeichnet?** (nur mit Fussball-Modul) Garmin speichert das je nach Gerät als *Fussball*, *Cardio* oder *Andere*. Öffne die Aktivität in der App, klicke auf *Ergänzen* und stelle die Sportart auf Fussball. Das gilt dann auch für die Analyse.
- **Analyse-Logik**: `sync/coach.py` berechnet Kennzahlen (Session-RPE-Belastung, ACWR, Wochenumfänge, Pace-Entwicklung, Gesundheits-Trends) und schickt sie mit den Aktivitäten der letzten 42 Tage an Claude. Die Antwort kommt als strukturiertes JSON (`output_config.format`).
- **Lokal entwickeln**: `python -m http.server -d web 8000` → <http://localhost:8000>. Den Coach-Prompt ohne API-Aufruf ansehen: `DRY_RUN=1 DATA_DIR=pfad/zu/data python sync/coach.py`.
- Der Coach ersetzt keine medizinische Beratung. Lass Schmerzen und Verletzungen ärztlich abklären.
