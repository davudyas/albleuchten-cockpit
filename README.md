# Albleuchten Import-Cockpit

Fallstudie AEB × Hochschule Pforzheim: Fracht, Zoll, Incoterms, Cashflow und Risiko für den Import von LED-Leuchten aus China.
Falldaten aus dem Skript, Marktraten als änderbare Annahmen.

- `index.html`: die ganze App (eine Datei)
- `lage.json`: Lagebild für die Seite „Risiko & Lagebild“ (wird jeden Morgen aktualisiert)
- `claude-shim.js`: verbindet Assistent und KI-Lagebericht mit der Netlify-Funktion statt mit claude.ai
- `netlify/functions/sample.mjs`: ruft die Anthropic-API auf; der Schlüssel bleibt auf dem Server

## KI einschalten
In Netlify unter *Project configuration → Environment variables* `ANTHROPIC_API_KEY` anlegen und neu deployen.
Optional `ANTHROPIC_MODEL` (Standard `claude-sonnet-5-5`). Ohne Schlüssel läuft die App normal,
nur Assistent und KI-Lagebericht sind ausgeblendet.
