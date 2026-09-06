# SEPA-Lastschriften der BildungsWerkstatt

Liest die SEPA-Mandate aus Paperless und erzeugt daraus die Importdatei für windata.

Das Werkzeug ist eine einzelne HTML-Seite. Es gibt keinen Server, keine Datenbank und
keine Anmeldung. Alle Daten bleiben in dem Browser, in dem die Seite geöffnet ist.
Nach dem Schließen des Fensters ist nichts davon übrig.

## Der Weg durch das Werkzeug

1. **Mandate holen** — die Seite fragt Paperless über dessen API ab, Tag auswählen, laden.
   Ohne Netzzugriff geht es auch über eine aus Paperless exportierte JSON-Datei.
2. **Lauf festlegen** — Gläubiger-ID, Fälligkeit, Betrag, Sequenz, Verwendungszweck.
3. **Prüfen** — jede Zeile bekommt einen Befund. Rot hält sie aus dem Lauf heraus,
   Gelb heißt: aus der Texterkennung gelesen, vor dem Einzug am Beleg gegenlesen.
4. **Datei erzeugen** — `windata CSV 1.2` (oder 1.1), wahlweise zusätzlich pain.008-XML.

## Starten

Die Seite braucht einen lokalen Webserver, weil sie aus ES-Modulen besteht —
über `file://` blockiert der Browser deren Nachladen.

```bash
cd bws-sepa
python3 -m http.server 8080
# dann http://localhost:8080 im Browser öffnen
```

Die Adresse `http://localhost:8080` muss in Paperless als CORS-Ursprung freigegeben
sein, siehe [docs/paperless-setup.md](docs/paperless-setup.md).

## Woher die Mandatsdaten kommen

Zwei Wege, in dieser Reihenfolge:

1. **Custom Fields in Paperless** — gepflegte Werte werden unverändert übernommen.
   Das ist der verlässliche Weg; solche Zeilen tragen keinen Prüfhinweis.
2. **Der OCR-Text des Belegs** — Rückfall über Textregeln für IBAN, BIC,
   Mandatsreferenz, Kontoinhaber und Unterschriftsdatum. Diese Zeilen sind brauchbar,
   werden aber immer als „zu prüfen" markiert.

Jede IBAN läuft durch die Prüfziffernrechnung nach ISO 7064. Eine IBAN, die dort
durchfällt, kommt nicht in die Datei — ein OCR-Fehler soll nicht zur Rücklastschrift führen.

## Was in die Datei geschrieben wird

Die CSV folgt der Datensatzbeschreibung *windata Zahlungen.CSV*: Semikolon als Trenner,
CR/LF als Zeilenende, Datum `TT.MM.JJJJ`, Betrag mit Komma, 35 Felder in Version 1.2.
Alle Texte werden in den SEPA-Basiszeichensatz umgeschrieben (`Müller` → `Mueller`),
damit beim Import keine Zeichensatzfrage offenbleibt. Details und die Feldbelegung:
[docs/windata-import.md](docs/windata-import.md).

## Aufbau

```
index.html              Oberfläche
src/iban.js             IBAN- und BIC-Prüfung (Mod 97)
src/sepa-text.js        SEPA-Zeichensatz, Feldlängen, Verwendungszweck-Zeilen
src/paperless.js        API-Zugriff auf Paperless (nur lesend)
src/mandate.js          Mandat aus Dokument gewinnen, Fehler von Hinweisen trennen
src/windata.js          windata-CSV bauen
src/sepa-xml.js         pain.008.001.02 als Rückfallweg
src/vorlage.js          Platzhalter im Verwendungszweck
src/app.js              Ablaufsteuerung
tests/                  Tests, ohne Fremdpakete (node --test)
beispiele/              Beispiel-Export zum Ausprobieren ohne echte Daten
```

## Tests

```bash
npm test        # oder: node --test
```

Geprüft werden unter anderem: Prüfziffernrechnung, Zeichensatz-Umschrift, Feldpositionen
der CSV, Trennung von Fehlern und Hinweisen, Blockbildung im pain.008 und das Verhalten
des Paperless-Clients bei abgelehntem Token und bei blockiertem CORS.

## Vor dem ersten echten Lauf

- Gläubiger-Identifikationsnummer des Vereins eintragen (die Seite kennt sie nicht).
- Den ersten Import in windata mit **einer** Zeile testen und die Feldzuordnung prüfen.
- Fristen der Vorabinformation gegenüber den Eltern beachten.
- Erstlastschrift (`FRST`) und Folgelastschrift (`RCUR`) auseinanderhalten.

## Datenschutz

Bankdaten von Eltern werden nur im Arbeitsspeicher des Browsers verarbeitet und nie
gespeichert. Gespeichert werden ausschließlich die Stammdaten des Vereins.
Einzelheiten: [docs/datenschutz.md](docs/datenschutz.md).
