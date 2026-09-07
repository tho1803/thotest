import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extrahiereMandat, extrahiereMandate, baueFeldIndex,
  zuIsoDatum, zuDeutschemDatum, zuBetrag
} from '../src/mandate.js';

const OCR_TEXT = `
SEPA-Lastschriftmandat
BildungsWerkstatt e.V., Paul-Wassermann-Str. 15, 81829 München
Gläubiger-Identifikationsnummer: DE98ZZZ09999999999
Mandatsreferenz: BWS-2026-0042

Ich ermächtige die BildungsWerkstatt e.V., Zahlungen von meinem Konto
mittels Lastschrift einzuziehen.

Kontoinhaber: Maria Musterfrau
Straße und Hausnummer: Beispielweg 7
PLZ und Ort: 81829 München
IBAN: DE54 3702 0500 0001 6986 00
BIC: BFSWDE33MUE

München, 14.03.2026
Ort, Datum, Unterschrift
`;

test('liest ein Mandat vollständig aus dem OCR-Text', () => {
  const mandat = extrahiereMandat({ id: 7, title: 'Mandat Musterfrau', content: OCR_TEXT });
  assert.equal(mandat.iban, 'DE54370205000001698600');
  assert.equal(mandat.bic, 'BFSWDE33MUE');
  assert.equal(mandat.mandatsId, 'BWS-2026-0042');
  assert.equal(mandat.mandatsDatum, '2026-03-14');
  assert.equal(mandat.kontoinhaber, 'Maria Musterfrau');
  assert.equal(mandat.uebernehmen, true);
});

test('markiert Felder aus der Texterkennung als prüfbedürftig', () => {
  const mandat = extrahiereMandat({ id: 7, content: OCR_TEXT });
  assert.equal(mandat.quelle.iban, 'text');
  assert.ok(mandat.warnungen.some((w) => /Texterkennung/.test(w)));
});

test('bevorzugt gepflegte Custom Fields vor dem OCR-Text', () => {
  const feldIndex = baueFeldIndex([
    { id: 1, name: 'IBAN' },
    { id: 2, name: 'Mandatsreferenz' },
    { id: 3, name: 'Kontoinhaber' },
    { id: 4, name: 'Mandatsdatum' },
    { id: 5, name: 'Monatsbeitrag' },
    { id: 6, name: 'BIC' }
  ]);
  const dokument = {
    id: 8,
    content: OCR_TEXT,
    custom_fields: [
      { field: 1, value: 'AT61 1904 3002 3457 3201' },
      { field: 2, value: 'BWS-2026-0099' },
      { field: 3, value: 'Anna Beispiel' },
      { field: 4, value: '2026-01-09' },
      { field: 5, value: '87,50 €' },
      { field: 6, value: 'BKAUATWW' }
    ]
  };
  const mandat = extrahiereMandat(dokument, { feldIndex });
  assert.equal(mandat.iban, 'AT611904300234573201');
  assert.equal(mandat.mandatsId, 'BWS-2026-0099');
  assert.equal(mandat.kontoinhaber, 'Anna Beispiel');
  assert.equal(mandat.mandatsDatum, '2026-01-09');
  assert.equal(mandat.betrag, 87.5);
  assert.equal(mandat.quelle.iban, 'feld');
  assert.equal(mandat.warnungen.length, 0);
});

test('meldet eine unlesbare IBAN, statt sie stillschweigend zu übernehmen', () => {
  const mandat = extrahiereMandat({ id: 9, content: 'IBAN: DE00 0000 0000 0000 0000 00\nMandatsreferenz: X-1' });
  assert.equal(mandat.uebernehmen, false);
  assert.ok(mandat.warnungen.some((w) => /IBAN/.test(w)));
});

test('nimmt bei mehreren IBAN-Kandidaten die erste gültige', () => {
  const text = 'Alt: DE00 1234 5678 9012 3456 78\nNeu IBAN: DE54 3702 0500 0001 6986 00';
  const mandat = extrahiereMandat({ id: 10, content: text });
  assert.equal(mandat.iban, 'DE54370205000001698600');
});

test('erkennt einen BIC nur bei Kontext oder Eindeutigkeit', () => {
  const ohneKontext = extrahiereMandat({ id: 11, content: 'IBAN: DE54 3702 0500 0001 6986 00' });
  assert.equal(ohneKontext.bic, '');
});

test('warnt bei einem Mandatsdatum in der Zukunft', () => {
  const mandat = extrahiereMandat({
    id: 12,
    content: 'Mandatsreferenz: X-2\nIBAN: DE54 3702 0500 0001 6986 00\nOrt, Datum: 01.01.2099'
  });
  assert.ok(mandat.warnungen.some((w) => /Zukunft/.test(w)));
});

test('wandelt Datumsformate in beide Richtungen', () => {
  assert.equal(zuIsoDatum('14.03.2026'), '2026-03-14');
  assert.equal(zuIsoDatum('1.3.26'), '2026-03-01');
  assert.equal(zuIsoDatum('2026-03-14'), '2026-03-14');
  assert.equal(zuIsoDatum('Unsinn'), '');
  assert.equal(zuDeutschemDatum('2026-03-14'), '14.03.2026');
  assert.equal(zuDeutschemDatum(''), '');
});

