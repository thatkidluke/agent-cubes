# Agent Cubes

Agent Cubes zeigt neben dem Chat, wie weit die aktuelle Aufgabe deiner Agents ist: als
Würfel-Zeitleiste in Seitenansicht. Jeder Schritt des Plans (`update_plan`, `TodoWrite`,
`TaskCreate`/`TaskUpdate`) wird ein Würfel, der sich mit der Arbeit füllt. Kleine Würfel
darin stehen für die einzelnen Tool-Aufrufe, eingefärbt nach Art (lesen, schreiben,
ausführen, Agent).

Subagents erscheinen mit eigenem Buchstaben und eigener Farbe auf dem Würfel, an dem sie
arbeiten. Das Panel schätzt Fortschritt und Restzeit, erkennt hängende Schritte, zeigt im
Kontext-Tank, wie voll das Kontextfenster ist, und lässt sich in sechs Skins darstellen.
Mit einem Klick speicherst du das Bild als SVG.

## Funktionen

- **Würfel-Zeitleiste**: ein Würfel pro Planschritt, animiert, mit Status (offen, läuft,
  fertig, wartet, Fehler)
- **Agents**: Hauptagent und Subagents mit aktuellem Werkzeug und Würfel; „Ansehen“
  springt zur Ansicht des Agents
- **Fortschritt und Restzeit**: geschätzt aus Zeit und Aufrufen der fertigen Schritte und
  früherer Aufträge
- **Hängt-Erkennung**: Fehler in Folge, wiederholt derselbe Aufruf, lange Stille oder
  ungewöhnlich lange Dauer
- **Kontext-Tank**: Füllstand des Kontextfensters, gelb ab 80 %, rot ab 92 %
- **Würfel-Details**: Dauer, Tokens, Kosten, Codezeilen, Tests, Dateien und letzte
  Aufrufe eines Schritts
- **Statistik**: Durchschnittswerte über die letzten zwölf Aufträge
- **Skins**: Classic, Cyber, Stellar, Retro, Steampunk, Minimal
- **Export**: „Als Bild speichern“ legt eine SVG-Datei im Arbeitsordner ab
- **Terminal**: ohne SVG-Unterstützung zeigt das Panel eine Textleiste statt der Grafik

Das Panel öffnet sich beim Sitzungsstart (abschaltbar) oder jederzeit mit `/cubes`.

## Installation

Im Terminal, an der Eingabe einer Claude-Code-Sitzung:

```
/plugin install agent-cubes --marketplace thatkidluke/agent-cubes
```

Bestätige das Hinzufügen des Marketplace mit `y` und wähle dann den Geltungsbereich.

Oder direkt in der Shell:

```
claude plugin install agent-cubes --marketplace thatkidluke/agent-cubes
```

In der Desktop-App: Klicke auf **+** neben dem Eingabefeld, dann auf **Plugins**, wähle
**Add marketplace** und gib `thatkidluke/agent-cubes` ein, danach **Add plugin** bei Agent Cubes.

## Einstellungen

Die Einstellungen stehen im Konfigurationsmenü (`/config`) unter Agent Cubes. Eine
Änderung lädt das Plugin sofort neu.

| Einstellung          | Typ    | Standard  | Bedeutung |
| -------------------- | ------ | --------- | --------- |
| `defaultSkin`        | Auswahl | `classic` | Skin, solange im Panel keiner gewählt ist. Eine Wahl im Panel hat Vorrang. |
| `autoOpen`           | Ja/Nein | ja        | Panel beim Start jeder Sitzung öffnen. Sonst nur über `/cubes`. |
| `animations`         | Ja/Nein | ja        | Animationen in Panel und Export. Aus: ruhiges Standbild. |
| `stuckSilentMinutes` | Zahl   | 5         | Minuten ohne Tool-Aufruf, ab denen ein Würfel als hängend gilt (0,5–240). |
| `stuckFailsInRow`    | Zahl   | 3         | Fehlgeschlagene Aufrufe in Folge, ab denen ein Würfel hängt (1–50). |
| `stuckSlowFactor`    | Zahl   | 3         | So viel länger als ein üblicher Schritt, mindestens 8 Minuten (1,1–50). |

Werte außerhalb der Grenzen werden auf die nächste Grenze gesetzt, ungültige Werte durch
den Standard ersetzt.

## Wie genau sind die Zahlen?

Fortschritt, Restzeit und Kosten sind **Schätzungen**. Ein Schritt in Arbeit füllt sich
nach Zeit und Aufrufen im Vergleich zu den bereits fertigen Schritten (oder, bis einer
fertig ist, zu früheren Aufträgen); voll wird er erst, wenn er abgehakt ist. Die Kosten
eines Auftrags sind die Differenz der Sitzungskosten seit Auftragsbeginn, auf die Schritte
verteilt nach ihren preisgewichteten Tokens. Wo die Sitzung keine Kosten meldet, steht „–“.
Verbindlich sind nur die Angaben deines Kontos.

## Lizenz

MIT, siehe [LICENSE](LICENSE).
