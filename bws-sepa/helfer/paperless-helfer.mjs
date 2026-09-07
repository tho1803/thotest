#!/usr/bin/env node
/**
 * Vermittler zwischen der Oberfläche und paperless.io.
 *
 * Zwei Aufgaben, die der Browser allein nicht leisten kann:
 *
 * 1. paperless.io lässt Anfragen von einer lokal geöffneten Seite nicht zu
 *    (CORS). Dieser Helfer läuft außerhalb des Browsers, holt die Daten und
 *    reicht sie an die Oberfläche weiter — die spricht nur noch mit dem
 *    eigenen Rechner.
 *
 * 2. paperless.io gibt die ausgefüllten Formularwerte nicht als Felder
 *    heraus, sondern nur das fertige PDF. Anders als bei eingescannter
 *    Handschrift ist dessen Text digital und damit verlässlich lesbar.
 *    Der Helfer liest ihn aus und liefert der Oberfläche fertige Angaben.
 *
 * Aufruf:
 *     node helfer/paperless-helfer.mjs
 *
 * Danach im Browser:  http://localhost:8787
 *
 * Der Helfer ist nur auf diesem Rechner erreichbar. Der Token steht in
 * keiner Datei — er wird beim Start abgefragt und nur im Arbeitsspeicher
 * gehalten.
 */

import { createServer } from 'node:http';
import { createInterface } from 'node:readline/promises';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const WURZEL = join(dirname(fileURLToPath(import.meta.url)), '..');
const HAFEN = Number(process.env.PORT ?? 8787);
const BASIS = (process.env.PAPERLESS_BASIS ?? 'https://app.paperless.io/api/v1').replace(/\/+$/, '');

/** Der Token lebt nur in dieser Variablen, solange der Helfer läuft. */
let token = '';

/**
 * Der Suchindex. Er wird auf Platte gelegt, damit die Dokumente nicht bei
 * jeder Suche neu geladen werden müssen — und weil paperless.io selbst nur
 * Dokumentnamen durchsucht, nicht deren Inhalt.
 *
 * Die Datei enthält Bankdaten im Klartext. Sie gehört auf den Rechner des
 * Vereins und in keine Cloud; die .gitignore schließt sie aus.
 */
const INDEXDATEI = join(WURZEL, 'archiv-index.json');
let index = null;

