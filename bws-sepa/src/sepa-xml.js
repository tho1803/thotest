/**
 * Alternative Ausgabe: SEPA-Lastschrift als pain.008.001.02.
 *
 * windata kann diese Datei ebenso importieren wie die CSV. Sie ist der
 * unveränderliche Standard und damit der Rückfallweg, falls die
 * Feldzuordnung der CSV in windata einmal klemmt.
 */

import { feld, sepaText } from './sepa-text.js';
import { pruefePosten } from './windata.js';

function xmlEscape(wert) {
  return String(wert ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function zeitstempel(datum = new Date()) {
  return datum.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * @param {object} auftraggeber { name, iban, bic, glaeubigerId }
 * @param {Array} postenListe Positionen wie beim CSV-Export
 * @param {object} optionen { nachrichtenId, sequenz, jetzt }
 */
export function baueSepaXml(auftraggeber, postenListe, optionen = {}) {
  const jetzt = optionen.jetzt ?? new Date();
  const gueltige = [];
  const fehler = [];

  postenListe.forEach((posten, index) => {
    const gefunden = pruefePosten(posten, auftraggeber);
    if (gefunden.length) fehler.push({ zeile: index + 1, name: posten.name ?? '', fehler: gefunden });
    else gueltige.push(posten);
  });

  // Eine pain.008-Nachricht darf je Zahlungsblock nur einen Sequenztyp und
  // ein Fälligkeitsdatum führen — deshalb je Kombination ein eigener Block.
  const bloecke = new Map();
  for (const posten of gueltige) {
    const schluessel = `${posten.sequenz ?? 'RCUR'}|${posten.termin}`;
    if (!bloecke.has(schluessel)) bloecke.set(schluessel, []);
    bloecke.get(schluessel).push(posten);
  }

  const summe = gueltige.reduce((s, p) => s + Number(p.betrag), 0);
  const nachrichtenId = feld(optionen.nachrichtenId ?? `BWS-${jetzt.getTime()}`, 35);

  const teile = [];
  teile.push('<?xml version="1.0" encoding="UTF-8"?>');
  teile.push('<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.008.001.02" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">');
  teile.push('  <CstmrDrctDbtInitn>');
  teile.push('    <GrpHdr>');
  teile.push(`      <MsgId>${xmlEscape(nachrichtenId)}</MsgId>`);
  teile.push(`      <CreDtTm>${zeitstempel(jetzt)}</CreDtTm>`);
  teile.push(`      <NbOfTxs>${gueltige.length}</NbOfTxs>`);
  teile.push(`      <CtrlSum>${summe.toFixed(2)}</CtrlSum>`);
  teile.push('      <InitgPty>');
  teile.push(`        <Nm>${xmlEscape(feld(auftraggeber.name, 70))}</Nm>`);
  teile.push('      </InitgPty>');
  teile.push('    </GrpHdr>');

  let blockNummer = 0;
  for (const [schluessel, posten] of bloecke) {
    blockNummer += 1;
    const [sequenz, termin] = schluessel.split('|');
    const blockSumme = posten.reduce((s, p) => s + Number(p.betrag), 0);

    teile.push('    <PmtInf>');
    teile.push(`      <PmtInfId>${xmlEscape(nachrichtenId)}-${blockNummer}</PmtInfId>`);
    teile.push('      <PmtMtd>DD</PmtMtd>');
    teile.push('      <BtchBookg>true</BtchBookg>');
    teile.push(`      <NbOfTxs>${posten.length}</NbOfTxs>`);
    teile.push(`      <CtrlSum>${blockSumme.toFixed(2)}</CtrlSum>`);
    teile.push('      <PmtTpInf>');
    teile.push('        <SvcLvl><Cd>SEPA</Cd></SvcLvl>');
    teile.push('        <LclInstrm><Cd>CORE</Cd></LclInstrm>');
    teile.push(`        <SeqTp>${xmlEscape(sequenz)}</SeqTp>`);
    teile.push('      </PmtTpInf>');
    teile.push(`      <ReqdColltnDt>${xmlEscape(termin)}</ReqdColltnDt>`);
    teile.push('      <Cdtr>');
    teile.push(`        <Nm>${xmlEscape(feld(auftraggeber.name, 70))}</Nm>`);
    teile.push('      </Cdtr>');
    teile.push('      <CdtrAcct>');
    teile.push(`        <Id><IBAN>${xmlEscape(auftraggeber.iban.replace(/\s/g, ''))}</IBAN></Id>`);
    teile.push('      </CdtrAcct>');
    teile.push('      <CdtrAgt>');
    if (auftraggeber.bic) {
      teile.push(`        <FinInstnId><BIC>${xmlEscape(auftraggeber.bic)}</BIC></FinInstnId>`);
    } else {
      teile.push('        <FinInstnId><Othr><Id>NOTPROVIDED</Id></Othr></FinInstnId>');
    }
    teile.push('      </CdtrAgt>');
    teile.push('      <ChrgBr>SLEV</ChrgBr>');
    teile.push('      <CdtrSchmeId>');
    teile.push('        <Id><PrvtId><Othr>');
    teile.push(`          <Id>${xmlEscape(auftraggeber.glaeubigerId.replace(/\s/g, ''))}</Id>`);
    teile.push('          <SchmeNm><Prtry>SEPA</Prtry></SchmeNm>');
    teile.push('        </Othr></PrvtId></Id>');
    teile.push('      </CdtrSchmeId>');

    for (const p of posten) {
      teile.push('      <DrctDbtTxInf>');
      teile.push('        <PmtId>');
      teile.push(`          <EndToEndId>${xmlEscape(feld(p.refId || p.mandatsId, 35))}</EndToEndId>`);
      teile.push('        </PmtId>');
      teile.push(`        <InstdAmt Ccy="EUR">${Number(p.betrag).toFixed(2)}</InstdAmt>`);
      teile.push('        <DrctDbtTx>');
      teile.push('          <MndtRltdInf>');
      teile.push(`            <MndtId>${xmlEscape(feld(p.mandatsId, 35))}</MndtId>`);
      teile.push(`            <DtOfSgntr>${xmlEscape(p.mandatsDatum)}</DtOfSgntr>`);
      teile.push('            <AmdmntInd>false</AmdmntInd>');
      teile.push('          </MndtRltdInf>');
      teile.push('        </DrctDbtTx>');
      if (p.bic) {
        teile.push(`        <DbtrAgt><FinInstnId><BIC>${xmlEscape(p.bic)}</BIC></FinInstnId></DbtrAgt>`);
      } else {
        teile.push('        <DbtrAgt><FinInstnId><Othr><Id>NOTPROVIDED</Id></Othr></FinInstnId></DbtrAgt>');
      }
      teile.push('        <Dbtr>');
      teile.push(`          <Nm>${xmlEscape(feld(p.name, 70))}</Nm>`);
      teile.push('        </Dbtr>');
      teile.push('        <DbtrAcct>');
      teile.push(`          <Id><IBAN>${xmlEscape(p.iban.replace(/\s/g, ''))}</IBAN></Id>`);
      teile.push('        </DbtrAcct>');
      teile.push('        <RmtInf>');
      teile.push(`          <Ustrd>${xmlEscape(feld(p.verwendungszweck ?? '', 140))}</Ustrd>`);
      teile.push('        </RmtInf>');
      teile.push('      </DrctDbtTxInf>');
    }
    teile.push('    </PmtInf>');
  }

  teile.push('  </CstmrDrctDbtInitn>');
  teile.push('</Document>');

  return {
    xml: teile.join('\n'),
    anzahl: gueltige.length,
    summe: Math.round(summe * 100) / 100,
    fehler
  };
}

export { sepaText };
