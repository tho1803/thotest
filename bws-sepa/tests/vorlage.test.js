import test from 'node:test';
import assert from 'node:assert/strict';
import { fuelleVorlage } from '../src/vorlage.js';

const MANDAT = { kind: 'Lea Beispiel', kontoinhaber: 'Anna Beispiel', mandatsId: 'BWS-2026-0043' };

test('setzt alle Platzhalter aus Mandat und Termin', () => {
  const text = fuelleVorlage('Elternbeitrag {monat} {jahr} {kind}', MANDAT, '2026-10-01');
  assert.equal(text, 'Elternbeitrag Oktober 2026 Lea Beispiel');
});

test('nimmt den Monat aus dem Fälligkeitstermin, nicht aus dem Tagesdatum', () => {
  assert.match(fuelleVorlage('{monat} {jahr}', MANDAT, '2026-01-31'), /^Januar 2026$/);
  assert.match(fuelleVorlage('{monat}', MANDAT, '2026-12-01'), /^Dezember$/);
});

test('lässt fehlende Angaben weg, ohne doppelte Leerzeichen zu hinterlassen', () => {
  const text = fuelleVorlage('Beitrag {monat} {kind}', { kontoinhaber: 'X' }, '2026-05-04');
  assert.equal(text, 'Beitrag Mai');
});

test('kann auf Name und Mandatsreferenz zurückfallen', () => {
  assert.equal(fuelleVorlage('{name} / {mandat}', MANDAT, '2026-05-04'), 'Anna Beispiel / BWS-2026-0043');
});
