import test from 'node:test';
import assert from 'node:assert/strict';
import { baueSepaXml } from '../src/sepa-xml.js';

const AUFTRAGGEBER = {
  name: 'BildungsWerkstatt e.V.',
  iban: 'DE54370205000001698600',
  bic: 'BFSWDE33MUE',
  glaeubigerId: 'DE98ZZZ09999999999'
};
const POSTEN = {
  name: 'Maria Musterfrau',
  iban: 'AT611904300234573201',
  bic: 'BKAUATWW',
  betrag: 87.5,
  termin: '2026-10-01',
  verwendungszweck: 'Elternbeitrag Oktober 2026',
  mandatsId: 'BWS-2026-0042',
  mandatsDatum: '2026-03-14',
  sequenz: 'RCUR'
};

test('erzeugt eine pain.008.001.02-Nachricht', () => {
  const { xml } = baueSepaXml(AUFTRAGGEBER, [POSTEN], { nachrichtenId: 'BWS-TEST-1' });
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(xml, /urn:iso:std:iso:20022:tech:xsd:pain\.008\.001\.02/);
  assert.match(xml, /<MsgId>BWS-TEST-1<\/MsgId>/);
});

test('Kopfsumme und Anzahl stimmen mit den Positionen überein', () => {
  const { xml, anzahl, summe } = baueSepaXml(AUFTRAGGEBER, [POSTEN, { ...POSTEN, betrag: 12.5 }]);
  assert.equal(anzahl, 2);
  assert.equal(summe, 100);
  assert.match(xml, /<NbOfTxs>2<\/NbOfTxs>/);
  assert.match(xml, /<CtrlSum>100\.00<\/CtrlSum>/);
});

test('trennt Blöcke nach Sequenztyp und Fälligkeit', () => {
  const { xml } = baueSepaXml(AUFTRAGGEBER, [
    POSTEN,
    { ...POSTEN, sequenz: 'FRST' },
    { ...POSTEN, termin: '2026-11-01' }
  ]);
  assert.equal((xml.match(/<PmtInf>/g) ?? []).length, 3);
  assert.match(xml, /<SeqTp>FRST<\/SeqTp>/);
  assert.match(xml, /<SeqTp>RCUR<\/SeqTp>/);
});

test('trägt Mandat, Gläubiger-ID und IBANs an die richtige Stelle', () => {
  const { xml } = baueSepaXml(AUFTRAGGEBER, [POSTEN]);
  assert.match(xml, /<MndtId>BWS-2026-0042<\/MndtId>/);
  assert.match(xml, /<DtOfSgntr>2026-03-14<\/DtOfSgntr>/);
  assert.match(xml, /<Id>DE98ZZZ09999999999<\/Id>/);
  assert.match(xml, /<IBAN>DE54370205000001698600<\/IBAN>/);
  assert.match(xml, /<IBAN>AT611904300234573201<\/IBAN>/);
  assert.match(xml, /<InstdAmt Ccy="EUR">87\.50<\/InstdAmt>/);
});

test('setzt NOTPROVIDED, wenn kein BIC vorliegt', () => {
  const { xml } = baueSepaXml(AUFTRAGGEBER, [{ ...POSTEN, bic: '' }]);
  assert.match(xml, /<DbtrAgt><FinInstnId><Othr><Id>NOTPROVIDED<\/Id><\/Othr><\/FinInstnId><\/DbtrAgt>/);
});

test('maskiert XML-Sonderzeichen und hält Namen SEPA-konform', () => {
  const { xml } = baueSepaXml(AUFTRAGGEBER, [{ ...POSTEN, name: 'Meier & Söhne <GmbH>' }]);
  assert.equal(xml.includes('<Nm>Meier & Söhne <GmbH></Nm>'), false);
  assert.match(xml, /<Nm>Meier und Soehne GmbH<\/Nm>/);
});

test('fehlerhafte Positionen landen in der Fehlerliste statt in der Datei', () => {
  const ergebnis = baueSepaXml(AUFTRAGGEBER, [POSTEN, { ...POSTEN, name: 'Fehlerfall', mandatsId: '' }]);
  assert.equal(ergebnis.anzahl, 1);
  assert.equal(ergebnis.fehler.length, 1);
  assert.equal(ergebnis.xml.includes('Fehlerfall'), false);
});

test('das Ergebnis ist wohlgeformtes XML', async () => {
  const { xml } = baueSepaXml(AUFTRAGGEBER, [POSTEN, { ...POSTEN, sequenz: 'FRST' }]);
  // Grobe Strukturprüfung ohne Parser-Abhängigkeit: alle Tags sauber geschlossen.
  const stapel = [];
  for (const treffer of xml.matchAll(/<(\/?)([A-Za-z][\w.]*)(\s[^>]*?)?(\/?)>/g)) {
    const [, schliessend, name, , selbstschliessend] = treffer;
    if (selbstschliessend) continue;
    if (schliessend) assert.equal(stapel.pop(), name, `unerwartetes </${name}>`);
    else stapel.push(name);
  }
  assert.deepEqual(stapel, []);
});
