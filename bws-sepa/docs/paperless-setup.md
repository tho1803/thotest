# Woher die Mandate kommen

## Zwei verschiedene „Paperless"

Das ist die wichtigste Unterscheidung in diesem Projekt:

| | **paperless.io** | **paperless-ngx** |
|---|---|---|
| Was | Dienst für digitale Vertragsunterzeichnung, Anbieter: Paperless GmbH, München | selbst betriebenes Dokumentenarchiv, freie Software |
| Bei der BWS | in Erprobung; das SEPA-Mandat liegt dort als Vorlage | nicht im Einsatz |
| Zugang | API mit Token, Dokumentation unter developers.paperless.io | REST-API unter `/api/documents/` |

Dieses Werkzeug bedient beide Wege und zusätzlich den Weg über eine Datei.

## Weg 1: Datei einlesen (funktioniert heute)

Der verlässliche Weg, solange die API-Anbindung nicht steht:

1. Die Mandate als PDF exportieren und durch eine Texterkennung laufen lassen
   (oder den vorhandenen Text nehmen).
2. Den Text als JSON in der Form `{"results":[{"id":1,"title":"…","content":"…"}]}`
   ablegen — ein Eintrag je Datei, auch wenn eine Datei mehrere Mandate enthält.
3. In der Seite auf **JSON-Export öffnen** klicken.

Das Werkzeug erkennt die Formulare der BildungsWerkstatt an ihrem Wortlaut,
zerlegt Sammelscans in einzelne Mandate und liest je Mandat Kontoinhaber\*in,
Kind, IBAN, BIC und Unterschriftsdatum.

## Weg 2: paperless.io über die API — der Regelfall

Konto der BildungsWerkstatt: <https://app.paperless.io/14644/dashboard/mine>

Nach allem, was sich von außen prüfen lässt, liegt die API unter
`https://app.paperless.io/api` mit Bearer-Token: Ein Aufruf von
`/v1/documents` ohne gültigen Token wird mit **403** beantwortet, nicht mit
404. Die Adresse existiert also und die API antwortet — bestätigt ist das
erst mit einem echten Token.

### Felder zuordnen

Wie paperless.io die ausgefüllten Formularfelder benennt, entscheidet der
Anbieter. Deshalb rät das Werkzeug nicht: Beim ersten Verbinden holt es ein
Dokument, sammelt alle enthaltenen Felder ein und zeigt sie mit ihrem Wert
aus diesem Dokument zur Auswahl an — wie die Feldzuordnung beim Import in
windata. Zugeordnet werden:

Kontoinhaber\*in · IBAN · BIC · Mandatsreferenz · Mandatsdatum ·
Name des Kindes · Betrag

Die Zuordnung bleibt im Browser gespeichert und ist nur einmal nötig. Ein
Vorschlag wird anhand der Feldnamen gemacht und lässt sich überall ändern.

### Wenn der Browser die Anfrage blockiert

Erlaubt paperless.io die Anfrage von einer lokal geöffneten Seite nicht
(CORS), meldet das Werkzeug das ausdrücklich. Dann bleibt der Weg über eine
Datei — oder paperless.io gibt die Adresse `http://localhost:8080` frei.

### Was der Zugang hergibt

Beides — Basisadresse und Anmeldeverfahren — lässt sich mit dem beiliegenden
Skript nachprüfen:

```bash
node scripts/api-erkunden.mjs --basis https://DIE-BASISADRESSE
```

Es fragt den Token ab (er wird nicht gespeichert), probiert die üblichen
Anmeldeverfahren durch und danach eine Reihe lesender Adressen. Am Ende steht
ein Bericht in `paperless-api-bericht.txt`, der zeigt, was der Zugang
erreicht und welche Felder zurückkommen. Das Skript stellt **nur** GET-Anfragen
und verändert nichts.

Die Statuscodes sind dabei die eigentliche Auskunft:

| Antwort | Bedeutung |
|---------|-----------|
| 200 | Adresse und Token stimmen |
| 401 | Adresse stimmt, der Token wird nicht angenommen |
| 403 | Adresse stimmt, dieser Zugang darf sie nicht lesen |
| 404 | diese Adresse gibt es nicht — Basisadresse prüfen |

Sobald die Felder bekannt sind, in denen paperless.io die ausgefüllten
Mandatsangaben führt, wird der Abruf in `src/paperless.js` darauf umgestellt.
Dann entfällt die Texterkennung: Die Werte kommen strukturiert an, und die
Prüfhinweise verschwinden.

### Was der Zugang darf — und was nicht

Der Token trägt Rechte in einzeln geschnittenen Bereichen, sogenannten Scopes.
Welche fehlen, sagt paperless.io selbst: Eine verwehrte Anfrage nennt den
Scope, an dem sie scheitert.

