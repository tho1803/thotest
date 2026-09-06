import test from 'node:test';
import assert from 'node:assert/strict';
import { pruefeIban, pruefeBic, bicPasstZuIban, formatiereIban } from '../src/iban.js';

test('erkennt die Vereins-IBAN der BildungsWerkstatt als gültig', () => {
  const ergebnis = pruefeIban('DE54 3702 0500 0001 6986 00');
  assert.equal(ergebnis.gueltig, true);
  assert.equal(ergebnis.iban, 'DE54370205000001698600');
  assert.equal(ergebnis.land, 'DE');
});

test('erkennt eine verdrehte Prüfziffer', () => {
  const ergebnis = pruefeIban('DE54 3702 0500 0001 6986 01');
  assert.equal(ergebnis.gueltig, false);
  assert.match(ergebnis.fehler, /Prüfziffer/);
});

test('erkennt eine zu kurze deutsche IBAN', () => {
  const ergebnis = pruefeIban('DE5437020500000169');
  assert.equal(ergebnis.gueltig, false);
  assert.match(ergebnis.fehler, /22 Zeichen/);
});

test('weist Länder außerhalb des SEPA-Raums ab', () => {
  assert.match(pruefeIban('US64SVBKUS6S3300958879').fehler, /SEPA-Raum/);
});

test('akzeptiert gültige IBANs anderer SEPA-Länder', () => {
  assert.equal(pruefeIban('AT611904300234573201').gueltig, true);
  assert.equal(pruefeIban('CH9300762011623852957').gueltig, true);
});

test('meldet fehlende IBAN als eigenen Fall', () => {
  assert.match(pruefeIban('').fehler, /fehlt/);
});

test('prüft BIC-Format und Länderbezug', () => {
  assert.equal(pruefeBic('BFSWDE33MUE').gueltig, true);
  assert.equal(pruefeBic('GENODEF1M04').gueltig, true);
  assert.equal(pruefeBic('BFSW').gueltig, false);
  assert.equal(pruefeBic('').gueltig, true, 'leerer BIC ist bei IBAN-only zulässig');
  assert.equal(bicPasstZuIban('BFSWDE33MUE', 'DE54370205000001698600'), true);
  assert.equal(bicPasstZuIban('BKAUATWW', 'DE54370205000001698600'), false);
});

test('formatiert für die Anzeige in Vierergruppen', () => {
  assert.equal(formatiereIban('DE54370205000001698600'), 'DE54 3702 0500 0001 6986 00');
});
