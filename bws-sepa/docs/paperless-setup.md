# Paperless für den Mandatsabruf einrichten

## 1. Token erzeugen

In Paperless oben rechts auf den Benutzernamen → **Mein Profil** → Abschnitt
*API-Token* → **Token erzeugen**. Der Token wird einmal angezeigt.

Der Token hat dieselben Rechte wie das Benutzerkonto. Für dieses Werkzeug genügt ein
Konto mit reinem Leserecht auf die Mandatsdokumente. Das Werkzeug schreibt nichts
nach Paperless zurück.

Der Token wird von der Seite **nicht** gespeichert — nach dem Schließen des Fensters
muss er neu eingegeben werden. Das ist Absicht.

## 2. CORS freigeben

Der Browser ruft Paperless direkt auf. Damit er das darf, muss Paperless den Ursprung
der Seite kennen. In der `docker-compose.env` beziehungsweise `paperless.conf`:

```
PAPERLESS_CORS_ALLOWED_HOSTS=http://localhost:8080
```

Mehrere Ursprünge werden durch Komma getrennt. Danach Paperless neu starten.

Fehlt die Freigabe, meldet die Seite „Verbindung zu Paperless nicht möglich" — der
Browser zeigt den eigentlichen Grund nur in der Entwicklerkonsole an, das ist bei
CORS technisch so vorgesehen.

**Ohne CORS-Freigabe** bleibt der zweite Weg: in Paperless die gefilterte Dokumentliste
über die API als JSON abrufen und die Datei in der Seite öffnen. Zum Beispiel:

```bash
curl -H "Authorization: Token DEIN_TOKEN" \
  "https://paperless.example/api/documents/?tags__name__iexact=SEPA-Mandat&page_size=250" \
  > mandate.json
```

## 3. Tag setzen

Alle Mandate brauchen einen gemeinsamen Tag, zum Beispiel `SEPA-Mandat`. Die Seite
schlägt beim Verbinden von selbst einen Tag vor, dessen Name „SEPA" oder „Mandat" enthält.

## 4. Custom Fields anlegen (empfohlen)

Ohne gepflegte Felder liest das Werkzeug aus dem OCR-Text — das funktioniert, jede
Zeile trägt dann aber den Hinweis „am Beleg prüfen". Mit diesen Feldern entfällt das:

| Feldname in Paperless | Typ            | Inhalt                                  |
|-----------------------|----------------|-----------------------------------------|
| `IBAN`                | Text           | IBAN der zahlungspflichtigen Person     |
| `BIC`                 | Text           | optional, bei deutschen IBANs entbehrlich |
| `Kontoinhaber`        | Text           | genau wie auf dem Mandat unterschrieben |
| `Mandatsreferenz`     | Text           | die vom Verein vergebene Referenz        |
| `Mandatsdatum`        | Datum          | Datum der Unterschrift                   |
| `Kind`                | Text           | für den Verwendungszweck                 |
| `Monatsbeitrag`       | Betrag oder Text | wenn der Beitrag je Familie abweicht   |

Abweichende Feldnamen sind möglich — sie sind in `src/mandate.js` unter
`STANDARD_FELDZUORDNUNG` hinterlegt und werden dort ergänzt.

## Was das Werkzeug abfragt

| Zweck                  | Endpunkt                                      |
|------------------------|-----------------------------------------------|
| Verbindung prüfen      | `GET /api/documents/?page_size=1`             |
| Tags auflisten         | `GET /api/tags/`                              |
| Felddefinitionen holen | `GET /api/custom_fields/`                     |
| Mandate laden          | `GET /api/documents/?tags__id__all=<id>`      |

Alle Aufrufe sind lesend.
