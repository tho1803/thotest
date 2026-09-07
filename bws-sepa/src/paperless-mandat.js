/**
 * Liest ein SEPA-Mandat aus dem Text eines paperless.io-Dokuments.
 *
 * Anders als bei eingescannter Handschrift ist dieser Text digital erzeugt
 * und damit verlässlich. Das Layout folgt einem festen Muster: Auf eine
 * Beschriftung folgt ihr Wert — entweder hinter einem Doppelpunkt in
 * derselben Zeile oder in der Zeile darunter.
 *
 * Die versiegelte Fassung enthält zusätzlich den Prüfpfad. Dort steht, wer
 * das Dokument ausgefüllt und unterschrieben hat — das ist der Kontoinhaber,
 * solange kein abweichender genannt ist.
 *
 * Nicht ablesbar sind Ankreuzfelder: "Wiederkehrende Zahlungen" und
 * "Einmalige Zahlung" erscheinen beide im Text, das Kreuz nicht. Die Sequenz
 * wird deshalb in der Oberfläche gesetzt.
 */

import { pruefeIban, pruefeBic, normalisiereIban } from './iban.js';
import { zuIsoDatum } from './mandate.js';

/** Beschriftungen, die im Formular vorkommen und nie ein Wert sind. */
const BESCHRIFTUNGEN = [
  /^IBAN$/i, /^BIC$/i, /^Bankverbindung$/i,
  /^Kreditinstitut/i, /^Name des abweichenden Kontoinhabers$/i,
  /^Wiederkehrende Zahlungen/i, /^Einmalige Zahlung/i,
  /^Gläubiger/i, /^Mandatsreferenz/i, /^Zahlungsempfänger/i,
  /^Datum:/i, /^Ort:/i, /^SEPA/i, /^AUDIT TRAIL$/i, /^Hinweis:/i
];

function istBeschriftung(zeile) {
  return BESCHRIFTUNGEN.some((muster) => muster.test(zeile.trim()));
}

/** Sucht den Wert zu einer Beschriftung: hinter dem Doppelpunkt oder darunter. */
function wertZu(zeilen, muster) {
  for (let i = 0; i < zeilen.length; i += 1) {
    const zeile = zeilen[i].trim();
    if (!muster.test(zeile)) continue;

    // Fall 1: "Mandatsreferenz: BWS-Meier-Lea"
    const hinterDoppelpunkt = zeile.split(/:\s*/).slice(1).join(': ').trim();
    if (hinterDoppelpunkt) return hinterDoppelpunkt;

    // Fall 2: Der Wert steht in der nächsten Zeile, sofern das keine
    // weitere Beschriftung ist (dann wurde das Feld nicht ausgefüllt).
    const naechste = (zeilen[i + 1] ?? '').trim();
    if (naechste && !istBeschriftung(naechste)) return naechste;
    return '';
  }
  return '';
}

/**
 * Liest aus dem Prüfpfad, wer ausgefüllt und unterschrieben hat.
 * Aufbau dort:  "Name (mail@example.org)" / "Rolle: Empfänger (…)"
 */
export function findeUnterzeichner(text) {
  const zeilen = String(text ?? '').split(/\r?\n/);
  for (let i = 0; i < zeilen.length; i += 1) {
    if (!/^Rolle:\s*Empfänger/i.test(zeilen[i].trim())) continue;
    const davor = (zeilen[i - 1] ?? '').trim();
    const treffer = davor.match(/^(.+?)\s*\(([^)]+@[^)]+)\)$/);
    if (treffer) return { name: treffer[1].trim(), email: treffer[2].trim() };
    if (davor && !istBeschriftung(davor)) return { name: davor, email: '' };
  }
  return { name: '', email: '' };
}

/**
 * Liest ein Mandat aus dem Text eines paperless.io-Dokuments.
 * @returns {object} Rohwerte samt Befunden
 */
export function leseIoMandat(text) {
  const zeilen = String(text ?? '').split(/\r?\n/);
  const hinweise = [];

  const glaeubigerId = wertZu(zeilen, /^Gläubiger\s*-?\s*Identifikationsnummer/i).replace(/\s/g, '');
  const mandatsId = wertZu(zeilen, /^Mandatsreferenz/i);
  const ibanRoh = wertZu(zeilen, /^IBAN$/i);
  const bicRoh = wertZu(zeilen, /^BIC$/i);
  const kreditinstitut = wertZu(zeilen, /^Kreditinstitut/i);
  const abweichend = wertZu(zeilen, /^Name des abweichenden Kontoinhabers$/i);
  const ort = wertZu(zeilen, /^Ort:/i);
  const datum = zuIsoDatum(wertZu(zeilen, /^Datum:/i));

  const unterzeichner = findeUnterzeichner(text);
  // Ohne abweichenden Kontoinhaber ist es die Person, die unterschrieben hat.
  const kontoinhaber = abweichend || unterzeichner.name;
  if (!abweichend && unterzeichner.name) {
    hinweise.push('Kontoinhaber aus der Unterschrift übernommen — kein abweichender Name im Mandat');
  }

  const iban = normalisiereIban(ibanRoh);
  const ibanPruefung = pruefeIban(iban);
  const bic = String(bicRoh ?? '').replace(/\s/g, '').toUpperCase();
  const bicPruefung = pruefeBic(bic);

  return {
    kontoinhaber,
    unterzeichnerEmail: unterzeichner.email,
    kind: '',
    iban: ibanPruefung.gueltig ? ibanPruefung.iban : iban,
    ibanSicher: ibanPruefung.gueltig,
    ibanRoh,
    bic: bicPruefung.gueltig ? bicPruefung.bic : '',
    kreditinstitut,
    mandatsId,
    mandatsDatum: datum,
    ort,
    glaeubigerId,
    hinweise
  };
}

/** Erkennt am Text, ob es ein Mandat aus paperless.io ist. */
export function istIoMandat(text) {
  const inhalt = String(text ?? '');
  return /SEPA\s*-?\s*Basislastschrift\s*-?\s*Mandat|SEPA-Lastschriftmandat/i.test(inhalt)
    && /Gläubiger\s*-?\s*Identifikationsnummer/i.test(inhalt)
    && /^IBAN$/im.test(inhalt);
}
