import test from 'node:test';
import assert from 'node:assert/strict';
import { baueIndex, suche, fundstellen, zerlege, bestandsUebersicht } from '../src/volltext.js';

const BESTAND = [
  { id: 1, title: 'sepa', state: 'completed', vorlage: 'SEPA Mandat', created: '2026-09-06T21:02:00Z',
    content: 'SEPA-Basislastschrift-Mandat\nIBAN\nDE02120300000000202051\nKreditinstitut\nDEUTSCHE KREDITBANK BERLIN' },
  { id: 2, title: 'Muster', state: 'completed', vorlage: 'Vertraulichkeitsvereinbarung', created: '2026-09-06T20:35:00Z',
    content: 'Vertraulichkeitsvereinbarung zwischen Mustermann GmbH und Anna Beispiel' },
  { id: 3, title: 'Entwurf', state: 'draft', vorlage: 'SEPA Mandat', created: '2026-09-05T10:00:00Z',
    content: 'SEPA-Mandat ohne ausgefüllte Bankverbindung' }
];

test('findet Begriffe, die nur im Inhalt stehen — nicht im Titel', () => {
  // Genau das, woran die Suche von paperless.io scheitert.
  const index = baueIndex(BESTAND);
  const treffer = suche(index, 'Kreditbank');
  assert.equal(treffer.length, 1);
  assert.equal(treffer[0].titel, 'sepa');
  assert.ok(treffer[0].anzahl > 0);
});

test('findet auch über den Titel', () => {
  assert.equal(suche(baueIndex(BESTAND), 'Muster').length, 1);
});

test('mehrere Begriffe müssen alle vorkommen', () => {
  const index = baueIndex(BESTAND);
  assert.equal(suche(index, 'Kreditbank Berlin').length, 1);
  assert.equal(suche(index, 'Kreditbank Vertraulichkeit').length, 0);
});

test('Anführungszeichen suchen eine zusammenhängende Wendung', () => {
  const index = baueIndex(BESTAND);
  assert.equal(suche(index, '"DEUTSCHE KREDITBANK"').length, 1);
  assert.equal(suche(index, '"KREDITBANK DEUTSCHE"').length, 0);
});

test('filtert nach Zustand, Vorlage und Zeitraum', () => {
  const index = baueIndex(BESTAND);
  assert.equal(suche(index, '', { zustand: 'completed' }).length, 2);
  assert.equal(suche(index, '', { zustand: 'draft' }).length, 1);
  assert.equal(suche(index, '', { vorlage: 'SEPA Mandat' }).length, 2);
  assert.equal(suche(index, '', { von: '2026-09-06' }).length, 2);
  assert.equal(suche(index, '', { bis: '2026-09-05' }).length, 1);
});

test('eine leere Anfrage zeigt den ganzen Bestand', () => {
  assert.equal(suche(baueIndex(BESTAND), '').length, 3);
});

test('liefert Fundstellen mit Umfeld', () => {
  const stellen = fundstellen('Kreditinstitut DEUTSCHE KREDITBANK BERLIN, Ort München', 'kreditbank');
  assert.equal(stellen.length, 1);
  assert.equal(stellen[0].wort, 'KREDITBANK');
  assert.ok(stellen[0].vor.includes('DEUTSCHE'));
  assert.ok(stellen[0].nach.includes('BERLIN'));
});

test('gibt den Volltext nicht im Suchergebnis zurück', () => {
  const treffer = suche(baueIndex(BESTAND), 'Kreditbank')[0];
  assert.equal(treffer.text, undefined, 'nur Fundstellen, nicht der ganze Text');
});

test('zerlegt Text in Suchbegriffe und behält Umlaute', () => {
  assert.deepEqual(zerlege('München, Zürich!'), ['münchen', 'zürich']);
  assert.deepEqual(zerlege('a bc'), ['bc'], 'einzelne Buchstaben zählen nicht');
});

test('fasst zusammen, was im Bestand steckt', () => {
  const u = bestandsUebersicht(baueIndex(BESTAND));
  assert.equal(u.dokumente, 3);
  assert.ok(u.zeichen > 0);
  assert.deepEqual(u.zustaende, [['completed', 2], ['draft', 1]]);
  assert.equal(u.vorlagen[0][0], 'SEPA Mandat');
});
