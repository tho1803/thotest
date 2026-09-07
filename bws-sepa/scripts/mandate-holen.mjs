#!/usr/bin/env node
/**
 * Holt die Mandate aus paperless.io und legt sie als Datei ab.
 *
 * Warum dieser Umweg? Der Browser lässt eine lokal geöffnete Seite nicht auf
 * paperless.io zugreifen (CORS) — das ist eine Sperre des Browsers, kein
 * Fehler des Tokens. Dieses Skript läuft außerhalb des Browsers und kennt
 * diese Sperre nicht.
 *
 *   node scripts/mandate-holen.mjs
 *   node scripts/mandate-holen.mjs --basis https://app.paperless.io/api
 *   PAPERLESS_TOKEN=xyz node scripts/mandate-holen.mjs
 *
 * Ergebnis: mandate.json — diese Datei in der Oberfläche unter
 * "Datei — Scan oder Export" öffnen.
 *
 * Die Datei enthält Bankdaten. Nach dem Einlesen löschen.
 */

import { createInterface } from 'node:readline/promises';
import { writeFile } from 'node:fs/promises';
import process from 'node:process';

const argumente = process.argv.slice(2);
const wert = (name, standard) => {
  const i = argumente.indexOf(`--${name}`);
  return i >= 0 && argumente[i + 1] ? argumente[i + 1] : standard;
};

const ZIEL = wert('ziel', 'mandate.json');
const ZEITGRENZE = 20000;

/** Team-Kennung aus der Adresse app.paperless.io/14644/documents */
const TEAM = wert('team', '14644');

/**
 * Mögliche Adressen der Dokumentenliste. Die Weboberfläche führt die
 * Dokumente unter app.paperless.io/<team>/documents; wo die API sie führt,
 * steht in der Dokumentation des Anbieters. Statt zu raten, probiert das
 * Skript die naheliegenden Formen durch und nimmt die erste, die Daten
 * liefert. Mit --basis lässt sich eine Adresse fest vorgeben.
 */
function adressKandidaten() {
  const vorgabe = wert('basis', '');
  if (vorgabe) return [`${vorgabe.replace(/\/+$/, '')}/v1/documents`];
  return [
    `https://app.paperless.io/api/v1/teams/${TEAM}/documents`,
    `https://app.paperless.io/api/${TEAM}/v1/documents`,
    `https://app.paperless.io/api/v1/documents`,
    `https://app.paperless.io/api/${TEAM}/documents`,
    `https://api.paperless.io/v1/teams/${TEAM}/documents`,
    `https://api.paperless.io/v1/documents`
  ];
}

async function holeToken() {
  if (process.env.PAPERLESS_TOKEN) return process.env.PAPERLESS_TOKEN.trim();
  const leser = createInterface({ input: process.stdin, output: process.stdout });
  const eingabe = await leser.question('Paperless API-Token (wird nicht gespeichert): ');
  leser.close();
  return eingabe.trim();
}

/** Eine Anfrage samt Deutung des Ergebnisses. */
async function versuche(adresse, token) {
  let antwort;
  try {
    antwort = await fetch(adresse, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(ZEITGRENZE)
    });
  } catch (fehler) {
    return { lage: 'stumm', text: `keine Antwort (${fehler.message})` };
  }

  const typ = antwort.headers.get('content-type') ?? '';
  if (antwort.status === 200 && typ.includes('json')) {
    return { lage: 'gut', daten: await antwort.json() };
  }
  if (antwort.status === 200) {
    return { lage: 'weboberflaeche', text: 'Weboberfläche statt Daten' };
  }
  if (antwort.status === 401 || antwort.status === 403) {
    return { lage: 'tokenAbgelehnt', text: `Token abgelehnt (${antwort.status})` };
  }
  if (antwort.status === 404) return { lage: 'gibtsNicht', text: 'gibt es nicht (404)' };
  return { lage: 'sonst', text: `Antwort ${antwort.status}` };
}

