# SEPA-Lastschriften der BildungsWerkstatt

Liest die SEPA-Mandate aus Paperless und erzeugt daraus die Importdatei für windata.

> **Zwei verschiedene „Paperless".** Die BildungsWerkstatt erprobt **paperless.io**,
> den Dienst für digitale Vertragsunterzeichnung. Davon zu unterscheiden ist
> **paperless-ngx**, das selbst betriebene Dokumentenarchiv. Das Werkzeug bedient
> beide sowie den Weg über eine Datei — Einzelheiten in
> [docs/paperless-setup.md](docs/paperless-setup.md).

Das Werkzeug ist eine einzelne HTML-Seite. Es gibt keinen Server, keine Datenbank und
keine Anmeldung. Alle Daten bleiben in dem Browser, in dem die Seite geöffnet ist.
Nach dem Schließen des Fensters ist nichts davon übrig.

## Der Weg durch das Werkzeug

1. **Mandate holen** — drei Quellen stehen zur Wahl:
   - **paperless.io** (der Regelfall): digital ausgefüllte Mandate, die Felder kommen
     strukturiert an. Beim ersten Verbinden werden die Felder einmal zugeordnet.
   - **Datei**: für eingescannte Papiermandate und Exporte. Sammelscans mit mehreren
     Mandaten werden zerlegt.
   - **paperless-ngx**: falls ein eigenes Dokumentenarchiv betrieben wird.
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

Drei Wege, in dieser Reihenfolge:

1. **Gepflegte Felder** aus dem Dokumentensystem — werden unverändert übernommen
   und tragen keinen Prüfhinweis.
2. **Die Formulare der BildungsWerkstatt** — das Werkzeug kennt beide Varianten
   (Anlage 1 des Betreuungsvertrags und die Anmeldung zum Mittagessen), zerlegt
   Sammelscans und liest Kontoinhaber\*in, Kind, IBAN, BIC und Unterschriftsdatum.
3. **Allgemeine Textregeln** als letzter Rückfall.

Jede IBAN läuft durch die Prüfziffernrechnung nach ISO 7064. Eine IBAN, die dort
durchfällt, kommt nicht in die Datei — ein Lesefehler soll nicht zur Rücklastschrift
führen. Wo der Scan eine Rekonstruktion zulässt, wird sie ausdrücklich als solche
gekennzeichnet; lässt der Scan mehrere gültige Lesarten zu, wird gar nichts
vorgeschlagen.

### Was das an den echten Belegen bedeutet

Gemessen am Sammelscan mit fünf unterschriebenen Mandaten: Kontoinhaber\*in, Kind
und Unterschriftsdatum werden vollständig gelesen, der BIC in zwei von fünf Fällen,
**die IBAN in keinem einzigen**. Die handschriftlich ausgefüllten Kästchenfelder
sind für die Texterkennung nicht sicher lesbar. Für Papierbestände heißt das:
Die IBANs müssen einmal von Hand erfasst werden. Für Mandate, die künftig über
paperless.io digital ausgefüllt werden, entfällt das.

### Feste Angaben der BildungsWerkstatt

| | |
|---|---|
| Gläubiger-Identifikationsnummer | `DE82BWS00002311070` |
| Schema der Mandatsreferenz | `BWS_<Nachname>-<Vorname des Kindes>` |
| Zahlungsempfänger laut Mandat | BildungsWerkstatt e.V., Astrid-Lindgren-Str. 16, 81829 München |

**Zum Unterstrich im Referenzschema:** Der SEPA-Basiszeichensatz kennt ihn nicht.
`BWS_Meier-Lea` wird in der Datei zu `BWS Meier-Lea`. Der Einzug funktioniert, aber
die Referenz weicht damit von der auf dem unterschriebenen Mandat ab. Das Werkzeug
weist bei jedem betroffenen Mandat darauf hin. Sauber wäre, das Schema künftig auf
`BWS-<Nachname>-<Vorname>` umzustellen.

Die Gläubiger-ID ist in der Oberfläche vorbelegt. Die Mandatsreferenz steht auf
den Belegen nicht ausgefüllt, sondern nur als Schema — das Werkzeug bildet sie
daraus und weist darauf hin, dass sie mit der Buchhaltung abzugleichen ist.

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
src/paperless-io.js     API-Zugriff auf paperless.io samt freier Feldzuordnung
src/paperless.js        API-Zugriff auf paperless-ngx (nur lesend)
src/bws-formular.js     Formulare der BildungsWerkstatt lesen, Sammelscans zerlegen
src/ocr-iban.js         IBAN und BIC aus schlecht erkanntem Formulartext gewinnen
src/mandate.js          Mandat aus Dokument gewinnen, Fehler von Hinweisen trennen
src/windata.js          windata-CSV bauen
src/sepa-xml.js         pain.008.001.02 als Rückfallweg
src/vorlage.js          Platzhalter im Verwendungszweck
src/app.js              Ablaufsteuerung
tests/                  Tests, ohne Fremdpakete (node --test)
beispiele/              Beispiel-Export zum Ausprobieren ohne echte Daten
scripts/api-erkunden.mjs  zeigt, was ein Paperless-Token an der API erreicht
```

## Tests

```bash
npm test        # oder: node --test
```

Geprüft werden unter anderem: Prüfziffernrechnung, Zeichensatz-Umschrift, Feldpositionen
der CSV, Trennung von Fehlern und Hinweisen, Blockbildung im pain.008 und das Verhalten
des Paperless-Clients bei abgelehntem Token und bei blockiertem CORS.

## Vor dem ersten echten Lauf

- Den ersten Import in windata mit **einer** Zeile testen und die Feldzuordnung prüfen.
- Die gebildeten Mandatsreferenzen mit der Buchhaltung abgleichen.
- Fristen der Vorabinformation gegenüber den Eltern beachten.
- Erstlastschrift (`FRST`) und Folgelastschrift (`RCUR`) auseinanderhalten.

## Datenschutz

Bankdaten von Eltern werden nur im Arbeitsspeicher des Browsers verarbeitet und nie
gespeichert. Gespeichert werden ausschließlich die Stammdaten des Vereins.
Einzelheiten: [docs/datenschutz.md](docs/datenschutz.md).

## Was die Paperless-API hergibt

```bash
node scripts/api-erkunden.mjs --basis https://DIE-BASISADRESSE
```

Fragt den Token ab, probiert die üblichen Anmeldeverfahren und danach lesende
Adressen durch und schreibt einen Bericht, was der Zugang erreicht. Es werden
ausschließlich GET-Anfragen gestellt; im Account wird nichts verändert. Der
Token wird nicht gespeichert und steht nicht im Bericht.

## Was der Zugang darf

```bash
node scripts/schreibrechte-pruefen.mjs
```

Zeigt, welche Bereiche der Token lesen darf und welche Rechte ihm fehlen —
paperless.io nennt den fehlenden Scope in seiner Antwort selbst. Der heutige
Zugang liest Dokumente und Vorlagen, sonst nichts; Kontakte und
Arbeitsbereiche sind gesperrt.

Das Skript legt nichts an, versendet nichts und löscht nichts. Wie es das
sicherstellt und was das für die Massenanlage von Mandaten bedeutet, steht in
[docs/paperless-setup.md](docs/paperless-setup.md).
