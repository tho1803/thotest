#!/usr/bin/env node
/**
 * Prüft, was der Paperless-Zugang über das Lesen hinaus darf.
 *
 * Hintergrund: Für den Beitragseinzug wäre zweierlei nützlich — Mandate aus
 * einer Liste heraus massenhaft anstoßen, und den Altbestand an Mandaten
 * hochladen, damit die zehnjährige Aufbewahrung an einer Stelle liegt.
 * Beides setzt Schreibrechte voraus. Ob der Zugang die hat, sagt die
 * Weboberfläche nicht; die API sagt es, wenn man sie richtig fragt.
 *
 * Der Kniff: paperless.io prüft in dieser Reihenfolge — erst die Anmeldung,
 * dann den Scope des Tokens, dann das Schema des Rumpfes, und erst danach
 * legt es etwas an. Eine Anfrage mit leerem Rumpf scheitert also immer an
 * der Schema-Prüfung, bevor irgendetwas entsteht. Genau daran lässt sich
 * ablesen, ob der Endpunkt offenstünde:
 *
 *   403 mit Scope-Nennung  → Endpunkt gibt es, der Token darf nicht
 *   400 Schema-Fehler      → Endpunkt gibt es, der Token dürfte
 *   404                    → Endpunkt gibt es nicht
 *
 * Aufruf:
 *   node scripts/schreibrechte-pruefen.mjs                    Stufe 1 und 2
 *   PAPERLESS_TOKEN=xyz node scripts/schreibrechte-pruefen.mjs
 *   node scripts/schreibrechte-pruefen.mjs --nur-lesen        nur Stufe 1
 *
 * Stufe 1 stellt ausschließlich GET-Anfragen.
 * Stufe 2 stellt POST-Anfragen mit leerem Rumpf. Die können nichts anlegen
 * und lösen keinen Versand aus — aber sie sind Schreibanfragen, deshalb
 * stehen sie hier getrennt und werden vorher angekündigt.
 *
 * Was dieses Skript NICHT tut: ein Dokument anlegen, versenden, ändern oder
 * löschen. Dafür gibt es hier bewusst keinen Schalter.
 *
 * Der Token wird nicht gespeichert und steht nicht im Bericht.
 */

import { createInterface } from 'node:readline/promises';
import process from 'node:process';

const argumente = process.argv.slice(2);
const nurLesen = argumente.includes('--nur-lesen');
const BASIS = 'https://app.paperless.io/api/v1';

async function tokenBesorgen() {
  if (process.env.PAPERLESS_TOKEN) return process.env.PAPERLESS_TOKEN.trim();
  const frage = createInterface({ input: process.stdin, output: process.stdout });
  const eingabe = await frage.question('Paperless-Token: ');
  frage.close();
  return eingabe.trim();
}

async function ruf(token, methode, pfad, koerper) {
  try {
    const antwort = await fetch(BASIS + pfad, {
      method: methode,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...(koerper !== undefined ? { 'Content-Type': 'application/json' } : {})
      },
      body: koerper !== undefined ? JSON.stringify(koerper) : undefined,
      signal: AbortSignal.timeout(15000)
    });
    const typ = antwort.headers.get('content-type') ?? '';
    const roh = await antwort.text();
    let json = null;
    if (typ.includes('json')) { try { json = JSON.parse(roh); } catch { /* bleibt null */ } }
    return { status: antwort.status, json, roh };
  } catch (fehler) {
    return { status: 0, json: null, roh: String(fehler.message) };
  }
}

/** Der Scope steht in Anführungszeichen in der Fehlermeldung. */
function scopeAus(antwort) {
  return antwort.json?.detail?.match(/scope "([^"]+)"/)?.[1] ?? null;
}

function deuten(antwort) {
  if (antwort.status === 0) return { zeichen: '···', text: `nicht erreichbar: ${antwort.roh}` };
  if (antwort.status === 404) return { zeichen: '—', text: 'gibt es nicht' };
  if (antwort.status === 405) return { zeichen: '—', text: 'Methode nicht vorgesehen' };

  const scope = scopeAus(antwort);
  if (scope) return { zeichen: 'NEIN', text: `Endpunkt gibt es · Token fehlt der Scope ${scope}`, scope };

  if (antwort.json?.type?.includes('InvalidSchema')) {
    const fehlend = (antwort.json.detail ?? '').replace(/^#\/paths\/\S+\s*/, '');
    return { zeichen: 'JA', text: `Token dürfte · verlangt: ${fehlend}` };
  }
  if (antwort.status === 401) return { zeichen: 'NEIN', text: 'Token gilt nicht (mehr)' };
  if (antwort.status === 403) return { zeichen: 'NEIN', text: `verwehrt: ${antwort.json?.detail ?? antwort.json?.title ?? ''}` };
  if (antwort.status >= 200 && antwort.status < 300) return { zeichen: 'JA', text: 'antwortet' };
  return { zeichen: String(antwort.status), text: (antwort.json ? JSON.stringify(antwort.json) : antwort.roh).slice(0, 120).replace(/\s+/g, ' ') };
}

function zeile(spalte, deutung) {
  console.log(`  ${spalte.padEnd(34)} ${deutung.zeichen.padEnd(6)} ${deutung.text}`);
}

/** Stufe 1: rein lesend. Welche Bereiche stehen offen, welche nicht? */
const LESEN = [
  ['Dokumente', '/documents'],
  ['Vorlagen', '/templates'],
  ['Kontakte', '/contacts'],
  ['Arbeitsbereiche', '/workspaces'],
  ['Webhooks', '/webhooks']
];

/** Stufe 2: Schreibanfragen mit leerem Rumpf. Legen nichts an. */
const SCHREIBEN = [
  ['Dokument anlegen', 'POST', '/documents'],
  ['Vorlage anlegen', 'POST', '/templates'],
  ['Kontakt anlegen', 'POST', '/contacts'],
  ['Webhook einrichten', 'POST', '/webhooks'],
  ['Datei hochladen', 'POST', '/files'],
  ['Einreichung anstoßen', 'POST', '/submissions']
];

const token = await tokenBesorgen();
if (!token) {
  console.error('Ohne Token geht es nicht.');
  process.exit(1);
}

const scopes = new Set();

console.log('\nStufe 1 — was der Zugang lesen darf (nur GET)\n');
for (const [name, pfad] of LESEN) {
  const deutung = deuten(await ruf(token, 'GET', pfad));
  if (deutung.scope) scopes.add(deutung.scope);
  zeile(name, deutung);
}

if (!nurLesen) {
  console.log('\nStufe 2 — was der Zugang schreiben dürfte');
  console.log('  Leerer Rumpf: die Schema-Prüfung greift, bevor etwas entsteht.');
  console.log('  Es wird nichts angelegt und nichts versendet.\n');
  for (const [name, methode, pfad] of SCHREIBEN) {
    const deutung = deuten(await ruf(token, methode, pfad, {}));
    if (deutung.scope) scopes.add(deutung.scope);
    zeile(name, deutung);
  }
}

if (scopes.size) {
  console.log(`\nScopes, die der Zugang nicht hat: ${[...scopes].sort().join(', ')}`);
  console.log('Ein Token mit weiteren Scopes wird in den Einstellungen von paperless.io angelegt.');
} else {
  console.log('\nKein Scope wurde bemängelt.');
}
console.log();
