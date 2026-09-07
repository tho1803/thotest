# Import in windata

## Feldbelegung der CSV

Die Datei folgt der Datensatzbeschreibung *windata Zahlungen.CSV*
(<https://wiki.windata.de/index.php?title=Datensatzbeschreibung_windata_Zahlungen.CSV>).

- Trennzeichen: Semikolon
- Zeilenende: CR/LF
- Zeile 1: `windata CSV 1.2` beziehungsweise `windata CSV 1.1`
- Datum: `TT.MM.JJJJ` · Betrag: `1234,56`
- Anführungszeichen sind im Format nicht zulässig und kommen deshalb nicht vor

| Nr. | Feld | Was hier hineingeschrieben wird |
|----:|------|----------------------------------|
| 1 | AG Name | Name des Vereins |
| 2 | AG IBAN | IBAN des Vereinskontos |
| 3 | AG BIC | BIC des Vereinskontos |
| 4 | Zahlpflichtiger Name | Kontoinhaber\*in aus dem Mandat |
| 5 | Name 2 | leer |
| 6 | Straße | falls im Mandat vorhanden |
| 7 | Ort | falls im Mandat vorhanden |
| 8 | Zahlpflichtiger IBAN | IBAN aus dem Mandat |
| 9 | Zahlpflichtiger BIC | falls vorhanden; bei deutschen IBANs entbehrlich |
| 10 | Betrag | Einzugsbetrag |
| 11 | Währung | `EUR` |
| 12 | Zahlart | `BASIS`, `COR1` oder `FIRMEN` |
| 13 | Termin | Fälligkeit des Einzugs |
| 14–27 | VWZ 1–14 | Verwendungszweck, je 27 Zeichen |
| 28 | Ref-ID | Mandatsreferenz (dient der Zuordnung im Kontoauszug) |
| 29 | Mandat-ID | Mandatsreferenz |
| 30 | Mandat-Datum | Datum der Unterschrift |
| 31 | AG Gläubiger-ID | Gläubiger-Identifikationsnummer des Vereins |
| 32 | Sequenz | `FRST`, `RCUR`, `OOFF` oder `FNAL` |
| 33 | Übergeordneter Auftraggeber | leer |
| 34 | Laufzeit | nur Version 1.2, leer |
| 35 | Zahlweise | nur Version 1.2, leer |

## Ablauf in windata

1. **Datei → Import → Zahlungen**
2. Format **windata CSV** wählen und die erzeugte Datei angeben
3. Die Feldzuordnung prüfen — beim ersten Mal Feld für Feld
4. Den Stapel in der Zahlungsübersicht kontrollieren: Anzahl und Summe müssen
   mit der Anzeige im Werkzeug übereinstimmen
5. Erst danach freigeben und an die Bank senden

**Den ersten Import mit einer einzelnen Zeile machen.** Erst wenn diese sauber
durchläuft, den ganzen Lauf importieren.

## Wenn die CSV nicht angenommen wird

Dann den zweiten Weg nehmen: das Werkzeug erzeugt dieselben Daten auch als
`pain.008.001.02`. Diese Datei ist der ISO-Standard für SEPA-Lastschriften und wird
in windata über **Datei → Import → SEPA** eingelesen. Was die CSV an Feldzuordnung
verlangt, steht dort bereits fest im XML.

## Sequenztypen

| Wert | Wann |
|------|------|
| `FRST` | erster Einzug zu einem Mandat |
| `RCUR` | jeder weitere Einzug |
| `OOFF` | einmaliger Einzug, das Mandat ist danach verbraucht |
| `FNAL` | letzter Einzug zu einem Mandat |

Seit der SEPA-Umstellung akzeptieren die meisten Banken durchgehend `RCUR`.
Im Zweifel gilt die Auskunft der SozialBank.

## Fristen

Basislastschriften sind der Bank spätestens einen Bankarbeitstag vor Fälligkeit
einzureichen (`COR1`-Regel, seit 2016 allgemein). Die Vorabinformation an die Eltern
muss vor dem Einzug vorliegen — üblich sind 14 Tage, kürzere Fristen lassen sich
im Beitragsbescheid oder im Betreuungsvertrag vereinbaren.
