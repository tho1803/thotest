/**
 * Regeln für die SEPA-Mandate der BildungsWerkstatt.
 *
 * Es gibt zwei Formularvarianten:
 *   a) Anlage 1 des Betreuungsvertrags  ("Kontoinhaber/in:", "Kreditinstitut (Name und BIC)")
 *   b) Anmeldung zum Mittagessen        ("BIC:", "IBAN:", zusätzlich E-Mail)
 * Beide tragen dieselbe Gläubiger-Identifikationsnummer und dasselbe
 * Referenzschema. Ein eingescanntes Dokument enthält oft mehrere Mandate
 * hintereinander — deshalb wird der Text zuerst zerlegt.
 */

import { findeIbanImFormular, findeBicImFormular } from './ocr-iban.js';
import { zuIsoDatum } from './mandate.js';

/** Gläubiger-Identifikationsnummer der BildungsWerkstatt e.V. */
export const GLAEUBIGER_ID = 'DE82BWS00002311070';

/** So sind die Mandatsreferenzen der BildungsWerkstatt aufgebaut. */
export const REFERENZ_SCHEMA = 'BWS_{nachname}-{vorname}';

const MANDATS_BEGINN = /SEPA\s*-?\s*Lastschriftmandat\s+einer\s+wiederkehrenden\s+Lastschrift/gi;
const KONTOINHABER = /Kontoinhaber\/?(?:in|\*in)?\s*:?\s*_*\s*([^\n\r]{2,70})/i;
const KIND_MIT_KLAMMER = /([^\n\r]{3,80})\r?\n\s*\(\s*Vorname,\s*Name/i;
const DATUM_ZEILE = /(?:Ort,\s*Datum|Ort\s*,\s*Datum)[^\n\r]{0,40}/i;
const DATUM = /(\d{1,2})\s*[.\/]\s*(\d{1,2})\s*[.\/]\s*(\d{2,4})/g;

/**
 * Zerlegt den Text eines Dokuments in einzelne Mandate.
 * Enthält das Dokument keinen Trenner, gilt der ganze Text als ein Mandat.
 */
export function teileMandate(text) {
  const inhalt = String(text ?? '');
  const stellen = [...inhalt.matchAll(MANDATS_BEGINN)].map((t) => t.index);
  if (stellen.length <= 1) return [inhalt];

  const abschnitte = [];
  for (let i = 0; i < stellen.length; i += 1) {
    const von = stellen[i];
    const bis = i + 1 < stellen.length ? stellen[i + 1] : inhalt.length;
    abschnitte.push(inhalt.slice(von, bis));
  }
  return abschnitte;
}

/** Räumt einen aus dem Formular gelesenen Namen auf. */
function saubereZeile(wert) {
  return String(wert ?? '')
    .replace(/[\\_|]+/g, ' ')
    .replace(/\((?:V)?orname[^)]*\)/gi, '')
    .replace(/Vorname und Name/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .replace(/^[.,;:\-\s]+|[.,;:\-\s]+$/g, '');
}

/** Sucht das Unterschriftsdatum in der Nähe der Zeile "Ort, Datum". */
function findeUnterschriftsdatum(abschnitt) {
  const zeilen = abschnitt.split(/\r?\n/);
  for (let i = 0; i < zeilen.length; i += 1) {
    if (!DATUM_ZEILE.test(zeilen[i])) continue;
    // Das Datum steht in derselben Zeile oder in einer der beiden davor.
    for (const zeile of [zeilen[i], zeilen[i - 1] ?? '', zeilen[i - 2] ?? '']) {
      const treffer = [...zeile.matchAll(DATUM)];
      if (treffer.length) return zuIsoDatum(treffer.at(-1)[0]);
    }
  }
  const alle = [...abschnitt.matchAll(DATUM)].map((t) => zuIsoDatum(t[0])).filter(Boolean);
  return alle.length ? alle.sort().at(-1) : '';
}

/**
 * Bildet die Mandatsreferenz nach dem Schema der BildungsWerkstatt.
 * @param {string} kind  "Nachname, Vorname" oder "Vorname Nachname"
 */
export function bildeMandatsreferenz(kind, schema = REFERENZ_SCHEMA) {
  const text = saubereZeile(kind);
  if (!text) return '';

  let nachname = '';
  let vorname = '';
  if (text.includes(',')) {
    // "VAN BUGGENUM, Noah" — vor dem Komma steht der Nachname.
    const [links, rechts = ''] = text.split(',');
    nachname = links.trim();
    vorname = rechts.trim().split(/\s+/)[0] ?? '';
  } else {
    const teile = text.split(/\s+/).filter(Boolean);
    vorname = teile[0] ?? '';
    nachname = teile.length > 1 ? teile.at(-1) : '';
  }

  const sauber = (wert) => wert.replace(/[^A-Za-zÄÖÜäöüß-]/g, '');
  return schema
    .replaceAll('{nachname}', sauber(nachname))
    .replaceAll('{vorname}', sauber(vorname))
    .replace(/[-_]{2,}/g, '-')
    .replace(/[-_]$/, '');
}

/**
 * Liest ein einzelnes Mandat aus dem Abschnitt eines Formulars.
 * @returns {object} Rohwerte samt Herkunft und Befunden
 */
export function leseBwsMandat(abschnitt, laufendeNummer = 1) {
  const hinweise = [];

  const inhaberTreffer = abschnitt.match(KONTOINHABER);
  const kontoinhaber = saubereZeile(inhaberTreffer?.[1] ?? '');

  const kindTreffer = abschnitt.match(KIND_MIT_KLAMMER);
  const kind = saubereZeile(kindTreffer?.[1] ?? '');

  const ibanFund = findeIbanImFormular(abschnitt);
  if (ibanFund?.hinweis) hinweise.push(ibanFund.hinweis);

  const bic = findeBicImFormular(abschnitt);
  const mandatsDatum = findeUnterschriftsdatum(abschnitt);

  const mandatsId = bildeMandatsreferenz(kind);
  if (mandatsId) {
    hinweise.push('Mandatsreferenz nach Schema gebildet — mit der Buchhaltung abgleichen');
  }

  const glaeubigerTreffer = abschnitt.match(/Gl[äa]ubiger\s*-?\s*Identifikationsnummer:?\s*([A-Z0-9]{10,35})/i);

  return {
    nummer: laufendeNummer,
    kontoinhaber,
    kind,
    iban: ibanFund?.iban ?? '',
    ibanSicher: Boolean(ibanFund?.sicher),
    ibanRoh: ibanFund?.roh ?? '',
    bic,
    mandatsId,
    mandatsDatum,
    glaeubigerId: (glaeubigerTreffer?.[1] ?? '').toUpperCase(),
    hinweise
  };
}

/** Liest alle Mandate aus dem Text eines Dokuments. */
export function leseBwsMandate(text) {
  return teileMandate(text).map((abschnitt, i) => leseBwsMandat(abschnitt, i + 1));
}
