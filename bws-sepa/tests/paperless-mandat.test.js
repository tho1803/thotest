import test from 'node:test';
import assert from 'node:assert/strict';
import { leseIoMandat, istIoMandat, findeUnterzeichner } from '../src/paperless-mandat.js';

/** Nachbau eines versiegelten paperless.io-Mandats mit erfundenen Daten. */
const MANDAT = `SEPA-Basislastschrift-Mandat
Gläubiger-Identifikationsnummer: DE82BWS00002311070
Mandatsreferenz: BWS-Beispiel-Lea
Zahlungsempfänger: BildungsWerkstatt e.V., Astrid-Lindgren-Str. 16, 81829 München
Ich ermächtige/Wir ermächtigen BildungsWerkstatt e.V., Zahlungen von
meinem/unserem Konto mittels Lastschrift einzuziehen.
Hinweis: Ich kann/wir können innerhalb von acht Wochen die Erstattung verlangen.
Bankverbindung
IBAN
DE02 1203 0000 0000 2020 51
BIC
BYLADEM1001
Kreditinstitut (Bank oder Postgiroamt) und Ort
BAYERISCHE LANDESBANK MUENCHEN
Name des abweichenden Kontoinhabers
Datum: 02.09.2026
Ort: München
Wiederkehrende Zahlungen Einmalige Zahlung
1/1
AUDIT TRAIL
Beteiligte
Thomas Perr (perr@bws-ev.de)
Rolle: Versender
Anna Beispiel (anna@example.org)
Rolle: Empfänger (Ausfüllen & Unterschreiben)
Status: Abgeschlossen`;

test('erkennt ein Mandat aus paperless.io', () => {
  assert.equal(istIoMandat(MANDAT), true);
  assert.equal(istIoMandat('Irgendein Vertrag ohne Mandat'), false);
});

test('liest alle Angaben aus dem Mandat', () => {
  const m = leseIoMandat(MANDAT);
  assert.equal(m.iban, 'DE02120300000000202051');
  assert.equal(m.ibanSicher, true);
  assert.equal(m.bic, 'BYLADEM1001');
  assert.equal(m.kreditinstitut, 'BAYERISCHE LANDESBANK MUENCHEN');
  assert.equal(m.mandatsId, 'BWS-Beispiel-Lea');
  assert.equal(m.mandatsDatum, '2026-09-02');
  assert.equal(m.ort, 'München');
  assert.equal(m.glaeubigerId, 'DE82BWS00002311070');
});

test('nimmt den Unterzeichner als Kontoinhaber, wenn kein abweichender genannt ist', () => {
  const m = leseIoMandat(MANDAT);
  assert.equal(m.kontoinhaber, 'Anna Beispiel');
  assert.equal(m.unterzeichnerEmail, 'anna@example.org');
  assert.ok(m.hinweise.some((h) => /aus der Unterschrift/.test(h)));
});

test('bevorzugt den abweichenden Kontoinhaber, wenn er eingetragen ist', () => {
  const mitAbweichendem = MANDAT.replace(
    'Name des abweichenden Kontoinhabers\nDatum:',
    'Name des abweichenden Kontoinhabers\nBernd Muster\nDatum:'
  );
  const m = leseIoMandat(mitAbweichendem);
  assert.equal(m.kontoinhaber, 'Bernd Muster');
  assert.equal(m.hinweise.some((h) => /aus der Unterschrift/.test(h)), false);
});

test('hält eine Beschriftung nicht für einen Wert', () => {
  // Im Beispiel folgt auf "Name des abweichenden Kontoinhabers" sofort
  // "Datum:" — das Feld wurde also nicht ausgefüllt.
  const m = leseIoMandat(MANDAT);
  assert.notEqual(m.kontoinhaber, 'Datum: 02.09.2026');
});

test('meldet eine nicht ausgefüllte Bankverbindung, statt zu raten', () => {
  const leer = MANDAT
    .replace('DE02 1203 0000 0000 2020 51\n', '')
    .replace('BYLADEM1001\n', '');
  const m = leseIoMandat(leer);
  assert.equal(m.iban, '');
  assert.equal(m.bic, '');
});

test('findet den Unterzeichner im Prüfpfad', () => {
  assert.deepEqual(findeUnterzeichner(MANDAT), { name: 'Anna Beispiel', email: 'anna@example.org' });
  assert.deepEqual(findeUnterzeichner('ohne Prüfpfad'), { name: '', email: '' });
});
