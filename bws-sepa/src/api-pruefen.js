/**
 * Prüft im Browser, was ein Paperless-Token erreicht.
 *
 * Dieselbe Sache wie scripts/api-erkunden.mjs, aber ohne Terminal. Es werden
 * ausschließlich GET-Anfragen gestellt.
 */

const $ = (id) => document.getElementById(id);

/** Rein lesende Adressen, die es bei einem Vertragsdienst geben könnte. */
const PFADE = [
  '/v1/me', '/v1/users', '/v1/account', '/v1/teams',
  '/v1/documents', '/v1/documents?limit=1',
  '/v1/templates', '/v1/contracts', '/v1/folders', '/v1/forms', '/v1/fields',
  '/v1/signatures', '/v1/webhooks'
];

const DEUTUNGEN = {
  200: { text: 'erreichbar', klasse: 'gut', gruppe: 'offen' },
  401: { text: 'Token wird nicht angenommen', klasse: 'pruefen', gruppe: 'gesperrt' },
  403: { text: 'Adresse gibt es, dieser Zugang darf sie nicht', klasse: 'pruefen', gruppe: 'gesperrt' },
  404: { text: 'gibt es nicht', klasse: 'fehler', gruppe: 'weg' },
  405: { text: 'gibt es, aber nicht zum Lesen', klasse: 'pruefen', gruppe: 'gesperrt' }
};

let bericht = [];

function meldung(art, text) {
  $('meldung').innerHTML = `<div class="hinweis ${art}">${text}</div>`;
}

/** Sammelt die Feldnamen einer Antwort, damit sichtbar wird, was zurückkommt. */
function felderAus(daten) {
  const kern = Array.isArray(daten)
    ? daten[0]
    : (daten?.data?.[0] ?? daten?.data ?? daten?.documents?.[0] ?? daten);
  if (!kern || typeof kern !== 'object') return [];
  return Object.keys(kern).slice(0, 12);
}

/** Wie lange auf eine Antwort gewartet wird, bevor die Adresse als stumm gilt. */
const ZEITGRENZE = 8000;

async function frage(adresse, token) {
  try {
    const antwort = await fetch(adresse, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      // Ohne Zeitgrenze bliebe die Prüfung bei einer stummen Adresse hängen.
      signal: AbortSignal.timeout(ZEITGRENZE)
    });
    const typ = antwort.headers.get('content-type') ?? '';
    // Unbekannte Adressen liefern bei paperless.io die Weboberfläche mit
    // Status 200 aus — nur eine JSON-Antwort ist ein echter Treffer.
    if (antwort.status === 200 && !typ.includes('json')) {
      return { status: 200, istApi: false, felder: [] };
    }
    const daten = typ.includes('json') ? await antwort.json() : null;
    return { status: antwort.status, istApi: typ.includes('json'), felder: daten ? felderAus(daten) : [] };
  } catch (fehler) {
    const abgelaufen = fehler.name === 'TimeoutError' || fehler.name === 'AbortError';
    return { status: 0, istApi: false, felder: [], abgelaufen, fehler: fehler.message };
  }
}

async function pruefen() {
  const basis = $('basis').value.trim().replace(/\/+$/, '');
  const token = $('token').value.trim();
  if (!basis || !token) {
    meldung('warnung', 'Adresse und Token werden beide gebraucht.');
    return;
  }

  $('pruefenKnopf').disabled = true;
  $('ergebnisse').innerHTML = '';
  $('ergebnisKarte').classList.remove('versteckt');
  bericht = [`Zugangsprüfung paperless.io — ${new Date().toLocaleString('de-DE')}`,
             `Basisadresse: ${basis}`, 'Nur lesende Anfragen. Nichts wurde verändert.', ''];

  const zaehler = { offen: 0, gesperrt: 0, weg: 0 };
  let netzfehler = 0;

  for (const pfad of PFADE) {
    meldung('info', `Wird geprüft: ${pfad} …`);
    const ergebnis = await frage(`${basis}${pfad}`, token);

    let deutung;
    if (ergebnis.status === 0) {
      deutung = ergebnis.abgelaufen
        ? { text: 'keine Antwort binnen 8 Sekunden', klasse: 'fehler', gruppe: 'weg' }
        : { text: 'Browser hat die Anfrage blockiert', klasse: 'fehler', gruppe: 'weg' };
      netzfehler += 1;
    } else if (ergebnis.status === 200 && !ergebnis.istApi) {
      deutung = { text: 'Weboberfläche statt Daten — keine API-Adresse', klasse: 'fehler', gruppe: 'weg' };
    } else {
      deutung = DEUTUNGEN[ergebnis.status]
        ?? { text: `Antwort ${ergebnis.status}`, klasse: 'pruefen', gruppe: 'gesperrt' };
    }
    zaehler[deutung.gruppe] += 1;

    const zeile = document.createElement('tr');
    zeile.innerHTML = `
      <td class="mono">${pfad}</td>
      <td>${ergebnis.status || '—'}</td>
      <td><span class="marke ${deutung.klasse}">${deutung.text}</span></td>
      <td class="mono" style="font-size:.78rem">${ergebnis.felder.join(', ')}</td>`;
    $('ergebnisse').appendChild(zeile);

    bericht.push(`${pfad.padEnd(26)} ${String(ergebnis.status).padEnd(4)} ${deutung.text}`);
    if (ergebnis.felder.length) bericht.push(`    Felder: ${ergebnis.felder.join(', ')}`);
  }

  $('zahlOffen').textContent = zaehler.offen;
  $('zahlGesperrt').textContent = zaehler.gesperrt;
  $('zahlWeg').textContent = zaehler.weg;
  $('pruefenKnopf').disabled = false;
  $('berichtKnopf').disabled = false;

  deute(zaehler, netzfehler, basis);
}