/** Sucht die Adresse, unter der die Dokumente tatsächlich liegen. */
async function findeAdresse(token) {
  const abgelehnt = [];
  for (const adresse of adressKandidaten()) {
    const ergebnis = await versuche(`${adresse}?limit=1`, token);
    console.log(`  ${adresse.padEnd(58)} ${ergebnis.lage === 'gut' ? 'GEHT' : ergebnis.text}`);
    if (ergebnis.lage === 'gut') return { adresse, erste: ergebnis.daten };
    if (ergebnis.lage === 'tokenAbgelehnt') abgelehnt.push(adresse);
  }

  if (abgelehnt.length) {
    throw new Error(
      'Diese Adressen gibt es, aber der Token wird nicht angenommen:\n' +
      abgelehnt.map((a) => `    ${a}`).join('\n') +
      '\n\n  Zu prüfen:\n' +
      '    - Ist der Token vollständig kopiert, ohne Leerzeichen davor oder dahinter?\n' +
      '    - Ist er für den API-Zugriff freigeschaltet? Das muss bei manchen Diensten\n' +
      '      eigens erlaubt werden.\n' +
      `    - Gehört er zum Konto mit der Kennung ${TEAM}?`
    );
  }
  throw new Error(
    'Unter keiner der geprüften Adressen liegt eine API.\n' +
    '  Die richtige Adresse steht in der API-Dokumentation von paperless.io als\n' +
    '  "Base URL". Dann erneut mit:\n' +
    '    node scripts/mandate-holen.mjs --basis https://DIE-ADRESSE'
  );
}

async function hole(adresse, token) {
  const ergebnis = await versuche(adresse, token);
  if (ergebnis.lage !== 'gut') throw new Error(ergebnis.text);
  return ergebnis.daten;
}

/** Findet die Liste, wie auch immer die Antwort sie verpackt. */
function listeAus(daten) {
  if (Array.isArray(daten)) return daten;
  for (const schluessel of ['data', 'documents', 'results', 'items', 'records']) {
    if (Array.isArray(daten?.[schluessel])) return daten[schluessel];
  }
  return daten && typeof daten === 'object' ? [daten] : [];
}

const token = await holeToken();
if (!token) {
  console.error('Ohne Token geht nichts. Abbruch.');
  process.exit(1);
}

console.log('Suche die Adresse der Dokumente …');

let dokumentAdresse;
try {
  ({ adresse: dokumentAdresse } = await findeAdresse(token));
  console.log(`\nGefunden: ${dokumentAdresse}\n`);
} catch (fehler) {
  console.error(`\n${fehler.message}`);
  process.exit(1);
}

const alle = [];
let seite = 1;

try {
  for (;;) {
    const daten = await hole(`${dokumentAdresse}?limit=100&page=${seite}`, token);
    const stapel = listeAus(daten);
    alle.push(...stapel);
    console.log(`  Seite ${seite}: ${stapel.length} Dokumente (zusammen ${alle.length})`);
    if (stapel.length < 100) break;
    seite += 1;
    if (seite > 200) break;
  }
} catch (fehler) {
  console.error(`\n${fehler.message}`);
  process.exit(1);
}

if (!alle.length) {
  console.log('\nEs kam kein Dokument zurück. Liegt in paperless.io schon ein ausgefülltes Mandat?');
  process.exit(0);
}

await writeFile(ZIEL, JSON.stringify({ results: alle }, null, 2), 'utf8');

console.log(`\n${alle.length} Dokumente in ${ZIEL} geschrieben.`);
console.log('\nSo geht es weiter:');
console.log('  1. Die Oberfläche öffnen (bws-sepa-einzeldatei.html doppelklicken)');
console.log('  2. Oben "Datei — Scan oder Export" wählen');
console.log(`  3. "Datei öffnen" klicken und ${ZIEL} auswählen`);
console.log('\nAchtung: Diese Datei enthält Bankdaten. Nach dem Einlesen löschen.');

// Zeigt, welche Felder in den Dokumenten stecken — hilft beim Zuordnen.
const felder = new Set();
const sammle = (objekt, praefix = '', tiefe = 0) => {
  if (tiefe > 5 || objekt === null || objekt === undefined) return;
  if (Array.isArray(objekt)) return sammle(objekt[0], `${praefix}.0`, tiefe + 1);
  if (typeof objekt === 'object') {
    for (const [k, v] of Object.entries(objekt)) sammle(v, praefix ? `${praefix}.${k}` : k, tiefe + 1);
    return;
  }
  if (praefix) felder.add(praefix);
};
sammle(alle[0]);
console.log(`\nFelder im ersten Dokument (${felder.size}):`);
for (const feld of [...felder].sort()) console.log(`  ${feld}`);
