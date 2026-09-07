import test from 'node:test';
import assert from 'node:assert/strict';
import {
  teileMandate, leseBwsMandate, bildeMandatsreferenz, GLAEUBIGER_ID
} from '../src/bws-formular.js';

/** Nachbau eines Sammelscans: zwei Mandate, erfundene Personen. */
const SCAN = `Anlage 1
SEPA-Lastschriftmandat einer wiederkehrenden Lastschrift
Name und Anschrift des Zahlungsempfängers
BildungsWerkstatt e. V.
Astrid-Lindgren-Str. 16
81829 München
Gläubiger-Identifikationsnummer: DE82BWS00002311070
Mandatsreferenz: BWS_Nachname-Vorname des Kindes
Beispiel, Lea Silva Grundschule, 2b
(Vorname, Name, Einrichtung, Klasse des Kindes)
von meinem/unserem Konto mittels Lastschrift einzuziehen.
Kontoinhaber/in: _ Anna Beispiel
Vorname und Name
Adresse: Musterweg 4 81829 München
DK: BYLADEM, 1001
Kreditinstitut (Name und BIC)
DE 02/1203/0000/0000/2020/51
IBAN
München, 14.03.2026
Ort, Datum Unterschrift Kontoinhaber*in
Seite 8|22
SEPA-Lastschriftmandat einer wiederkehrenden Lastschrift
Name und Anschrift des Zahlungsempfängers
BildungsWerkstatt e. V.
Gläubiger-Identifikationsnummer: DE82BWS00002311070
Mandatsreferenz: BWS_Nachname-Vorname des Kindes
Muster Jonas
(Vorname, Name)
an der Mittelschule Feldbergstraße, Klasse: 5g
Kontoinhaber/in: Bernd Muster
(Vorname, Name)
Adresse: Bahnstr. 12 81827 München
BIC: PB_NK DEFFI ---
IBAN: DE 02/1203/0000/0000/2020/51
Ort, Datum München 22.05.2026
Unterschrift (en)`;

test('zerlegt einen Sammelscan in einzelne Mandate', () => {
  assert.equal(teileMandate(SCAN).length, 2);
});

test('ein einzelnes Mandat bleibt ein Abschnitt', () => {
  assert.equal(teileMandate('SEPA-Lastschriftmandat einer wiederkehrenden Lastschrift\nnur eines').length, 1);
  assert.equal(teileMandate('Text ganz ohne Mandat').length, 1);
});

test('liest beide Formularvarianten vollständig', () => {
  const [erstes, zweites] = leseBwsMandate(SCAN);

  assert.equal(erstes.kontoinhaber, 'Anna Beispiel');
  assert.equal(erstes.iban, 'DE02120300000000202051');
  assert.equal(erstes.ibanSicher, true);
  assert.equal(erstes.bic, 'BYLADEM1001');
  assert.equal(erstes.mandatsDatum, '2026-03-14');
  assert.equal(erstes.glaeubigerId, GLAEUBIGER_ID);

  assert.equal(zweites.kontoinhaber, 'Bernd Muster');
  assert.equal(zweites.bic, 'PBNKDEFF');
  assert.equal(zweites.mandatsDatum, '2026-05-22');
});

test('entfernt Unterstriche und Vordrucktext aus dem Namen', () => {
  const [erstes] = leseBwsMandate(SCAN);
  assert.equal(erstes.kontoinhaber.includes('_'), false);
  assert.equal(/Vorname und Name/i.test(erstes.kontoinhaber), false);
});

test('bildet die Mandatsreferenz nach dem Schema der BildungsWerkstatt', () => {
  assert.equal(bildeMandatsreferenz('Beispiel, Lea'), 'BWS_Beispiel-Lea');
  assert.equal(bildeMandatsreferenz('Jonas Muster'), 'BWS_Muster-Jonas');
  assert.equal(bildeMandatsreferenz(''), '');
});

test('weist auf die gebildete Referenz hin, statt sie als gesichert auszugeben', () => {
  const [erstes] = leseBwsMandate(SCAN);
  assert.ok(erstes.mandatsId.startsWith('BWS_'));
  assert.ok(erstes.hinweise.some((h) => /Schema gebildet/.test(h)));
});

test('die Gläubiger-ID des Vereins ist die aus dem Formular', () => {
  assert.equal(GLAEUBIGER_ID, 'DE82BWS00002311070');
});