async function frageApi(pfad, alsPdf = false) {
  const antwort = await fetch(`${BASIS}${pfad}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: alsPdf ? 'application/pdf' : 'application/json'
    },
    signal: AbortSignal.timeout(30000)
  });

  if (antwort.status === 401 || antwort.status === 403) {
    throw new Error('paperless.io nimmt den Token nicht an. Helfer neu starten und Token prüfen.');
  }
  if (!antwort.ok) throw new Error(`paperless.io antwortet mit ${antwort.status} auf ${pfad}`);
  return alsPdf ? Buffer.from(await antwort.arrayBuffer()) : antwort.json();
}

/**
 * Holt den Text aus einem PDF. Braucht pdfjs-dist; fehlt das Paket, läuft
 * alles Übrige weiter und die Oberfläche zeigt die Dokumente ohne Werte.
 */
let pdfLeser = null;
async function ladePdfLeser() {
  if (pdfLeser !== null) return pdfLeser;
  try {
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    pdfLeser = getDocument;
  } catch {
    pdfLeser = false;
    console.log('\nHinweis: pdfjs-dist ist nicht installiert — die Werte aus den');
    console.log('PDFs bleiben deshalb leer. Zu beheben mit:  npm install pdfjs-dist\n');
  }
  return pdfLeser;
}

async function pdfText(daten) {
  const getDocument = await ladePdfLeser();
  if (!getDocument) return '';

  const pdf = await getDocument({ data: new Uint8Array(daten), useSystemFonts: true }).promise;
  const zeilen = [];
  for (let s = 1; s <= pdf.numPages; s += 1) {
    const seite = await pdf.getPage(s);
    const inhalt = await seite.getTextContent();
    let letzteHoehe = null;
    let zeile = [];
    for (const stueck of inhalt.items) {
      const hoehe = Math.round(stueck.transform[5]);
      if (letzteHoehe !== null && Math.abs(hoehe - letzteHoehe) > 2) {
        zeilen.push(zeile.join('').trim());
        zeile = [];
      }
      zeile.push(stueck.str);
      letzteHoehe = hoehe;
    }
    if (zeile.length) zeilen.push(zeile.join('').trim());
  }
  return zeilen.filter(Boolean).join('\n');
}

/** Lädt eine Datei über die Ablage-Adresse einer Einreichung. */
async function ladeBlob(url) {
  const antwort = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    redirect: 'follow',
    signal: AbortSignal.timeout(60000)
  });
  if (!antwort.ok) throw new Error(`Ablage antwortet mit ${antwort.status}`);
  return Buffer.from(await antwort.arrayBuffer());
}

/**
 * Holt die Mandate und legt den PDF-Text als "content" bei — wie ein Scan.
 *
 * Entscheidend ist, welches PDF geholt wird: /documents/{id} liefert das
 * Dokument ohne die Eingaben, also die leere Vorlage. Die ausgefüllten Werte
 * stehen erst in der PDF-Datei der Einreichung. Nur die trägt IBAN, BIC,
 * Kreditinstitut und Unterschriftsdatum.
 */
async function holeMandate(nurAbgeschlossene = true) {
  const [dokumentliste, einreichungsliste] = await Promise.all([
    frageApi('/documents?limit=100'),
    frageApi('/submissions?limit=100')
  ]);

  const dokumente = dokumentliste.data ?? dokumentliste.documents ?? dokumentliste.results ?? [];
  const einreichungen = einreichungsliste.data ?? einreichungsliste.results ?? [];

  // Einreichungen sind über submittable_id dem Dokument zugeordnet.
  const jeDokument = new Map();
  for (const e of einreichungen) jeDokument.set(e.submittable_id, e);

  const passend = nurAbgeschlossene
    ? dokumente.filter((d) => d.state === 'completed')
    : dokumente;

  const ergebnis = [];
  for (const dokument of passend) {
    const einreichung = jeDokument.get(dokument.id);
    let text = '';
    let herkunft = '';

    // Reihenfolge nach Aussagekraft: die versiegelte Fassung ist die
    // endgültige, die einfache enthält dieselben Eingaben, das Dokument
    // selbst nur die Vorlage.
    const quellen = [
      ['Einreichung (versiegelt)', () => ladeBlob(einreichung?.sealed_pdf?.url)],
      ['Einreichung', () => ladeBlob(einreichung?.pdf?.url)],
      ['Dokument', () => frageApi(`/documents/${dokument.id}`, true)]
    ];

    for (const [name, holen] of quellen) {
      try {
        const roh = await holen();
        const gelesen = await pdfText(roh);
        // Eine Fassung mit Eingaben ist länger als die leere Vorlage.
        if (gelesen.length > text.length) {
          text = gelesen;
          herkunft = name;
        }
        if (name !== 'Dokument') break;
      } catch {
        /* nächste Quelle */
      }
    }

    ergebnis.push({
      id: dokument.id,
      title: dokument.name,
      state: dokument.state,
      created: dokument.completed_at ?? dokument.updated_at ?? dokument.created_at,
      vorlage: dokument.source_template?.name ?? '',
      herkunft,
      content: text,
      custom_fields: []
    });
    console.log(`  ${String(dokument.name).padEnd(20)} ${String(dokument.state).padEnd(12)} ${herkunft.padEnd(24)} ${text.length} Zeichen`);
  }
  return ergebnis;
}

const TYPEN = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.mjs': 'text/javascript; charset=utf-8'
};

/** Lädt den Index von Platte, falls vorhanden. */
async function ladeIndex() {
  if (index) return index;
  try {
    const roh = JSON.parse(await readFile(INDEXDATEI, 'utf8'));
    // Die Wortmengen werden beim Speichern zu Listen — hier zurückwandeln.
    roh.eintraege = roh.eintraege.map((e) => ({ ...e, worte: new Set(e.worte) }));
    index = roh;
    console.log(`Index geladen: ${index.eintraege.length} Dokumente`);
  } catch {
    index = null;
  }
  return index;
}

async function speichereIndex() {
  const zumSpeichern = {
    ...index,
    eintraege: index.eintraege.map((e) => ({ ...e, worte: [...e.worte] }))
  };
  await writeFile(INDEXDATEI, JSON.stringify(zumSpeichern), 'utf8');
}

const server = createServer(async (anfrage, antwort) => {
  const url = new URL(anfrage.url, `http://localhost:${HAFEN}`);

  // Bestand einlesen und Index bauen.
  if (url.pathname === '/index-bauen') {
    try {
      console.log('\nBestand wird eingelesen …');
      const dokumente = await holeMandate(false);
      const { baueIndex } = await import('../src/volltext.js');
      index = baueIndex(dokumente);
      await speichereIndex();
      const { bestandsUebersicht } = await import('../src/volltext.js');
      const uebersicht = bestandsUebersicht(index);
      antwort.writeHead(200, { 'Content-Type': TYPEN['.json'] });
      antwort.end(JSON.stringify(uebersicht));
      console.log(`Index gebaut: ${uebersicht.dokumente} Dokumente, ${uebersicht.zeichen} Zeichen`);
    } catch (fehler) {
      antwort.writeHead(502, { 'Content-Type': TYPEN['.json'] });
      antwort.end(JSON.stringify({ fehler: fehler.message }));
    }
    return;
  }

  // Im Bestand suchen.
  if (url.pathname === '/suche') {
    await ladeIndex();
    if (!index) {
      antwort.writeHead(409, { 'Content-Type': TYPEN['.json'] });
      antwort.end(JSON.stringify({ fehler: 'Noch kein Index. Erst den Bestand einlesen.' }));
      return;
    }
    const { suche, bestandsUebersicht } = await import('../src/volltext.js');
    const treffer = suche(index, url.searchParams.get('q') ?? '', {
      zustand: url.searchParams.get('zustand') ?? '',
      vorlage: url.searchParams.get('vorlage') ?? '',
      von: url.searchParams.get('von') ?? '',
      bis: url.searchParams.get('bis') ?? ''
    });
    antwort.writeHead(200, { 'Content-Type': TYPEN['.json'] });
    antwort.end(JSON.stringify({ treffer, uebersicht: bestandsUebersicht(index) }));
    return;
  }

  // Was steckt im Bestand?
  if (url.pathname === '/bestand') {
    await ladeIndex();
    const { bestandsUebersicht } = await import('../src/volltext.js');
    antwort.writeHead(200, { 'Content-Type': TYPEN['.json'] });
    antwort.end(JSON.stringify(index ? bestandsUebersicht(index) : { dokumente: 0 }));
    return;
  }

  // Die Oberfläche fragt hier nach den Mandaten.
  if (url.pathname === '/mandate') {
    try {
      const nurFertige = url.searchParams.get('alle') !== '1';
      console.log(`\nMandate werden geholt (${nurFertige ? 'nur abgeschlossene' : 'alle'}) …`);
      const mandate = await holeMandate(nurFertige);
      antwort.writeHead(200, { 'Content-Type': TYPEN['.json'] });
      antwort.end(JSON.stringify({ results: mandate }, null, 2));
      console.log(`Fertig: ${mandate.length} Dokumente an die Oberfläche geliefert.`);
    } catch (fehler) {
      antwort.writeHead(502, { 'Content-Type': TYPEN['.json'] });
      antwort.end(JSON.stringify({ fehler: fehler.message }));
      console.log(`Fehler: ${fehler.message}`);
    }
    return;
  }

  if (url.pathname === '/zustand') {
    antwort.writeHead(200, { 'Content-Type': TYPEN['.json'] });
    antwort.end(JSON.stringify({ bereit: Boolean(token), basis: BASIS }));
    return;
  }

  // Alles Übrige ist die Oberfläche selbst.
  const pfad = url.pathname === '/' ? '/index.html' : url.pathname;
  const datei = join(WURZEL, pfad.replace(/^\/+/, '').replace(/\.\./g, ''));
  try {
    const inhalt = await readFile(datei);
    const endung = pfad.slice(pfad.lastIndexOf('.'));
    antwort.writeHead(200, { 'Content-Type': TYPEN[endung] ?? 'application/octet-stream' });
    antwort.end(inhalt);
  } catch {
    antwort.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    antwort.end('Nicht gefunden');
  }
});

const leser = createInterface({ input: process.stdin, output: process.stdout });
token = (process.env.PAPERLESS_TOKEN ?? await leser.question('Paperless API-Token: ')).trim();
leser.close();

if (!token) {
  console.error('Ohne Token geht nichts. Abbruch.');
  process.exit(1);
}

server.listen(HAFEN, '127.0.0.1', () => {
  console.log('\n──────────────────────────────────────────────────────');
  console.log('  Der Helfer läuft.');
  console.log(`  Jetzt im Browser öffnen:  http://localhost:${HAFEN}`);
  console.log('──────────────────────────────────────────────────────');
  console.log('\n  Zum Beenden: Strg + C\n');
});
