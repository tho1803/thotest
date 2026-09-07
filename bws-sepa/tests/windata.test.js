import test from 'node:test';
import assert from 'node:assert/strict';
import { baueWindataCsv, baueZeile, pruefePosten, formatiereBetrag, dateiname } from '../src/windata.js';

const AUFTRAGGEBER = {
  name: 'BildungsWerkstatt e.V.',
  iban: 'DE54 3702 0500 0001 6986 00',
  bic: 'BFSWDE33MUE',
  glaeubigerId: 'DE98ZZZ09999999999'
};

const POSTEN = {
  name: 'Maria Musterfrau',
  strasse: 'Beispielweg 7',
  ort: '81829 München',
  iban: 'AT61 1904 3002 3457 3201',
  bic: 'BKAUATWW',
  betrag: 87.5,
  termin: '2026-10-01',
  verwendungszweck: 'Elternbeitrag Ganztag Oktober 2026',
  mandatsId: 'BWS-2026-0042',
  mandatsDatum: '2026-03-14',
  sequenz: 'RCUR'
};

test('Kopfzeile nennt die Formatversion', () => {
  const { csv } = baueWindataCsv(AUFTRAGGEBER, [POSTEN]);
  assert.equal(csv.split('\r\n')[0], 'windata CSV 1.2');
  const alt = baueWindataCsv(AUFTRAGGEBER, [POSTEN], { version: '1.1' });
  assert.equal(alt.csv.split('\r\n')[0], 'windata CSV 1.1');
});

test('Version 1.2 hat 35 Felder, Version 1.1 hat 33', () => {
  assert.equal(baueZeile(POSTEN, AUFTRAGGEBER, { version: '1.2' }).length, 35);
  assert.equal(baueZeile(POSTEN, AUFTRAGGEBER, { version: '1.1' }).length, 33);
});

test('die Pflichtfelder stehen an der vorgeschriebenen Position', () => {
  const zeile = baueZeile(POSTEN, AUFTRAGGEBER);
  assert.equal(zeile[0], 'BildungsWerkstatt e.V.');
  assert.equal(zeile[1], 'DE54370205000001698600');   // 2 AG IBAN
  assert.equal(zeile[2], 'BFSWDE33MUE');              // 3 AG BIC
  assert.equal(zeile[3], 'Maria Musterfrau');         // 4 Zahlungspflichtige
  assert.equal(zeile[7], 'AT611904300234573201');     // 8 IBAN
  assert.equal(zeile[8], 'BKAUATWW');                 // 9 BIC
  assert.equal(zeile[9], '87,50');                    // 10 Betrag
  assert.equal(zeile[10], 'EUR');                     // 11 Währung
  assert.equal(zeile[11], 'BASIS');                   // 12 Zahlart
  assert.equal(zeile[12], '01.10.2026');              // 13 Termin
  assert.equal(zeile[13], 'Elternbeitrag Ganztag');   // 14 VWZ1
  assert.equal(zeile[28], 'BWS-2026-0042');           // 29 Mandat-ID
  assert.equal(zeile[29], '14.03.2026');              // 30 Mandat-Datum
  assert.equal(zeile[30], 'DE98ZZZ09999999999');      // 31 Gläubiger-ID
  assert.equal(zeile[31], 'RCUR');                    // 32 Sequenz
});

test('Umlaute im Ort werden SEPA-konform umgeschrieben', () => {
  const zeile = baueZeile(POSTEN, AUFTRAGGEBER);
  assert.equal(zeile[6], '81829 Muenchen');
});

test('kein Semikolon und kein Anführungszeichen kann die Satzstruktur zerstören', () => {
  const boesartig = { ...POSTEN, name: 'Meier; "Hans"', verwendungszweck: 'Beitrag; Extra' };
  const zeile = baueZeile(boesartig, AUFTRAGGEBER);
  assert.equal(zeile.length, 35);
  for (const wert of zeile) {
    assert.equal(wert.includes(';'), false);
    assert.equal(wert.includes('"'), false);
  }
});

test('Zeilen enden mit CR/LF, wie das Format verlangt', () => {
  const { csv } = baueWindataCsv(AUFTRAGGEBER, [POSTEN, { ...POSTEN, name: 'Zweiter Fall' }]);
  assert.equal(csv.endsWith('\r\n'), true);
  assert.equal(csv.split('\r\n').filter(Boolean).length, 3); // Kopfzeile + 2 Posten
});

test('zählt Posten und Summe', () => {
  const ergebnis = baueWindataCsv(AUFTRAGGEBER, [POSTEN, { ...POSTEN, betrag: 12.55 }]);
  assert.equal(ergebnis.anzahl, 2);
  assert.equal(ergebnis.summe, 100.05);
  assert.equal(ergebnis.fehler.length, 0);
});

test('fehlerhafte Posten kommen nicht in die Datei, sondern in die Fehlerliste', () => {
  const kaputt = { ...POSTEN, iban: 'DE00 0000 0000 0000 0000 00', name: 'Fehlerfall' };
  const ergebnis = baueWindataCsv(AUFTRAGGEBER, [POSTEN, kaputt]);
  assert.equal(ergebnis.anzahl, 1);
  assert.equal(ergebnis.fehler.length, 1);
  assert.equal(ergebnis.fehler[0].name, 'Fehlerfall');
  assert.equal(ergebnis.csv.includes('Fehlerfall'), false);
});

test('prüft die Pflichtangaben einer Position', () => {
  assert.deepEqual(pruefePosten(POSTEN, AUFTRAGGEBER), []);
  assert.ok(pruefePosten({ ...POSTEN, betrag: 0 }, AUFTRAGGEBER).some((f) => /Betrag/.test(f)));
  assert.ok(pruefePosten({ ...POSTEN, mandatsId: '' }, AUFTRAGGEBER).some((f) => /Mandatsreferenz/.test(f)));
  assert.ok(pruefePosten({ ...POSTEN, sequenz: 'XXXX' }, AUFTRAGGEBER).some((f) => /Sequenz/.test(f)));
  assert.ok(pruefePosten(POSTEN, { ...AUFTRAGGEBER, glaeubigerId: '' }).some((f) => /Gläubiger/.test(f)));
});

test('formatiert Beträge mit Komma und zwei Nachkommastellen', () => {
  assert.equal(formatiereBetrag(7), '7,00');
  assert.equal(formatiereBetrag(1234.5), '1234,50');
  assert.equal(formatiereBetrag(0.005), '0,01');
  assert.equal(formatiereBetrag('keine Zahl'), '');
});

test('langer Verwendungszweck verteilt sich auf mehrere VWZ-Felder', () => {
  const lang = { ...POSTEN, verwendungszweck: 'Elternbeitrag Ganztagsbetreuung Oktober 2026 fuer Lea Musterfrau Klasse 3b Grundschule' };
  const zeile = baueZeile(lang, AUFTRAGGEBER);
  const vwz = zeile.slice(13, 27);
  assert.ok(vwz.filter(Boolean).length >= 3);
  for (const wert of vwz) assert.ok(wert.length <= 27);
});

test('schlägt einen sprechenden Dateinamen vor', () => {
  assert.equal(dateiname('2026-10-01', 'Elternbeitrag Oktober'), 'BWS-Lastschrift-2026-10-01-Elternbeitrag-Oktober.csv');
});
