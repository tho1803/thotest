# Datenschutz

## Was das Werkzeug tut

Es liest Mandatsdaten aus Paperless, zeigt sie an und schreibt daraus eine Datei
auf die Festplatte des Rechners, an dem gearbeitet wird.

## Wo die Daten liegen

| Daten | Ort | Dauer |
|-------|-----|-------|
| Mandatsdaten (Name, IBAN, BIC, Mandatsreferenz, Betrag) | Arbeitsspeicher des Browsers | bis das Fenster geschlossen wird |
| Paperless-Token | Arbeitsspeicher des Browsers | bis das Fenster geschlossen wird |
| Stammdaten des Vereins (Name, IBAN, BIC, Gläubiger-ID, Paperless-Adresse, Vorlage) | `localStorage` des Browsers | bis sie gelöscht werden |
| Erzeugte Import- und XML-Dateien | dort, wo der Browser Downloads ablegt | bis sie gelöscht werden |

Es gibt keinen Server, der die Daten sieht. Die Seite baut keine Verbindung nach außen
auf — auch keine zu Schriftanbietern oder Analysediensten. Die einzige Verbindung geht
zur Paperless-Instanz des Vereins.

## Was daraus folgt

- **Verantwortlich** ist die BildungsWerkstatt e.V. Es kommt kein Auftragsverarbeiter
  hinzu, weil kein Dritter Daten verarbeitet.
- **Rechtsgrundlage** des Einzugs ist der Betreuungsvertrag (Art. 6 Abs. 1 lit. b DSGVO);
  das Mandat selbst ist die zahlungsverkehrsrechtliche Ermächtigung.
- **Ein eigener Eintrag im Verarbeitungsverzeichnis** ist nicht nötig, solange der
  Beitragseinzug dort bereits geführt wird. Dieses Werkzeug ist ein Hilfsmittel
  innerhalb dieser Verarbeitung, keine neue.
- **Eine Datenschutz-Folgenabschätzung** löst das Werkzeug nicht aus: keine zentrale
  Datenhaltung, keine Profilbildung, keine Daten nach Art. 9 DSGVO.

## Regeln für die Arbeit damit

1. Nur an einem Rechner des Vereins arbeiten, nicht an einem geteilten oder privaten.
2. Die erzeugte CSV nach dem Import in windata löschen. Sie enthält alle IBANs im Klartext.
3. Den Downloadordner nicht in eine Cloud synchronisieren lassen.
4. Kein Mandat und keine erzeugte Datei per E-Mail versenden.
5. Den Paperless-Token nicht notieren; bei Verdacht im Profil neu erzeugen.
6. Für die Arbeit ein Paperless-Konto mit reinem Leserecht verwenden.

Die `.gitignore` dieses Projekts schließt `*.csv` und `*.xml` aus, damit echte
Daten nicht versehentlich in die Versionsverwaltung geraten.

## Kindbezug

Erscheint der Name eines Kindes im Verwendungszweck, steht er anschließend auf dem
Kontoauszug beider Seiten. Das ist zulässig und üblich, lässt sich aber vermeiden:
Die Vorlage des Verwendungszwecks kann statt `{kind}` auch nur `{mandat}` verwenden.
Dann steht dort ausschließlich die Mandatsreferenz.
