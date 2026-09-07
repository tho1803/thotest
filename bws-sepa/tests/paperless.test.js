import test from 'node:test';
import assert from 'node:assert/strict';
import { PaperlessClient, ausJsonExport } from '../src/paperless.js';

/** Kleiner fetch-Ersatz, der Antworten aus einer Tabelle bedient. */
function fakeFetch(antworten, protokoll = []) {
  return async (url) => {
    protokoll.push(url);
    const eintrag = antworten.find(([muster]) => url.includes(muster));
    if (!eintrag) return { ok: false, status: 404, text: async () => 'nicht gefunden' };
    const [, daten, status = 200] = eintrag;
    return { ok: status < 400, status, json: async () => daten, text: async () => JSON.stringify(daten) };
  };
}

test('setzt den Token als Authorization-Header', () => {
  const client = new PaperlessClient('https://paperless.example/', 'geheim');
  assert.equal(client.kopfzeilen.Authorization, 'Token geheim');
  assert.equal(client.basisUrl, 'https://paperless.example', 'Schrägstrich am Ende wird entfernt');
});

test('prüft die Verbindung mit einem billigen Aufruf', async () => {
  const protokoll = [];
  const client = new PaperlessClient('https://p.example', 't', fakeFetch([['/api/documents/', { count: 512, results: [] }]], protokoll));
  const ergebnis = await client.pruefeVerbindung();
  assert.equal(ergebnis.dokumenteGesamt, 512);
  assert.match(protokoll[0], /page_size=1/);
});

test('holt alle Seiten eines Tags', async () => {
  const seite1 = { count: 3, next: 'https://p.example/api/documents/?page=2', results: [{ id: 1 }, { id: 2 }] };
  const seite2 = { count: 3, next: null, results: [{ id: 3 }] };
  const protokoll = [];
  let aufruf = 0;
  const client = new PaperlessClient('https://p.example', 't', async (url) => {
    protokoll.push(url);
    aufruf += 1;
    const daten = aufruf === 1 ? seite1 : seite2;
    return { ok: true, status: 200, json: async () => daten, text: async () => '' };
  });
  const dokumente = await client.holeDokumente({ tagId: 12 });
  assert.equal(dokumente.length, 3);
  assert.match(protokoll[0], /tags__id__all=12/);
  assert.match(protokoll[1], /page=2/);
});

test('meldet einen abgelehnten Token verständlich', async () => {
  const client = new PaperlessClient('https://p.example', 'falsch', fakeFetch([['/api/', { detail: 'x' }, 401]]));
  await assert.rejects(() => client.pruefeVerbindung(), /Token/);
});

test('erklärt einen Netzfehler mit dem CORS-Hinweis', async () => {
  const client = new PaperlessClient('https://p.example', 't', async () => { throw new TypeError('Failed to fetch'); });
  await assert.rejects(() => client.pruefeVerbindung(), /CORS/);
});

test('baut den Link auf das Dokument in Paperless', () => {
  const client = new PaperlessClient('https://p.example', 't');
  assert.equal(client.dokumentUrl(42), 'https://p.example/documents/42/details');
});

test('liest auch einen JSON-Export ohne Netzzugriff', () => {
  assert.equal(ausJsonExport('{"results":[{"id":1}]}').length, 1);
  assert.equal(ausJsonExport([{ id: 1 }, { id: 2 }]).length, 2);
  assert.throws(() => ausJsonExport('{"foo":1}'), /Dokumentliste/);
});

test('liest Felddefinitionen aus derselben Exportdatei mit', async () => {
  const { felddefinitionenAusJson } = await import('../src/paperless.js');
  assert.equal(felddefinitionenAusJson('{"results":[],"custom_fields_definition":[{"id":1,"name":"IBAN"}]}').length, 1);
  assert.equal(felddefinitionenAusJson({ results: [] }).length, 0);
});