test('liest Beträge in deutscher und englischer Schreibweise', () => {
  assert.equal(zuBetrag('87,50 €'), 87.5);
  assert.equal(zuBetrag('1.234,56'), 1234.56);
  assert.equal(zuBetrag('1,234.56'), 1234.56);
  assert.equal(zuBetrag(42), 42);
  assert.equal(zuBetrag(''), null);
});

test('sortiert eine Liste nach Kontoinhaber', () => {
  const liste = extrahiereMandate([
    { id: 1, content: 'Kontoinhaber: Zöller, Bernd\nIBAN: DE54 3702 0500 0001 6986 00' },
    { id: 2, content: 'Kontoinhaber: Anders, Eva\nIBAN: DE54 3702 0500 0001 6986 00' }
  ]);
  assert.equal(liste[0].kontoinhaber, 'Anders, Eva');
});

test('trennt blockierende Fehler von Prüfhinweisen', () => {
  const ausText = extrahiereMandat({ id: 20, content: OCR_TEXT });
  assert.deepEqual(ausText.fehler, [], 'ein sauber gelesenes Mandat hat keinen blockierenden Fehler');
  assert.equal(ausText.uebernehmen, true);
  assert.ok(ausText.hinweise.some((h) => /Texterkennung/.test(h)));
  assert.equal(ausText.einwandfrei, false, 'aus OCR gelesen heißt: gegenlesen');

  const kaputt = extrahiereMandat({ id: 21, content: 'Kontoinhaber: A\nIBAN: DE00 0000 0000 0000 0000 00' });
  assert.ok(kaputt.fehler.length >= 1);
  assert.equal(kaputt.uebernehmen, false);
});

test('ein Mandat aus gepflegten Feldern gilt als einwandfrei', () => {
  const feldIndex = baueFeldIndex([
    { id: 1, name: 'IBAN' }, { id: 2, name: 'Mandatsreferenz' },
    { id: 3, name: 'Kontoinhaber' }, { id: 4, name: 'Mandatsdatum' }
  ]);
  const mandat = extrahiereMandat({
    id: 22,
    content: '',
    custom_fields: [
      { field: 1, value: 'DE02120300000000202051' },
      { field: 2, value: 'BWS-2026-0100' },
      { field: 3, value: 'Anna Beispiel' },
      { field: 4, value: '2026-02-02' }
    ]
  }, { feldIndex });
  assert.equal(mandat.einwandfrei, true);
  assert.deepEqual(mandat.fehler, []);
  assert.deepEqual(mandat.hinweise, []);
});

test('baut ein Mandat aus digital ausgefüllten Feldern ohne Prüfhinweise', async () => {
  const { mandatAusStrukturiertenFeldern } = await import('../src/mandate.js');
  const mandat = mandatAusStrukturiertenFeldern(
    { id: 'doc_1', name: 'Mandat Beispiel' },
    {
      kontoinhaber: 'Anna Beispiel', kind: 'Lea Beispiel',
      iban: 'DE02120300000000202051', bic: 'BYLADEM1001',
      mandatsId: 'BWS-Beispiel-Lea', mandatsDatum: '2026-09-02', betrag: '87,50'
    }
  );
  assert.equal(mandat.uebernehmen, true);
  assert.equal(mandat.einwandfrei, true, 'digitale Felder brauchen kein Gegenlesen');
  assert.equal(mandat.betrag, 87.5);
  assert.equal(mandat.mandatsDatum, '2026-09-02');
});

test('ersetzt den Unterstrich alter Referenzen durch einen Bindestrich', async () => {
  const { mandatAusStrukturiertenFeldern } = await import('../src/mandate.js');
  // Alte Mandate tragen die Referenz BWS_Nachname-Vorname. Der Unterstrich
  // gehört nicht zum SEPA-Zeichensatz und würde in der Datei zu einem
  // Leerzeichen. Der Bindestrich bleibt dagegen erhalten und meint dasselbe.
  const mandat = mandatAusStrukturiertenFeldern(
    { id: 'doc_3' },
    {
      kontoinhaber: 'Anna Beispiel', iban: 'DE02120300000000202051',
      mandatsId: 'BWS_Beispiel-Lea', mandatsDatum: '2026-09-02'
    }
  );
  assert.equal(mandat.mandatsId, 'BWS-Beispiel-Lea');
  assert.equal(mandat.uebernehmen, true);
  assert.ok(mandat.hinweise.some((h) => /Bindestrich ersetzt/.test(h)));
});

test('meldet fehlende digitale Felder als Fehler, nicht als Hinweis', async () => {
  const { mandatAusStrukturiertenFeldern } = await import('../src/mandate.js');
  const mandat = mandatAusStrukturiertenFeldern({ id: 'doc_2' }, { iban: 'DE00000000000000000000' });
  assert.equal(mandat.uebernehmen, false);
  assert.ok(mandat.fehler.length >= 3);
  assert.deepEqual(mandat.hinweise, []);
});
