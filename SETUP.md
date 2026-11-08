# Pulse Coach einrichten – Schritt für Schritt (mit Claude)

Mit dieser Anleitung richtest du deine eigene Kopie von **Pulse Coach** ein: persönlicher Trainings-Coach mit Garmin-Sync, Wochenplan, Bestwerten und KI-Analyse. Am Ende hast du:

- eine App unter `https://<dein-github-name>.github.io/Healthy_Football/`, im Browser und auf dem Handy,
- ein **privates** Repo mit deinen Daten,
- automatischen Garmin-Sync alle 3 Stunden (gratis) und Coach-Analysen mit Claude **auf Knopfdruck**.

Dauer: ca. 30 Minuten. Kosten: GitHub gratis, Claude API ca. 0.10–0.20 USD pro Analyse (Prepaid-Guthaben).

> **So startest du:** Öffne Claude Code im Ordner deines Klons (oder in einem leeren Ordner) und sag:
> **«Lies SETUP.md und richte mir Pulse Coach ein.»**

Jeder GitHub-Schritt hat **zwei Wege**, die zum selben Ergebnis führen:

- **⌨️ Terminal:** Befehle mit der GitHub CLI (`gh`). Claude kann sie für dich ausführen. Schnell und weniger Klicks.
- **🖱️ Browser:** Klickanleitung auf github.com. Funktioniert ohne zusätzliche Programme.

Du kannst die Wege auch mischen, z.B. Repos im Browser anlegen und den Sync im Terminal prüfen.

---

## Für Claude: Regeln für diese Einrichtung

Du (Claude) führst die Person durch die Schritte unten. Halte dich an diese Regeln:

1. **Frag zuerst, welchen Weg die Person will:** Terminal (du führst `gh`-Befehle aus) oder Browser (du erklärst die Klicks). Ist `gh` nicht installiert und will sie es nicht installieren, nimm durchgehend den Browser-Weg.
2. **Secrets nie sehen, nie ausgeben, nie speichern.** Bitte die Person **nie**, einen Token, Key oder ein Passwort in den Chat zu kopieren. Secrets setzt sie selbst: im Browser im Secrets-Formular, oder im Terminal mit Befehlen, die verdeckt nachfragen (`gh secret set NAME` ohne `--body`). Schreib Secrets nie in Dateien, Commits, Logs oder Befehlszeilen-Argumente.
3. **Interaktive Befehle führt die Person selbst aus.** Das gilt für `gh auth login`, `garmin_login.py` und `gh secret set`. In Claude Code kann sie dafür `!` vor den Befehl setzen. Du gibst ihr den exakten Befehl.
4. **Nach jedem Schritt prüfen**, ob er geklappt hat (Prüfungen stehen dabei), bevor du weitermachst.
5. Ersetze `<USER>` durch den GitHub-Namen der Person (Terminal: `gh api user --jq .login`, sonst fragen).
6. Die Person ist eventuell keine Entwicklerin bzw. kein Entwickler: kurze Sätze, ein Schritt nach dem anderen, Fehlermeldungen in Ruhe erklären.

Markierung: 🤖 = Claude führt aus · 👤 = die Person macht es selbst.

---

## Schritt 0 – Voraussetzungen

🤖 Prüfe:

```bash
git --version
py --list          # Windows
python3 --version  # macOS/Linux
gh --version       # nur für den Terminal-Weg
```

