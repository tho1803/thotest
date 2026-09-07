import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PaperlessIoClient, listeAus, sammleFeldpfade, leseUeberPfad,
  schlageZuordnungVor, mandatAusFeldern, STANDARD_BASIS
} from '../src/paperless-io.js';

/** Nachbau einer Antwort, wie ein Vertragsdienst sie liefern könnte. */
const DOKUMENT = {
  id: 'doc_123',
  name: 'SEPA-Lastschriftmandat Beispiel',
  status: 'completed',
  created_at: '2026-09-01T10:00:00Z',
  signers: [{
    name: 'Anna Beispiel',
    email: 'anna@example.org',
    signed_at: '2026-09-02T08:30:00Z',
    fields: {
      kontoinhaber: 'Anna Beispiel',
      iban: 'DE02 1203 0000 0000 2020 51',
      bic: 'BYLADEM1001',
      kind: 'Lea Beispiel',
      mandatsreferenz: 'BWS_Beispiel-Lea',
      monatsbeitrag: '87,50'
    }
  }]
};

function fakeFetch(status, daten, typ = 'application/json') {
  return async () => ({
    ok: status < 400,
    status,
    headers: { get: () => typ },
    json: async () => daten,
    text: async () => JSON.stringify(daten)
  });
}

test('nutzt die Basisadresse von paperless.io und Bearer-Token', () => {
  const client = new PaperlessIoClient(undefined, 'geheim');
  assert.equal(client.basisUrl, STANDARD_BASIS);
  assert.equal(client.kopfzeilen.Authorization, 'Bearer geheim');
});

test('erklärt einen abgelehnten Token als Token- und nicht als Adressproblem', async () => {
  const client = new PaperlessIoClient(STANDARD_BASIS, 'falsch', fakeFetch(403, {}));
  await assert.rejects(() => client.pruefeVerbindung(), /Adresse stimmt, der Token nicht/);
});

test('erkennt, wenn statt Daten die Weboberfläche zurückkommt', async () => {
  const client = new PaperlessIoClient(STANDARD_BASIS, 't', fakeFetch(200, {}, 'text/html'));
  await assert.rejects(() => client.pruefeVerbindung(), /Weboberfläche/);
});

test('nennt eine falsche Adresse beim Namen', async () => {
  const client = new PaperlessIoClient(STANDARD_BASIS, 't', fakeFetch(404, {}));
  await assert.rejects(() => client.pruefeVerbindung(), /gibt es bei paperless.io nicht/);
});

test('weist auf CORS hin, wenn der Browser die Anfrage blockt', async () => {
  const client = new PaperlessIoClient(STANDARD_BASIS, 't', async () => { throw new TypeError('Failed to fetch'); });
  await assert.rejects(() => client.pruefeVerbindung(), /CORS/);
});

test('findet die Liste, wie auch immer die Antwort verpackt ist', () => {
  assert.equal(listeAus([1, 2]).length, 2);
  assert.equal(listeAus({ data: [1, 2, 3] }).length, 3);
  assert.equal(listeAus({ documents: [1] }).length, 1);
  assert.equal(listeAus({ results: [1, 2] }).length, 2);
  assert.equal(listeAus({ id: 'x' }).length, 1, 'ein einzelnes Dokument gilt als Liste mit einem Eintrag');
});

test('sammelt alle Feldpfade eines Dokuments samt Beispielwert', () => {
  const pfade = sammleFeldpfade(DOKUMENT);
  const namen = pfade.map((p) => p.pfad);
  assert.ok(namen.includes('signers.0.fields.iban'));
  assert.ok(namen.includes('signers.0.fields.kontoinhaber'));
  assert.ok(namen.includes('name'));
  const iban = pfade.find((p) => p.pfad === 'signers.0.fields.iban');
  assert.equal(iban.beispiel, 'DE02 1203 0000 0000 2020 51');
});

test('liest Werte über einen Pfad, auch durch Listen hindurch', () => {
  assert.equal(leseUeberPfad(DOKUMENT, 'signers.0.fields.bic'), 'BYLADEM1001');
  assert.equal(leseUeberPfad(DOKUMENT, 'signers.0.name'), 'Anna Beispiel');
  assert.equal(leseUeberPfad(DOKUMENT, 'gibtesnicht.tief'), '');
  assert.equal(leseUeberPfad(DOKUMENT, ''), '');
});

test('schlägt eine Feldzuordnung anhand der Feldnamen vor', () => {
  const vorschlag = schlageZuordnungVor(sammleFeldpfade(DOKUMENT));
  assert.equal(vorschlag.iban, 'signers.0.fields.iban');
  assert.equal(vorschlag.bic, 'signers.0.fields.bic');
  assert.equal(vorschlag.kontoinhaber, 'signers.0.fields.kontoinhaber');
  assert.equal(vorschlag.kind, 'signers.0.fields.kind');
  assert.equal(vorschlag.mandatsId, 'signers.0.fields.mandatsreferenz');
  assert.equal(vorschlag.betrag, 'signers.0.fields.monatsbeitrag');
});

test('baut aus Zuordnung und Dokument die Werte eines Mandats', () => {
  const zuordnung = schlageZuordnungVor(sammleFeldpfade(DOKUMENT));
  const roh = mandatAusFeldern(DOKUMENT, zuordnung);
  assert.equal(roh.iban, 'DE02120300000000202051', 'Leerzeichen werden entfernt');
  assert.equal(roh.kontoinhaber, 'Anna Beispiel');
  assert.equal(roh.kind, 'Lea Beispiel');
  assert.equal(roh.mandatsId, 'BWS_Beispiel-Lea');
});

test('kommt mit einer Zuordnung klar, die Lücken hat', () => {
  const roh = mandatAusFeldern(DOKUMENT, { iban: 'signers.0.fields.iban' });
  assert.equal(roh.iban, 'DE02120300000000202051');
  assert.equal(roh.kontoinhaber, '');
  assert.equal(roh.bic, '');
});

test('blättert durch alle Seiten', async () => {
  let aufruf = 0;
  const client = new PaperlessIoClient(STANDARD_BASIS, 't', async () => {
    aufruf += 1;
    const daten = aufruf === 1
      ? { data: Array.from({ length: 100 }, (_, i) => ({ id: i })) }
      : { data: [{ id: 100 }] };
    return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => daten };
  });
  const alle = await client.holeDokumente();
  assert.equal(alle.length, 101);
  assert.equal(aufruf, 2);
});
