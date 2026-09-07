/**
 * Erzeugt eine Importdatei im Format "windata CSV" für SEPA-Basislastschriften.
 *
 * Feldbelegung nach der Datensatzbeschreibung windata Zahlungen.CSV:
 *   1 AG Name · 2 AG IBAN · 3 AG BIC · 4 Zahlpfl Name · 5 Name2 · 6 Strasse ·
 *   7 Ort · 8 Zahlpfl IBAN · 9 Zahlpfl BIC · 10 Betrag · 11 Währung ·
 *   12 Zahlart · 13 Termin · 14–27 VWZ1–VWZ14 · 28 Ref-ID · 29 Mandat-ID ·
 *   30 Mandat-Datum · 31 AG Gläubiger-ID · 32 Sequenz ·
 *   33 Übergeordneter Auftraggeber · 34 Laufzeit · 35 zahlweise
 * Die Felder 34 und 35 gibt es erst ab Version 1.2.
 *
 * Trennzeichen Semikolon, Zeilenende CR/LF, Datum TT.MM.JJJJ,
 * Betrag mit Komma. Anführungszeichen sind im Format nicht erlaubt und
 * werden von sepaText() ohnehin entfernt.
 */

import { feld, verwendungszweckZeilen, sepaText } from './sepa-text.js';
import { zuDeutschemDatum } from './mandate.js';
import { pruefeIban } from './iban.js';

export const ZAHLARTEN = {
  BASIS: 'BASIS',   // SEPA-Basislastschrift (der Regelfall im Verein)
  FIRMEN: 'FIRMEN', // SEPA-Firmenlastschrift (B2B)
  COR1: 'COR1'      // Eillastschrift
};

export const SEQUENZEN = ['FRST', 'RCUR', 'OOFF', 'FNAL'];

const FELDLAENGEN = {
  agName: 35, agKonto: 35, agBank: 11,
  name: 35, name2: 35, strasse: 27, ort: 27, konto: 35, bank: 11,
  waehrung: 3, zahlart: 6, refId: 35, mandatsId: 35, glaeubigerId: 35,
  sequenz: 4, uebergeordnet: 70, zahlweise: 2
};

/** Betrag im windata-Format: Punkt als Tausender entfällt, Komma als Dezimaltrenner. */
export function formatiereBetrag(betrag) {
  const zahl = Number(betrag);
  if (!Number.isFinite(zahl)) return '';
  return zahl.toFixed(2).replace('.', ',');
}

/**
 * Prüft eine Position, bevor sie in die Datei geschrieben wird.
 * @returns {string[]} Liste der Fehler; leer = in Ordnung
 */
export function pruefePosten(posten, auftraggeber) {
  const fehler = [];

  if (!auftraggeber?.name) fehler.push('Name des Auftraggebers fehlt');
  const agIban = pruefeIban(auftraggeber?.iban);
  if (!agIban.gueltig) fehler.push(`Vereins-IBAN: ${agIban.fehler}`);
  if (!auftraggeber?.glaeubigerId) fehler.push('Gläubiger-Identifikationsnummer fehlt');

  if (!posten.name) fehler.push('Name der zahlungspflichtigen Person fehlt');
  const iban = pruefeIban(posten.iban);
  if (!iban.gueltig) fehler.push(`IBAN: ${iban.fehler}`);

  const betrag = Number(posten.betrag);
  if (!Number.isFinite(betrag) || betrag <= 0) fehler.push('Betrag fehlt oder ist nicht positiv');
  else if (betrag > 999999999.99) fehler.push('Betrag überschreitet das Feldformat');

  if (!posten.mandatsId) fehler.push('Mandatsreferenz fehlt');
  if (!posten.mandatsDatum) fehler.push('Mandatsdatum fehlt');
  if (!posten.termin) fehler.push('Fälligkeitstermin fehlt');
  if (posten.sequenz && !SEQUENZEN.includes(posten.sequenz)) {
    fehler.push(`Sequenz "${posten.sequenz}" ist keine der zulässigen (${SEQUENZEN.join(', ')})`);
  }
  return fehler;
}

