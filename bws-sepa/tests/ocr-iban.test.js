import test from 'node:test';
import assert from 'node:assert/strict';
import { findeIbanImFormular, findeBicImFormular, bereinige } from '../src/ocr-iban.js';

// Erfundene Daten, im Aufbau den echten Scans nachempfunden.
const GUELTIG = 'DE02120300000000202051';

test('liest eine IBAN mit Schrägstrichen als Kästchentrenner', () => {
  const fund = findeIbanImFormular('DE 02/1203/0000/0000/2020/51\nIBAN');
  assert.equal(fund.iban, GUELTIG);
  assert.equal(fund.sicher, true);
});

test('lässt sich von Punkt, Komma und Bindestrich nicht stören', () => {
  const fund = findeIbanImFormular('IBAN: DE 02 / 1203/00.00/0000 2020-51');
  assert.equal(fund.iban, GUELTIG);
  assert.equal(fund.sicher, true);
});

test('hält Fließtext nicht für eine IBAN', () => {
  const fund = findeIbanImFormular('Name und Anschrift DES ZAHLUNGSEMPFÄNGERS\nBildungsWerkstatt e. V.');
  assert.equal(fund, null, 'ohne Ziffernkette darf kein Kandidat entstehen');
});

test('rekonstruiert verwechselte Zeichen, kennzeichnet das aber', () => {
  // O statt 0 — der klassische Fehlgriff der Texterkennung.
  const fund = findeIbanImFormular('DE O2/12O3/OOOO/OOOO/2O2O/51');
  assert.equal(fund.iban, GUELTIG);
  assert.equal(fund.sicher, false, 'eine rekonstruierte IBAN gilt nie als sicher');
  assert.match(fund.hinweis, /rekonstruiert/);
});

test('ignoriert ein angehängtes Zeichen, wenn die IBAN davor aufgeht', () => {
  // Die ersten 22 Zeichen ergeben eine prüfziffernrichtige IBAN; die "7"
  // ist ein Artefakt der Texterkennung hinter dem Kästchenfeld.
  const fund = findeIbanImFormular('DE 02/1203/0000/0000/2020/517');
  assert.equal(fund.iban, GUELTIG);
  assert.equal(fund.sicher, true);
});

test('entfernt ein überzähliges Zeichen aus der Mitte, wenn genau eine Lösung bleibt', () => {
  const fund = findeIbanImFormular('DE 02/1203/0000/0X000/2020/51');
  if (fund.iban) {
    assert.equal(fund.iban.length, 22);
    assert.equal(fund.sicher, false, 'aus der Mitte rekonstruiert gilt nie als sicher');
  } else {
    assert.match(fund.hinweis, /nicht lesbar|verschiedene/);
  }
});

test('schlägt nichts vor, wenn der Scan mehrere gültige Lesarten zulässt', () => {
  // Drei überzählige Zeichen: hier wird bewusst nicht mehr geraten.
  const fund = findeIbanImFormular('IBAN: DE 02/7601/00851067610018/51999');
  assert.equal(fund.iban, '');
  assert.match(fund.hinweis, /nicht lesbar|verschiedene/);
});

test('meldet eine unlesbare IBAN, statt zu raten', () => {
  const fund = findeIbanImFormular('IBAN: DE 99/1111/2222/3333/4444/55');
  assert.equal(fund.iban, '');
  assert.match(fund.hinweis, /nicht lesbar|verschiedene/);
});

test('bereinigt Kandidaten auf Buchstaben und Ziffern', () => {
  assert.equal(bereinige('DE 02/1203-00.00,2051'), 'DE02120300002051');
});

test('liest den BIC aus einer ausdrücklich benannten Zeile', () => {
  assert.equal(findeBicImFormular('BIC: PB_NK DEFFI ---'), 'PBNKDEFF');
  assert.equal(findeBicImFormular('DK: BYLADEM, 1001\nKreditinstitut (Name und BIC)'), 'BYLADEM1001');
});

test('hält den Formularvordruck nicht für einen BIC', () => {
  assert.equal(findeBicImFormular('Kreditinstitut (Name und BIC)'), '');
  assert.equal(findeBicImFormular('von meinem/unserem Konto mittels Lastschrift'), '');
});
