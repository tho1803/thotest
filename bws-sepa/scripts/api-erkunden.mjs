#!/usr/bin/env node
/**
 * Erkundet, was die Paperless-API mit einem gegebenen Token hergibt.
 *
 * Das Skript stellt ausschließlich lesende Anfragen (GET). Es verändert
 * nichts im Account. Es probiert der Reihe nach mehrere Anmeldeverfahren
 * und danach eine Liste plausibler Adressen durch und schreibt einen
 * Bericht, welche davon antworten und welche Felder zurückkommen.
 *
 * Aufruf:
 *   node scripts/api-erkunden.mjs                      (fragt den Token ab)
 *   PAPERLESS_TOKEN=xyz node scripts/api-erkunden.mjs
 *   node scripts/api-erkunden.mjs --basis https://api.paperless.io
 *
 * Der Token wird nicht gespeichert und nicht in den Bericht geschrieben.
 */

import { createInterface } from 'node:readline/promises';
import { writeFile } from 'node:fs/promises';
import process from 'node:process';

const argumente = process.argv.slice(2);
const wert = (name, standard) => {
  const i = argumente.indexOf(`--${name}`);
  return i >= 0 && argumente[i + 1] ? argumente[i + 1] : standard;
};

const BASIS_ADRESSEN = [
  wert('basis', 'https://api.paperless.io'),
  'https://app.paperless.io/api',
  'https://api.paperless.io/public'
];

/** Anmeldeverfahren, die bei solchen Diensten üblich sind. */
const ANMELDUNGEN = [
  { name: 'Bearer-Token', kopf: (t) => ({ Authorization: `Bearer ${t}` }) },
  { name: 'Token-Präfix', kopf: (t) => ({ Authorization: `Token ${t}` }) },
  { name: 'X-API-Key', kopf: (t) => ({ 'X-API-Key': t }) },
  { name: 'X-Api-Token', kopf: (t) => ({ 'X-Api-Token': t }) }
];

/** Rein lesende Adressen, die es bei einem Vertragsdienst geben könnte. */
const PFADE = [
  '/v1/me', '/v1/users', '/v1/account', '/v1/organizations',
  '/v1/documents', '/v1/documents?limit=1',
  '/v1/templates', '/v1/contracts', '/v1/folders', '/v1/forms',
  '/v1/fields', '/v1/signatures', '/v1/webhooks',
  '/me', '/users', '/documents', '/documents?limit=1', '/templates', '/contracts',
  '/api/v1/documents', '/api/v1/me', '/openapi.json', '/swagger.json', '/docs'
];

const ZEITGRENZE = 15000;

async function frage(adresse, kopfzeilen) {
  const abbruch = AbortSignal.timeout(ZEITGRENZE);
  try {
    const antwort = await fetch(adresse, {
      headers: { Accept: 'application/json', ...kopfzeilen },
      signal: abbruch
    });
    const typ = antwort.headers.get('content-type') ?? '';
    let auszug = '';
    let felder = [];
    if (typ.includes('json')) {
      const daten = await antwort.json();
      const kern = Array.isArray(daten) ? daten[0] : (daten?.data?.[0] ?? daten?.data ?? daten);
      felder = kern && typeof kern === 'object' ? Object.keys(kern).slice(0, 25) : [];
      auszug = JSON.stringify(daten).slice(0, 400);
    } else {
      auszug = (await antwort.text()).slice(0, 160).replace(/\s+/g, ' ');
    }
    return { status: antwort.status, typ, felder, auszug };
  } catch (fehler) {
    return { status: 0, typ: '', felder: [], auszug: `keine Antwort: ${fehler.message}` };
  }
}

async function holeToken() {
  if (process.env.PAPERLESS_TOKEN) return process.env.PAPERLESS_TOKEN.trim();
  const leser = createInterface({ input: process.stdin, output: process.stdout });
  const eingabe = await leser.question('Paperless API-Token (wird nicht gespeichert): ');
  leser.close();
  return eingabe.trim();
}

const token = await holeToken();
if (!token) {
  console.error('Ohne Token geht nichts. Abbruch.');
  process.exit(1);
}

const bericht = [];
const sage = (zeile) => { console.log(zeile); bericht.push(zeile); };

