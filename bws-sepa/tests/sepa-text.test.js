import test from 'node:test';
import assert from 'node:assert/strict';
import { sepaText, feld, verwendungszweckZeilen } from '../src/sepa-text.js';

test('schreibt Umlaute und Sonderzeichen SEPA-konform um', () => {
  assert.equal(sepaText('Müller & Söhne'), 'Mueller und Soehne');
  assert.equal(sepaText('Groß-Ostheim'), 'Gross-Ostheim');
  assert.equal(sepaText('„Beitrag“ 2026'), 'Beitrag 2026');
  assert.equal(sepaText('Beitrag 12,50 €'), 'Beitrag 12,50 EUR');
});

test('lässt nur Zeichen des SEPA-Basiszeichensatzes übrig', () => {
  const ausgabe = sepaText('Test#*[]{}|~^`@!$%');
  assert.match(ausgabe, /^[A-Za-z0-9/?:().,'+\- ]*$/);
});

test('das Ergebnis ist reines ASCII', () => {
  const ausgabe = sepaText('Zoë Ångström – Beitrag für Kübra');
  // eslint-disable-next-line no-control-regex
  assert.match(ausgabe, /^[\x20-\x7E]*$/);
});

test('kürzt auf die Feldlänge, ohne mitten im Wort zu trennen', () => {
  assert.equal(feld('Katrin Ikeni-Wali Vorsitzende des Vereins', 20).length <= 20, true);
  assert.equal(feld('kurz', 35), 'kurz');
});

test('zerlegt den Verwendungszweck in Zeilen à 27 Zeichen', () => {
  const zeilen = verwendungszweckZeilen('Elternbeitrag Ganztag September 2026 Kind Lea Musterfrau');
  assert.ok(zeilen.length >= 2);
  for (const zeile of zeilen) assert.ok(zeile.length <= 27, `zu lang: ${zeile}`);
  assert.equal(zeilen.join(' ').includes('Elternbeitrag'), true);
});

test('bricht auch ein überlanges Einzelwort um', () => {
  const zeilen = verwendungszweckZeilen('A'.repeat(60));
  assert.equal(zeilen.length, 3);
  assert.equal(zeilen[0].length, 27);
});

test('liefert höchstens 14 Zeilen', () => {
  const zeilen = verwendungszweckZeilen(Array.from({ length: 100 }, () => 'Beitragswort').join(' '));
  assert.equal(zeilen.length, 14);
});