/** Sagt in Klartext, was aus dem Ergebnis folgt. */
function deute(zaehler, netzfehler, basis) {
  const karte = $('deutungKarte');
  const feld = $('deutung');
  karte.classList.remove('versteckt');

  if (netzfehler === PFADE.length) {
    feld.innerHTML = `
      <div class="hinweis warnung">
        <strong>Der Browser hat jede Anfrage blockiert.</strong>
        Das sagt nichts über den Token — es heißt, dass paperless.io Anfragen von dieser
        Seite nicht zulässt (CORS). Das ist bei Diensten dieser Art der Normalfall.
      </div>
      <p><strong>Zwei Wege führen weiter:</strong></p>
      <ol>
        <li>paperless.io bitten, die Adresse <code>http://localhost:8080</code> als Aufrufer
            zuzulassen. Frau Meßing kann das an die Technik weitergeben.</li>
        <li>Oder die Prüfung im Terminal laufen lassen — dort gibt es keine solche Sperre:
            <br><code>node scripts/api-erkunden.mjs</code></li>
      </ol>`;
    meldung('warnung', 'Alle Anfragen wurden vom Browser blockiert — siehe unten.');
    return;
  }

  if (zaehler.offen > 0) {
    feld.innerHTML = `
      <div class="hinweis gut">
        <strong>Der Zugang steht.</strong> ${zaehler.offen} Adressen antworten mit Daten.
      </div>
      <p>Nächster Schritt: In der Spalte „Felder" steht, was zurückkommt. Auf der
      <a href="index.html">Lastschriften-Seite</a> werden diese Felder einmal zugeordnet
      — welches ist die IBAN, welches der Kontoinhaber und so weiter. Danach entsteht die
      windata-Datei auf Knopfdruck.</p>`;
    meldung('gut', `${zaehler.offen} Adressen sind erreichbar.`);
    return;
  }

  if (zaehler.gesperrt > 0) {
    feld.innerHTML = `
      <div class="hinweis warnung">
        <strong>Die Adresse stimmt, der Token nicht.</strong>
        ${zaehler.gesperrt} Adressen antworten mit 401 oder 403 — es gibt sie also,
        aber dieser Zugang darf sie nicht lesen.
      </div>
      <p>Zu prüfen ist:</p>
      <ul>
        <li>Ist der Token vollständig kopiert, ohne Leerzeichen am Anfang oder Ende?</li>
        <li>Ist er für den API-Zugriff freigeschaltet? Bei manchen Diensten muss das
            eigens erlaubt werden.</li>
        <li>Gehört er zum richtigen Konto (Team 14644)?</li>
      </ul>`;
    meldung('warnung', 'Adresse gefunden, aber der Token wird nicht angenommen.');
    return;
  }

  feld.innerHTML = `
    <div class="hinweis fehler">
      <strong>Unter <code>${basis}</code> antwortet keine API.</strong>
      Alle Adressen melden „gibt es nicht".
    </div>
    <p>Dann ist die Basisadresse eine andere. Sie steht in der API-Dokumentation von
    paperless.io als „Base URL". Diese oben eintragen und erneut prüfen.</p>`;
  meldung('fehler', 'Keine API unter dieser Adresse.');
}

document.addEventListener('DOMContentLoaded', () => {
  $('pruefenKnopf').addEventListener('click', pruefen);
  $('berichtKnopf').addEventListener('click', async () => {
    const text = bericht.join('\n');
    try {
      await navigator.clipboard.writeText(text);
      meldung('gut', 'Der Bericht liegt in der Zwischenablage — er enthält keinen Token.');
    } catch {
      meldung('info', `<strong>Bericht zum Kopieren:</strong><pre class="mono" style="white-space:pre-wrap;font-size:.75rem">${text}</pre>`);
    }
  });
});