| Fehlt | Lösung |
|---|---|
| **Python ≥ 3.12** (immer nötig, für den Garmin-Login) | Windows: `winget install -e --id Python.Python.3.14`. Ohne winget: Installer von [python.org/downloads](https://www.python.org/downloads/), «Add python.exe to PATH» anhaken. macOS: `brew install python@3.14`. Danach Terminal neu öffnen. |
| **git** (nur zum Klonen, optional) | [git-scm.com](https://git-scm.com/downloads). Alternativ auf GitHub **Code → Download ZIP**. |
| **GitHub CLI `gh`** (nur Terminal-Weg) | Windows `winget install -e --id GitHub.cli` · macOS `brew install gh` · sonst [cli.github.com](https://cli.github.com) |

**Bei GitHub anmelden** (nur Terminal-Weg). 👤 Der Befehl öffnet den Browser:

```bash
gh auth login
```
Auswahl: GitHub.com → HTTPS → Login with a web browser. Prüfen: `gh auth status` zeigt «Logged in».

👤 **Sicherheit vorab:** Zwei-Faktor-Login aktivieren bei [GitHub](https://github.com/settings/security), Garmin Connect und der Anthropic Console. Wer dein GitHub-Konto übernimmt, kommt an alles.

---

## Schritt 1 – Eigene Kopie des App-Repos

Das App-Repo **muss öffentlich** sein, sonst ist GitHub Pages nicht gratis. Darin liegen keine Daten und keine Schlüssel.

**⌨️ Terminal** 🤖

```bash
# A) Template (empfohlen): eigenes, unabhängiges Repo
gh repo create <USER>/Healthy_Football --public --template schnre/Healthy_Football --clone

# B) Falls A fehlschlägt («not a template»): Fork
gh repo fork schnre/Healthy_Football --clone --default-branch-only
```

**🖱️ Browser** 👤

1. [github.com/schnre/Healthy_Football](https://github.com/schnre/Healthy_Football) öffnen.
2. Kopie erstellen:
   - **A)** Grüner Button **«Use this template» → «Create a new repository»**, Name `Healthy_Football`, **Public**, dann **Create repository**.
   - **B)** Falls es den Template-Button nicht gibt: **«Fork»** oben rechts → **Create fork**.
3. Für den Garmin-Login (Schritt 4) brauchst du den Code lokal: im neuen Repo **Code → Download ZIP** und entpacken, oder mit `git clone https://github.com/<USER>/Healthy_Football.git`.

**Nur bei Fork:** Die Workflows sind zuerst deaktiviert. 👤 Im neuen Repo den Tab **Actions** öffnen und **«I understand my workflows, go ahead and enable them»** klicken.

**Prüfen:** Das Repo `https://github.com/<USER>/Healthy_Football` existiert und zeigt «Public».
Terminal: `gh repo view <USER>/Healthy_Football --json visibility,url`

---

## Schritt 2 – Privates Daten-Repo

Hier legt das System später die Dateien `data/*.json` mit Garmin-Daten, Trainings und Coach-Analysen ab. **Es muss privat sein.**

**⌨️ Terminal** 🤖

```bash
gh repo create <USER>/healthy_football_data --private --add-readme
```

**🖱️ Browser** 👤

1. [github.com/new](https://github.com/new) öffnen.
2. Repository name: `healthy_football_data`
3. **Private** wählen.
4. **«Add a README file»** anhaken. Wichtig: Das Repo braucht mindestens einen Commit.
5. **Create repository** klicken.

**Prüfen:** Neben dem Repo-Namen steht «Private».
Terminal: `gh repo view <USER>/healthy_football_data --json visibility` → `PRIVATE`

---

## Schritt 3 – GitHub Pages einschalten

**⌨️ Terminal** 🤖

```bash
gh api -X POST repos/<USER>/Healthy_Football/pages -f build_type=workflow \
  || gh api -X PUT repos/<USER>/Healthy_Football/pages -f build_type=workflow
gh workflow run pages.yml -R <USER>/Healthy_Football
```

**🖱️ Browser** 👤

1. Repo `Healthy_Football` → oben **Settings** (Zahnrad).
2. Links unter «Code and automation» auf **Pages** klicken. Nicht unter «Actions», das ist ein anderer Bereich.
3. **Build and deployment → Source:** **«GitHub Actions»** wählen, nicht «Deploy from a branch».
4. Oben im Repo den Tab **Actions** öffnen → links **Deploy Web App** → rechts **Run workflow → Run workflow**.

**Prüfen** (nach ca. 1 Minute): `https://<USER>.github.io/Healthy_Football/` öffnen. Du solltest die App im Demo-Modus sehen. Siehst du nur das README, steht Pages noch auf «Deploy from a branch», oder der Browser zeigt die alte Version: `Ctrl+F5`.
Terminal: `curl -sL https://<USER>.github.io/Healthy_Football/ | grep -o "<title>.*</title>"` → `<title>Pulse Coach</title>`

---

## Schritt 4 – Python-Umgebung und Garmin-Login

Dieser Schritt läuft immer im Terminal, weil sich nur so lokal bei Garmin anmelden lässt (inkl. MFA).

🤖 Im Ordner des Klons bzw. des entpackten ZIPs:

```bash
# Windows (PowerShell)
py -3.14 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r sync\requirements.txt

# macOS / Linux
python3 -m venv .venv && source .venv/bin/activate
python -m pip install -r sync/requirements.txt
```

Wenn `Activate.ps1` blockiert ist: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.

👤 Garmin-Login. Er fragt E-Mail, Passwort und eventuell den MFA-Code:

**⌨️ Terminal (mit `gh`):** Das Token wird direkt als Secret gespeichert.
```bash
python sync/garmin_login.py --repo <USER>/Healthy_Football
```

**🖱️ Browser (ohne `gh`):**
1. Das Skript ohne `--repo` starten. Es gibt das Token aus:
   ```bash
   python sync/garmin_login.py
   ```
2. Die **ganze Zeile von `{` bis `}`** kopieren, ohne Text davor oder danach.
3. Repo `Healthy_Football` → **Settings → Secrets and variables → Actions** → Tab **Secrets** → **New repository secret**:
   - Name: `GARMIN_TOKENS`
   - Secret: die kopierte Zeile
4. **Add secret** klicken, danach das Terminal schliessen.

**Prüfen:** Unter Settings → Secrets and variables → Actions steht `GARMIN_TOKENS`.
Terminal: `gh secret list -R <USER>/Healthy_Football`

> Hinweis: `sync/requirements.txt` lädt die Garmin-Library aus dem Fork `schnre/python-garminconnect`. Wer davon unabhängig sein will, ersetzt die Zeile durch einen eigenen Fork oder das PyPI-Paket `garminconnect` und testet den Sync danach.

---

## Schritt 5 – Claude API-Key

**Wichtig:** Ein Claude-Pro- oder Max-Abo deckt die API **nicht** ab. Die API wird separat und nach Verbrauch abgerechnet.

👤 Key erstellen, das geht nur im Browser:
1. [console.anthropic.com](https://console.anthropic.com) öffnen, mit dem Claude-Konto anmelden.
2. **Billing** → 5–10 USD Guthaben aufladen (Prepaid, mehr kann es nicht kosten).
3. **Limits** → Monatslimit setzen, z.B. 20 USD.
4. **API Keys → Create Key**, Name `healthy-football`, und den Key kopieren (beginnt mit `sk-ant-`).

👤 Als Secret speichern:

**⌨️ Terminal:** fragt verdeckt nach dem Wert
```bash
gh secret set ANTHROPIC_API_KEY -R <USER>/Healthy_Football
```

**🖱️ Browser:** Repo `Healthy_Football` → **Settings → Secrets and variables → Actions** → **Secrets → New repository secret**, Name `ANTHROPIC_API_KEY`, Key einfügen, dann **Add secret**.

**Optional günstiger** (Variablen, nicht geheim):

| Name | Wert |
|---|---|
| `CLAUDE_MODEL` | `claude-sonnet-5-5` |
| `COACH_EFFORT` | `low` |

- ⌨️ `gh variable set CLAUDE_MODEL -R <USER>/Healthy_Football --body claude-sonnet-5-5` (analog `COACH_EFFORT`)
- 🖱️ Settings → Secrets and variables → Actions → Tab **Variables** → **New repository variable**

---

## Schritt 6 – Token für die Workflows (`GH_PAT`) und Daten-Repo-Variable

Mit diesem Token schreiben die Workflows ins private Daten-Repo und erneuern das Garmin-Token automatisch.

👤 Token erstellen, das geht nur im Browser: [github.com/settings/personal-access-tokens/new](https://github.com/settings/personal-access-tokens/new)
(oder: Profilbild → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token)

| Feld | Eingabe |
|---|---|
| Token name | `healthy-football-workflows` |
| Resource owner | dein Konto |
| Expiration | 90 days |
| Repository access | **Only select repositories** → `Healthy_Football` **und** `healthy_football_data` |
| Permissions | **Contents: Read and write** · **Secrets: Read and write** (Metadata: Read-only kommt automatisch) |

In der neueren Ansicht fügst du Rechte über **«+ Add permissions»** hinzu. Klicke **Generate token** und kopiere den Token. GitHub zeigt ihn nur einmal.

👤 Als Secret speichern:
- ⌨️ `gh secret set GH_PAT -R <USER>/Healthy_Football`
- 🖱️ Settings → Secrets and variables → Actions → **Secrets → New repository secret**, Name `GH_PAT`

Variable für das Daten-Repo setzen (nicht geheim):
- ⌨️ 🤖 `gh variable set DATA_REPO -R <USER>/Healthy_Football --body <USER>/healthy_football_data`
- 🖱️ 👤 Settings → Secrets and variables → Actions → Tab **Variables** → **New repository variable**, Name `DATA_REPO`, Wert `<USER>/healthy_football_data`

**Prüfen:** Unter **Secrets** stehen `ANTHROPIC_API_KEY`, `GARMIN_TOKENS` und `GH_PAT`, unter **Variables** steht `DATA_REPO`. Die Werte der Secrets siehst du nicht mehr, das ist normal.
Terminal: `gh secret list -R <USER>/Healthy_Football` und `gh variable list -R <USER>/Healthy_Football`

---

## Schritt 7 – Erster Garmin-Sync mit Coach-Analyse

**⌨️ Terminal** 🤖

```bash
gh workflow run garmin-sync.yml -R <USER>/Healthy_Football -f days=90 -f analyze=true
sleep 5
gh run watch -R <USER>/Healthy_Football $(gh run list -R <USER>/Healthy_Football --workflow garmin-sync.yml --limit 1 --json databaseId --jq '.[0].databaseId')
```

**🖱️ Browser** 👤

1. Repo `Healthy_Football` → Tab **Actions** → links **Garmin Sync**.
2. Rechts **Run workflow**:
   - Branch: `main`
   - Wie viele Tage neu laden: `90`
   - Danach eine Coach-Analyse starten: ✅ (einmalig für die erste Analyse)
3. **Run workflow** klicken. Der Lauf erscheint nach ein paar Sekunden und dauert 3–5 Minuten.

**Prüfen:** Der Lauf hat einen grünen Haken ✅, und im Repo `healthy_football_data` gibt es den Ordner `data/` mit `garmin.json` und `insights.json`.
Terminal: `gh api repos/<USER>/healthy_football_data/contents/data --jq '.[].name'`

**Bei rotem Kreuz ❌:**
- 🖱️ Lauf anklicken → Job **sync** → den rot markierten Schritt aufklappen und die Meldung lesen.
- ⌨️ `gh run view -R <USER>/Healthy_Football --log-failed`

Ursachen findest du in den Problemlösungen unten. Secrets erscheinen in den Logs nie, GitHub maskiert sie automatisch.

---

## Schritt 8 – App verbinden (pro Gerät)

Dieser Schritt läuft nur im Browser.

👤 **Einen eigenen Token pro Gerät erstellen.** Bei Verlust sperrst du nur diesen einen.
[github.com/settings/personal-access-tokens/new](https://github.com/settings/personal-access-tokens/new):

| Feld | Eingabe |
|---|---|
| Token name | `healthy-football-laptop` (später `…-handy`) |
| Expiration | 90 days |
| Repository access | `Healthy_Football` **und** `healthy_football_data` |
| Permissions | **Contents: Read and write** · **Actions: Read and write** |

👤 App öffnen: `https://<USER>.github.io/Healthy_Football/` → **Einstellungen → GitHub-Verbindung**

| Feld | Wert |
|---|---|
| GitHub-Benutzer | `<USER>` |
| Branch | `main` |
| Daten-Repo | `healthy_football_data` |
| App-Repo (Workflows) | `Healthy_Football` (wird automatisch erkannt) |
| Token | der neue App-Token |

Mit **Speichern & testen** prüfst du die Verbindung. Erwartet: «Verbunden mit <USER>/healthy_football_data (privat) · Workflows erreichbar». Danach siehst du deine echten Daten statt der Demo-Daten.

👤 Danach in der App das **Profil** (Einstellungen), deinen **Auftrag** (Coach → Anpassen), deine **Fixtermine** (Plan) und allenfalls **Bestwerte** (Verlauf → Bestwerte) ausfüllen. Damit werden die Tipps viel besser.

👤 **Handy:** Gleichen Ablauf mit eigenem Token (`healthy-football-handy`), danach im Browser «Zum Home-Bildschirm hinzufügen». Den «Setup-Link» aus den Einstellungen nur nutzen, wenn nötig. Er enthält den Token, also danach die Nachricht löschen.

---

## Fertig – was jetzt automatisch läuft

- **Alle 3 Stunden** (ca. 06–23 Uhr) holt *Garmin Sync* neue Aktivitäten und Gesundheitswerte. Das kostet nichts.
- **Claude analysiert nur auf Knopfdruck:** in der App **Coach → «Neu analysieren»** oder mit einer Frage. Jede Analyse kostet ca. 0.10–0.20 USD.
- Optional automatisch: In der App unter Einstellungen «Nach jedem erfassten Training automatisch analysieren» einschalten, und/oder im Repo die Variable `AUTO_ANALYZE` = `true` setzen (dann analysiert jeder Sync mit neuen Aktivitäten).
- Fragen an den Coach stellst du in der App unter **Coach → Frag deinen Coach**. Die Antwort kommt nach 1–2 Minuten.

---

## Sicherheit – Kurzfassung

| Schlüssel | Liegt | Schutz |
|---|---|---|
| `GARMIN_TOKENS`, `ANTHROPIC_API_KEY`, `GH_PAT` | GitHub-Secrets (verschlüsselt, nicht auslesbar, nicht in Forks) | Nie anderswo speichern |
| App-Token | Browser des jeweiligen Geräts | Eigener Token pro Gerät, 90 Tage Ablauf, Bildschirmsperre |

- Die App lädt keinen fremden Code (Content-Security-Policy) und schickt Daten nur an `api.github.com`.
- Fragen an den Coach landen im privaten Daten-Repo, nicht in den öffentlichen Actions-Logs.
- **Gerät verloren oder Verdacht auf Missbrauch:**
  1. Den betroffenen Token unter [github.com/settings/personal-access-tokens](https://github.com/settings/personal-access-tokens) mit **Revoke** sperren.
  2. Beim Garmin-Token das Garmin-Passwort ändern und Schritt 4 wiederholen.
  3. Beim Anthropic-Key den Key in der Console löschen und einen neuen erstellen.
- **Alle 90 Tage** laufen die GitHub-Tokens ab, GitHub schickt vorher eine E-Mail. Dann neue erstellen und eintragen (Schritt 6 und 8).

---

## Problemlösungen (bekannte Stolpersteine)

| Problem | Ursache und Lösung |
|---|---|
| Pages zeigt nur das README | Pages steht auf «Deploy from a branch». **Settings → Pages → Source: GitHub Actions**, dann *Deploy Web App* erneut starten. Danach `Ctrl+F5`, denn der Browser speichert die Seite bis zu 10 Minuten zwischen. |
| In Settings → Actions gibt es keine «Source»-Einstellung | Falscher Bereich: Die Einstellung liegt unter **Settings → Pages**. |
| `winget` wird nicht erkannt | Im Microsoft Store den «App Installer» installieren, oder Python direkt von python.org. |
| `garminconnect requires a different Python` | Python ist älter als 3.12. Neueres installieren und `.venv` damit neu erstellen. |
| `No module named pip` | `python -m ensurepip --upgrade` |
| Sync rot: «Garmin-Login fehlgeschlagen» | Token ungültig oder unvollständig kopiert (die `{ }` fehlen). Schritt 4 wiederholen. |
| Sync rot: «Weder GARMIN_TOKENS noch …» | Secret fehlt oder ist falsch geschrieben. Secrets-Liste prüfen. |
| Analyse rot: Claude API 401/403 | `ANTHROPIC_API_KEY` falsch, oder kein Guthaben in der Console. |
| Analyse rot: «credit balance too low» | Guthaben in der Anthropic Console aufladen. |
| Checkout des Daten-Repos schlägt fehl | `GH_PAT` fehlt, ist abgelaufen oder hat keinen Zugriff auf `healthy_football_data`. Variable `DATA_REPO` prüfen. |
| Warnung «GH_PAT fehlt – Secret GARMIN_TOKENS kann nicht aktualisiert werden» | `GH_PAT` braucht **Secrets: Read and write** auf `Healthy_Football`. |
| App: «Workflow nicht erreichbar» / «Not Found» | Im App-Token fehlt `Healthy_Football` oder **Actions: Read and write**. Oder in den Einstellungen steht ein falsches App-Repo. |
| App: «keine Schreibrechte auf das Daten-Repo» | App-Token braucht **Contents: Read and write** auf `healthy_football_data`. |
| Fussball als «Cardio»/«Andere» erkannt | Fussball-Modul einschalten (Einstellungen → Module), dann die Aktivität öffnen → **Ergänzen** → Sportart Fussball. |
| Geplanter Sync läuft plötzlich nicht mehr | GitHub deaktiviert Zeitpläne nach 60 Tagen ohne Commit im App-Repo. Im Tab Actions wieder aktivieren. |

---

## Updates vom Original übernehmen

- **Fork:**
  - 🖱️ Im eigenen Repo auf **«Sync fork» → Update branch** klicken.
  - ⌨️ `gh repo sync <USER>/Healthy_Football`

  Die Seite wird danach automatisch neu deployt.
- **Template:**
  ```bash
  git remote add upstream https://github.com/schnre/Healthy_Football.git
  git fetch upstream
  git merge upstream/main
  git push
  ```

Deine Daten (privates Repo), Secrets und App-Einstellungen bleiben bei Updates erhalten.