/** Baut eine einzelne CSV-Zeile (Array der Feldwerte). */
export function baueZeile(posten, auftraggeber, optionen = {}) {
  const version = optionen.version ?? '1.2';
  const vwz = verwendungszweckZeilen(posten.verwendungszweck ?? '', 14, 27);

  const zeile = [
    feld(auftraggeber.name, FELDLAENGEN.agName),
    feld(auftraggeber.iban, FELDLAENGEN.agKonto).replace(/\s/g, ''),
    feld(auftraggeber.bic, FELDLAENGEN.agBank).replace(/\s/g, ''),
    feld(posten.name, FELDLAENGEN.name),
    feld(posten.name2 ?? '', FELDLAENGEN.name2),
    feld(posten.strasse ?? '', FELDLAENGEN.strasse),
    feld(posten.ort ?? '', FELDLAENGEN.ort),
    feld(posten.iban, FELDLAENGEN.konto).replace(/\s/g, ''),
    feld(posten.bic ?? '', FELDLAENGEN.bank).replace(/\s/g, ''),
    formatiereBetrag(posten.betrag),
    feld(posten.waehrung ?? 'EUR', FELDLAENGEN.waehrung),
    feld(posten.zahlart ?? ZAHLARTEN.BASIS, FELDLAENGEN.zahlart),
    zuDeutschemDatum(posten.termin)
  ];

  for (let i = 0; i < 14; i += 1) zeile.push(vwz[i] ?? '');

  zeile.push(
    feld(posten.refId ?? '', FELDLAENGEN.refId),
    feld(posten.mandatsId, FELDLAENGEN.mandatsId),
    zuDeutschemDatum(posten.mandatsDatum),
    feld(auftraggeber.glaeubigerId, FELDLAENGEN.glaeubigerId).replace(/\s/g, ''),
    feld(posten.sequenz ?? 'RCUR', FELDLAENGEN.sequenz),
    feld(auftraggeber.uebergeordnet ?? '', FELDLAENGEN.uebergeordnet)
  );

  if (version === '1.2') {
    zeile.push(
      posten.laufzeit ? zuDeutschemDatum(posten.laufzeit) : '',
      feld(posten.zahlweise ?? '', FELDLAENGEN.zahlweise)
    );
  }

  // Semikolon würde die Satzstruktur zerstören; sepaText lässt es nicht durch,
  // diese Zeile ist die Absicherung für den Fall geänderter Zeichenregeln.
  return zeile.map((wert) => String(wert).replace(/[;"\r\n]/g, ' ').trim());
}

/**
 * Erzeugt die vollständige windata-CSV.
 * @returns {{csv: string, anzahl: number, summe: number, fehler: Array}}
 */
export function baueWindataCsv(auftraggeber, postenListe, optionen = {}) {
  const version = optionen.version ?? '1.2';
  const zeilen = [`windata CSV ${version}`];
  const fehler = [];
  let summe = 0;
  let anzahl = 0;

  postenListe.forEach((posten, index) => {
    const gefunden = pruefePosten(posten, auftraggeber);
    if (gefunden.length) {
      fehler.push({ zeile: index + 1, name: posten.name ?? '(ohne Namen)', fehler: gefunden });
      return;
    }
    zeilen.push(baueZeile(posten, auftraggeber, { version }).join(';'));
    summe += Number(posten.betrag);
    anzahl += 1;
  });

  return {
    csv: `${zeilen.join('\r\n')}\r\n`,
    anzahl,
    summe: Math.round(summe * 100) / 100,
    fehler
  };
}

/** Dateiname nach Muster BWS-Lastschrift-JJJJ-MM-TT-Verwendung.csv */
export function dateiname(termin, zusatz = '') {
  const teil = sepaText(zusatz).replace(/\s+/g, '-');
  return ['BWS-Lastschrift', termin || 'ohne-Termin', teil].filter(Boolean).join('-') + '.csv';
}