sage('Bericht: Was die Paperless-API mit diesem Zugang hergibt');
sage(`Erstellt am ${new Date().toLocaleString('de-DE')}`);
sage('Es wurden ausschließlich lesende Anfragen gestellt. Nichts wurde verändert.');
sage('');

// Schritt 1: Welches Anmeldeverfahren und welche Basisadresse greifen?
sage('== Schritt 1: Zugang finden ==');
let gefundeneBasis = null;
let gefundeneAnmeldung = null;

for (const basis of BASIS_ADRESSEN) {
  for (const anmeldung of ANMELDUNGEN) {
    const ergebnis = await frage(`${basis}/v1/me`, anmeldung.kopf(token));
    const marke = ergebnis.status === 200 ? 'GEHT' : String(ergebnis.status || '—');
    sage(`  ${basis}/v1/me  ·  ${anmeldung.name.padEnd(14)} → ${marke}`);
    if (ergebnis.status === 200) {
      gefundeneBasis = basis;
      gefundeneAnmeldung = anmeldung;
      break;
    }
  }
  if (gefundeneBasis) break;
}

if (!gefundeneBasis) {
  sage('');
  sage('  Kein Zugang über die geratenen Adressen. Das heißt nicht, dass der Token');
  sage('  falsch ist — die Basisadresse kann eine andere sein. Sie steht in der');
  sage('  API-Dokumentation, die Frau Meßing geschickt hat. Dann erneut mit:');
  sage('     node scripts/api-erkunden.mjs --basis https://DIE-RICHTIGE-ADRESSE');
  sage('');
  sage('  Zur Sicherheit werden die Adressen trotzdem einmal durchprobiert:');
  gefundeneBasis = BASIS_ADRESSEN[0];
  gefundeneAnmeldung = ANMELDUNGEN[0];
} else {
  sage('');
  sage(`  Zugang steht: ${gefundeneBasis} mit ${gefundeneAnmeldung.name}`);
}

// Schritt 2: Was ist erreichbar?
sage('');
sage('== Schritt 2: Was der Zugang erreicht ==');
const kopfzeilen = gefundeneAnmeldung.kopf(token);
const erreichbar = [];

for (const pfad of PFADE) {
  const ergebnis = await frage(`${gefundeneBasis}${pfad}`, kopfzeilen);
  const deutung = {
    200: 'erreichbar',
    401: 'Token nicht akzeptiert',
    403: 'nicht freigegeben',
    404: 'gibt es nicht',
    405: 'gibt es, aber nicht lesend'
  }[ergebnis.status] ?? (ergebnis.status ? `Status ${ergebnis.status}` : 'keine Antwort');

  sage(`  ${pfad.padEnd(26)} → ${deutung}`);
  if (ergebnis.status === 200) {
    erreichbar.push({ pfad, ...ergebnis });
    if (ergebnis.felder.length) {
      sage(`      Felder: ${ergebnis.felder.join(', ')}`);
    }
  }
}

// Schritt 3: Was bedeutet das für die Mandate?
sage('');
sage('== Schritt 3: Was das für die SEPA-Mandate heißt ==');
if (!erreichbar.length) {
  sage('  Über diesen Weg ist nichts erreichbar. Nächster Schritt: die Basisadresse');
  sage('  aus der API-Dokumentation holen und das Skript damit erneut starten.');
} else {
  sage(`  ${erreichbar.length} Adressen antworten. Für den Lastschriftlauf brauchen wir`);
  sage('  aus jedem unterschriebenen Mandat: Kontoinhaber, IBAN, BIC, Mandatsdatum');
  sage('  und den Namen des Kindes. Diese Felder sind in den obigen Antworten zu suchen:');
  for (const eintrag of erreichbar) {
    const treffer = eintrag.felder.filter((f) =>
      /iban|bic|konto|account|holder|name|date|datum|field|form|value|signed|mandat/i.test(f));
    if (treffer.length) sage(`    ${eintrag.pfad}: ${treffer.join(', ')}`);
  }
}

sage('');
sage('Ende des Berichts.');

const datei = 'paperless-api-bericht.txt';
await writeFile(datei, bericht.join('\n') + '\n', 'utf8');
console.log(`\nDer Bericht steht in ${datei} — er enthält keinen Token.`);
