# FocusMode - Browser Extension

Eine moderne Browser-Erweiterung für Chrome, Edge und Brave, die dir hilft, produktiv zu bleiben.

## Funktionen

* ** Site Blocker:** Blockiere ablenkende Webseiten (mit Autocomplete-Vorschlägen für Top-Seiten).
* ** Element Hider:** Klicke auf störende Elemente (z.B. News-Feeds, Werbung), um sie dauerhaft auszublenden.
* ** Verwaltungs-Modus:** Stelle versteckte Elemente visuell wieder her oder setze alle Änderungen einer Seite zurück.
* ** Schnellbedienung:** Nutze die Enter-Taste und Pfeiltasten für blitzschnelle Eingaben.

## Installation (Entwicklermodus)

Da diese Erweiterung noch nicht im Chrome Web Store gelistet ist, kannst du sie lokal installieren:

1.  Lade dieses Repository herunter (Code -> Download ZIP) und entpacke es.
2.  Öffne deinen Browser (Chrome/Edge/Brave).
3.  Gehe zu den Erweiterungen:
    * Chrome: `chrome://extensions/`
    * Edge: `edge://extensions/`
4.  Aktiviere oben rechts den **Entwicklermodus** (Developer mode).
5.  Klicke oben links auf **"Entpackte Erweiterung laden"** (Load unpacked).
6.  Wähle den Ordner `FocusMode` aus.
7.  Fertig! Pinne die Erweiterung oben in deiner Leiste fest.

## Nutzung

1.  Klicke auf das **FocusMode-Icon**.
2.  **Webseite blockieren:** Tippe z.B. `reddit` ein, wähle den Vorschlag und drücke Enter.
3.  **Elemente verstecken:** Gehe auf eine Seite, öffne das Popup und klicke auf "Neues Element verstecken". Klicke dann auf das Element auf der Webseite.

## Architektur & Tests

Die fachlichen Anforderungen sind in [ANFORDERUNGEN.md](ANFORDERUNGEN.md)
beschrieben; jede Fachregel trägt dort eine ID (z. B. `B-4`, `P-3`), und eine
Tabelle ordnet die Regeln den Fachmodulen und Testdateien zu.

* `src/core/` — **Fachkern**: reine, browserfreie Module (Blockliste,
  Tracking, Statistik, Pomodoro-Zustandsmaschine, Empfehlungen, …).
* `background.js` — Service-Worker-**Adapter**: Browser-Ereignisse, Alarme,
  Storage; Fachregeln werden aus `src/core/` bezogen.
* `src/ui/` + `src/lib/` — Popup-Oberfläche und Präsentationshelfer.
* `content.js` — Content-Script (Element-Hider); bewusst eigenständig, da
  Content-Scripts keine ES-Module laden können.

Fachliche Tests (Node-Testrunner, keine Abhängigkeiten):

```bash
npm test
```

## Datenschutz

Diese Erweiterung läuft **100% lokal**.
* Keine Daten verlassen deinen Browser.
* Alle Einstellungen werden in deinem lokalen Browser-Storage (`chrome.storage.local`) gespeichert.
* Kein Tracking, keine Analyse-Tools.