```bash
node scripts/schreibrechte-pruefen.mjs
```

Am Zugang der BildungsWerkstatt (Stand September 2026, Team 14644):

| Bereich | Antwort |
|---------|---------|
| `/documents` | 200 — lesbar |
| `/templates` | 200 — lesbar |
| `/contacts` | 403, verlangt Scope `all_internal.read` |
| `/workspaces` | 403, verlangt Scope `workspace.read` |
| `/teams`, `/users`, `/folders`, `/uploads`, `/attachments` | 404 — gibt es nicht |
| `/webhooks` | 400, verlangt den Parameter `oauth_application_id` |

Drei Dinge folgen daraus.

**Der Zugang ist eng geschnitten.** Er liest Dokumente und Vorlagen, mehr
nicht. Für alles Weitere braucht es einen Token mit zusätzlichen Scopes; der
wird in den Einstellungen von paperless.io angelegt.

**Es gibt ein OAuth-Anwendungsmodell.** Dass `/webhooks` nach einer
`oauth_application_id` fragt, heißt: paperless.io kennt eingetragene
Anwendungen mit eigenen Rechten, nicht nur persönliche Tokens. Für einen
dauerhaften Betrieb ist das der sauberere Weg — die Rechte hängen dann an der
Anwendung des Vereins statt an einer Person.

**Die API prüft gegen eine hinterlegte Beschreibung.** Die Fehlermeldungen
verweisen mit Zeigern wie `#/paths/~1api~1v1~1webhooks/get` auf ein
OpenAPI-Schema. Öffentlich abrufbar ist es nicht — die naheliegenden Adressen
(`/openapi.json`, `/swagger.json`, `/api/v1/spec`) antworten mit 404 oder mit
der Weboberfläche. Die Fehlermeldungen bleiben damit die beste Auskunft
darüber, was ein Endpunkt erwartet.

Wie das Prüfskript ohne Risiko arbeitet: paperless.io prüft erst die
Anmeldung, dann den Scope, dann das Schema des Rumpfes — und legt erst danach
etwas an. Eine Anfrage mit leerem Rumpf scheitert also immer an der
Schema-Prüfung, bevor irgendetwas entsteht. Sie verrät trotzdem, ob der
Endpunkt offenstünde. Das Skript legt nichts an, versendet nichts und löscht
nichts; einen Schalter dafür hat es bewusst nicht.

## Weg 3: paperless-ngx

Sollte die BildungsWerkstatt ein eigenes Dokumentenarchiv betreiben, ist der
Client dafür fertig. Nötig sind dann:

- ein API-Token aus **Mein Profil** (Leserecht genügt)
- eine CORS-Freigabe in der `docker-compose.env`:
  `PAPERLESS_CORS_ALLOWED_HOSTS=http://localhost:8080`
- ein gemeinsamer Tag für alle Mandate
- möglichst gepflegte Custom Fields: `IBAN`, `BIC`, `Kontoinhaber`,
  `Mandatsreferenz`, `Mandatsdatum`, `Kind`, `Monatsbeitrag`

Abweichende Feldnamen stehen in `src/mandate.js` unter `STANDARD_FELDZUORDNUNG`.

## Was die Texterkennung leistet — und was nicht

An den fünf echten Mandaten aus dem Sammelscan vom 15.06.2026 gemessen:

| Angabe | Ergebnis |
|--------|----------|
| Mandate im Scan gefunden | 5 von 5 |
| Kontoinhaber\*in | 5 von 5 |
| Name des Kindes | 5 von 5 |
| Unterschriftsdatum | 5 von 5 |
| BIC | 2 von 5 |
| **IBAN** | **0 von 5** |

Die IBAN steht auf diesen Formularen in einem Kästchenfeld und ist
handschriftlich ausgefüllt. Die Texterkennung liefert dort Zeichenfolgen wie
`DE 86/5001/0513/5442/0050/+0`, bei denen Ziffern fehlen oder doppelt
erscheinen. Keine davon erfüllt die Prüfziffernrechnung, auch nach
Rekonstruktionsversuchen nicht.

**Das ist kein Mangel des Werkzeugs, sondern sein Zweck.** Eine falsch
gelesene IBAN führt zu einer Rücklastschrift bei einer unbeteiligten Person.
Deshalb wird eine IBAN, die die Prüfziffer nicht erfüllt, nie übernommen —
sie erscheint als roter Befund samt der Zeichenfolge aus dem Beleg, damit
sie von Hand nachgetragen werden kann.

Für Altbestände auf Papier heißt das: Die IBANs müssen einmal erfasst werden.
Für neue Mandate, die über paperless.io digital ausgefüllt werden, liegen die
Werte strukturiert vor — dann greift dieser Einwand nicht mehr.
