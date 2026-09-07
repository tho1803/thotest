/**
 * Aus einem Paperless-Dokument ein SEPA-Mandat gewinnen.
 *
 * Zwei Wege, in dieser Reihenfolge:
 *   1. Custom Fields aus Paperless (gepflegt, verlässlich)
 *   2. Regeln auf dem OCR-Text (Rückfall, immer als "zu prüfen" markiert)
 *
 * Jedes Feld trägt seine Herkunft. Die Oberfläche macht daraus die
 * Unterscheidung zwischen "übernommen" und "bitte am Beleg prüfen".
 */

import { pruefeIban, pruefeBic, normalisiereIban, bicPasstZuIban, IBAN_LAENGEN } from './iban.js';
import { pruefeMandatsreferenz } from './sepa-text.js';

/** Standardzuordnung Paperless-Custom-Field → Mandatsfeld. Anpassbar in der Oberfläche. */
export const STANDARD_FELDZUORDNUNG = {
  kontoinhaber: ['Kontoinhaber', 'Zahlungspflichtiger', 'Kontoinhaber*in'],
  iban: ['IBAN'],
  bic: ['BIC'],
  mandatsId: ['Mandatsreferenz', 'Mandats-ID', 'Mandatsnummer'],
  mandatsDatum: ['Mandatsdatum', 'Unterschriftsdatum', 'Datum Mandat'],
  kind: ['Kind', 'Schüler*in', 'Teilnehmer*in', 'Name des Kindes'],
  betrag: ['Betrag', 'Monatsbeitrag', 'Elternbeitrag']
};

const DATUM = /\b(\d{1,2})\s*[.\/]\s*(\d{1,2})\s*[.\/]\s*(\d{2,4})\b/g;
// Bewusst nur echte Leerzeichen als Trenner (kein \s): ein Zeilenumbruch
// beendet die IBAN, sonst zieht das Muster das nächste Wort mit hinein.
const IBAN_KANDIDAT = /\b([A-Z]{2})(\d{2})((?:[ ]?[A-Z0-9]){8,34})/g;
const BIC_MIT_KONTEXT = /BIC[^A-Z0-9]{0,20}([A-Z]{6}[A-Z0-9]{2}(?:[A-Z0-9]{3})?)\b/i;
const BIC_FREI = /\b([A-Z]{6}[A-Z0-9]{2}(?:[A-Z0-9]{3})?)\b/g;
const MANDATS_ID = /Mandat(?:s)?(?:referenz|[-\s]?referenz|nummer|[-\s]?ID|[-\s]?Nr\.?)\s*[:\-]?\s*([A-Za-z0-9][A-Za-z0-9\/\-?:().,'+]{2,34})/i;
const KONTOINHABER = /Kontoinhaber(?:in|\*in)?\s*(?:\(.*?\))?\s*[:\-]?\s*([^\n\r]{3,70})/i;
const DATUM_MIT_KONTEXT = /(?:Ort,?\s*Datum|Datum,?\s*Unterschrift|Unterschrift|Datum)\s*[:\-]?\s*[^\n\r]{0,40}?(\d{1,2}\s*[.\/]\s*\d{1,2}\s*[.\/]\s*\d{2,4})/i;

/** Wandelt ein deutsches Datum in ein ISO-Datum (JJJJ-MM-TT). */
export function zuIsoDatum(wert) {
  if (!wert) return '';
  const text = String(wert).trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const de = text.match(/^(\d{1,2})\s*[.\/]\s*(\d{1,2})\s*[.\/]\s*(\d{2,4})/);
  if (!de) return '';
  let [, tag, monat, jahr] = de;
  if (jahr.length === 2) jahr = Number(jahr) > 70 ? `19${jahr}` : `20${jahr}`;
  return `${jahr}-${String(monat).padStart(2, '0')}-${String(tag).padStart(2, '0')}`;
}

/** Wandelt ein ISO-Datum in das von windata erwartete TT.MM.JJJJ. */
export function zuDeutschemDatum(isoDatum) {
  const treffer = String(isoDatum ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!treffer) return '';
  return `${treffer[3]}.${treffer[2]}.${treffer[1]}`;
}

/** Liest einen Geldbetrag aus beliebigem Text ("42,50 €", "42.50") als Zahl. */
export function zuBetrag(wert) {
  if (typeof wert === 'number') return Number.isFinite(wert) ? wert : null;
  const text = String(wert ?? '').replace(/[^\d,.\-]/g, '');
  if (!text) return null;
  // Letztes Trennzeichen entscheidet über die Dezimalstelle.
  const komma = text.lastIndexOf(',');
  const punkt = text.lastIndexOf('.');
  let normalisiert = text;
  if (komma > punkt) normalisiert = text.replace(/\./g, '').replace(',', '.');
  else if (punkt > komma) normalisiert = text.replace(/,/g, '');
  const zahl = Number.parseFloat(normalisiert);
  return Number.isFinite(zahl) ? zahl : null;
}

/** Baut aus der Paperless-Feldliste eine Zuordnung Feld-ID → Feldname. */
export function baueFeldIndex(customFieldsDefinition = []) {
  const index = new Map();
  for (const feld of customFieldsDefinition) index.set(feld.id, feld.name);
  return index;
}

function customFeldWert(dokument, feldIndex, namen) {
  const gesucht = namen.map((n) => n.toLowerCase());
  for (const eintrag of dokument.custom_fields ?? []) {
    const name = feldIndex.get(eintrag.field);
    if (!name) continue;
    if (gesucht.includes(name.toLowerCase())) {
      const wert = eintrag.value;
      if (wert !== null && wert !== undefined && String(wert).trim() !== '') {
        return String(wert).trim();
      }
    }
  }
  return null;
}

function ersterGueltigerIban(text) {
  for (const treffer of String(text ?? '').toUpperCase().matchAll(IBAN_KANDIDAT)) {
    const [, land, pruefziffer, rest] = treffer;
    const sollLaenge = IBAN_LAENGEN[land];
    if (!sollLaenge) continue;
    const kompakt = `${land}${pruefziffer}${rest}`.replace(/ /g, '');
    if (kompakt.length < sollLaenge) continue;
    // Auf die Sollänge des Landes zuschneiden, damit ein direkt
    // anschließendes Wort ("...6986 00 Sparkasse") nicht stört.
    const pruefung = pruefeIban(kompakt.slice(0, sollLaenge));
    if (pruefung.gueltig) return pruefung.iban;
  }
  return null;
}

function findeBic(text) {
  const mitKontext = String(text ?? '').match(BIC_MIT_KONTEXT);
  if (mitKontext) return mitKontext[1].toUpperCase();
  // Ohne Kontext nur nehmen, wenn genau ein Kandidat im Text steht.
  const kandidaten = [...String(text ?? '').matchAll(BIC_FREI)].map((t) => t[1]);
  const eindeutig = [...new Set(kandidaten)];
  return eindeutig.length === 1 ? eindeutig[0] : null;
}

function findeMandatsDatum(text) {
  const mitKontext = String(text ?? '').match(DATUM_MIT_KONTEXT);
  if (mitKontext) return zuIsoDatum(mitKontext[1]);
  const alle = [...String(text ?? '').matchAll(DATUM)].map((t) => zuIsoDatum(t[0])).filter(Boolean);
  // Ohne Kontext: das späteste Datum im Beleg ist am ehesten die Unterschrift.
  return alle.length ? alle.sort().at(-1) : '';
}

/**
 * Wandelt ein Paperless-Dokument in ein Mandat um.
 * @param {object} dokument Paperless-Dokument (mit content und custom_fields)
 * @param {object} optionen { feldIndex: Map, zuordnung: object }
 */
export function extrahiereMandat(dokument, optionen = {}) {
  const feldIndex = optionen.feldIndex ?? new Map();
  const zuordnung = { ...STANDARD_FELDZUORDNUNG, ...(optionen.zuordnung ?? {}) };
  const text = dokument.content ?? '';

  const quelle = {};
  const fehler = [];    // blockierend: die Zeile kann so nicht eingezogen werden
  const hinweise = [];  // nicht blockierend: bitte am Beleg gegenlesen

  const hole = (schluessel, ausText) => {
    const ausFeld = customFeldWert(dokument, feldIndex, zuordnung[schluessel] ?? []);
    if (ausFeld) {
      quelle[schluessel] = 'feld';
      return ausFeld;
    }
    const gefunden = ausText ? ausText() : null;
    quelle[schluessel] = gefunden ? 'text' : 'fehlt';
    return gefunden ?? '';
  };

  const iban = normalisiereIban(hole('iban', () => ersterGueltigerIban(text)));
  const bic = String(hole('bic', () => findeBic(text)) ?? '').toUpperCase();
  const kontoinhaber = hole('kontoinhaber', () => {
    const treffer = text.match(KONTOINHABER);
    if (treffer) return treffer[1].trim();
    return dokument.correspondent_name ?? null;
  });
  const mandatsId = hole('mandatsId', () => {
    const treffer = text.match(MANDATS_ID);
    return treffer ? treffer[1].trim() : null;
  });
  const mandatsDatum = zuIsoDatum(hole('mandatsDatum', () => findeMandatsDatum(text)));
  const kind = hole('kind', () => null);
  const betrag = zuBetrag(hole('betrag', () => null));

  const ibanPruefung = pruefeIban(iban);
  if (!ibanPruefung.gueltig) fehler.push(ibanPruefung.fehler);

  const bicPruefung = pruefeBic(bic);
  if (!bicPruefung.gueltig) fehler.push(bicPruefung.fehler);
  else if (bic && !bicPasstZuIban(bic, iban)) {
    hinweise.push('BIC und IBAN gehören zu verschiedenen Ländern');
  }

  if (!kontoinhaber) fehler.push('Kontoinhaber*in fehlt');
  if (!mandatsId) fehler.push('Mandatsreferenz fehlt');
  if (!mandatsDatum) fehler.push('Mandatsdatum fehlt');
  else if (mandatsDatum > new Date().toISOString().slice(0, 10)) {
    hinweise.push('Mandatsdatum liegt in der Zukunft');
  }

  // Aus dem OCR-Text gelesene Angaben sind brauchbar, aber nicht bestätigt.
  // Sie blockieren den Einzug nicht — sie gehören vor dem Lauf gegengelesen.
  const ausText = ['iban', 'mandatsId', 'mandatsDatum']
    .filter((schluessel) => quelle[schluessel] === 'text');
  if (ausText.length) {
    hinweise.push(`aus der Texterkennung gelesen: ${ausText.join(', ')} — am Beleg prüfen`);
  }

  return {
    dokumentId: dokument.id ?? null,
    titel: dokument.title ?? '',
    kontoinhaber: kontoinhaber || '',
    kind: kind || '',
    iban: ibanPruefung.gueltig ? ibanPruefung.iban : iban,
    bic,
    mandatsId: mandatsId || '',
    mandatsDatum,
    betrag,
    sequenz: 'RCUR',
    quelle,
    fehler,
    hinweise,
    // Alles, was der Prüfung auffiel — für Anzeigen, die nicht unterscheiden.
    warnungen: [...fehler, ...hinweise],
    // Ohne blockierenden Fehler kann die Zeile in den Lauf.
    uebernehmen: fehler.length === 0,
    // Nichts zu prüfen und nichts zu beanstanden.
    einwandfrei: fehler.length === 0 && hinweise.length === 0
  };
}

/**
 * Baut ein Mandat aus Werten, die bereits strukturiert vorliegen — also aus
 * einem digital ausgefüllten Formular. Hier gibt es nichts zu raten: Was
 * fehlt oder nicht stimmt, ist ein Fehler, kein Prüfhinweis.
 */
export function mandatAusStrukturiertenFeldern(dokument, roh) {
  const fehler = [];
  const hinweise = [];

  const ibanPruefung = pruefeIban(roh.iban);
  if (!ibanPruefung.gueltig) fehler.push(ibanPruefung.fehler);

  const bicPruefung = pruefeBic(roh.bic);
  if (!bicPruefung.gueltig) fehler.push(bicPruefung.fehler);
  else if (roh.bic && !bicPasstZuIban(roh.bic, roh.iban)) {
    hinweise.push('BIC und IBAN gehören zu verschiedenen Ländern');
  }

  if (!roh.kontoinhaber) fehler.push('Kontoinhaber*in fehlt');

  // Der Unterstrich aus dem alten Schema wird ersetzt, nicht bemängelt:
  // BWS_Meier-Lea und BWS-Meier-Lea meinen dasselbe Mandat, und nur die
  // zweite Form übersteht den SEPA-Zeichensatz unverändert.
  const mandatsId = String(roh.mandatsId ?? '').replace(/_/g, '-');
  if (!mandatsId) fehler.push('Mandatsreferenz fehlt');
  else {
    if (mandatsId !== roh.mandatsId) {
      hinweise.push(`Unterstrich in der Mandatsreferenz durch Bindestrich ersetzt: ${mandatsId}`);
    }
    const referenz = pruefeMandatsreferenz(mandatsId);
    if (!referenz.unveraendert) {
      hinweise.push(
        `Mandatsreferenz enthält ${referenz.ersetzt.join(' ')} — im SEPA-Zeichensatz nicht zulässig, ` +
        `in der Datei steht "${referenz.sepaForm}"`
      );
    }
  }

  const mandatsDatum = zuIsoDatum(roh.mandatsDatum);
  if (!mandatsDatum) fehler.push('Mandatsdatum fehlt');
  else if (mandatsDatum > new Date().toISOString().slice(0, 10)) {
    hinweise.push('Mandatsdatum liegt in der Zukunft');
  }

  return {
    dokumentId: dokument.id ?? null,
    titel: dokument.name ?? dokument.title ?? '',
    kontoinhaber: roh.kontoinhaber || '',
    kind: roh.kind || '',
    iban: ibanPruefung.gueltig ? ibanPruefung.iban : (roh.iban || ''),
    bic: bicPruefung.bic,
    mandatsId,
    mandatsDatum,
    betrag: zuBetrag(roh.betrag),
    sequenz: 'RCUR',
    quelle: { iban: 'feld', kontoinhaber: 'feld', mandatsId: 'feld', mandatsDatum: 'feld' },
    fehler,
    hinweise,
    warnungen: [...fehler, ...hinweise],
    uebernehmen: fehler.length === 0,
    einwandfrei: fehler.length === 0 && hinweise.length === 0
  };
}

/** Erkennt am Text, ob ein Dokument das SEPA-Formular der BildungsWerkstatt ist. */
export function istBwsFormular(text) {
  return /SEPA\s*-?\s*Lastschriftmandat/i.test(String(text ?? ''))
    && /BildungsWerkstatt|Gl[äa]ubiger\s*-?\s*Identifikationsnummer/i.test(String(text ?? ''));
}

/**
 * Wandelt ein Dokument in eine Liste von Mandaten.
 *
 * Ein eingescanntes Dokument enthält oft mehrere Mandate hintereinander.
 * Sind Custom Fields gepflegt, gilt der einfache Weg (ein Dokument, ein
 * Mandat); sonst greifen die Formularregeln, die den Scan zerlegen.
 */
export function extrahiereMandateAusDokument(dokument, optionen = {}) {
  const hatFelder = (dokument.custom_fields ?? []).length > 0;
  const text = dokument.content ?? '';

  // Mandate aus paperless.io haben ein festes Layout und digitalen Text —
  // sie werden mit eigenen Regeln gelesen, ohne Rekonstruktionsversuche.
  if (!hatFelder && optionen.ioMandat?.istIoMandat(text)) {
    const roh = optionen.ioMandat.leseIoMandat(text);
    return [vereineMitIoMandat(extrahiereMandat({ ...dokument, content: '' }, optionen), roh, dokument)];
  }

  if (hatFelder || !optionen.bwsFormular || !istBwsFormular(text)) {
    return [extrahiereMandat(dokument, optionen)];
  }

  const abschnitte = optionen.bwsFormular.leseBwsMandate(text);
  return abschnitte.map((roh, i) => {
    const teilDokument = {
      ...dokument,
      id: dokument.id,
      title: abschnitte.length > 1
        ? `${dokument.title ?? ''} (Mandat ${i + 1} von ${abschnitte.length})`
        : dokument.title,
      content: ''
    };
    const mandat = extrahiereMandat(teilDokument, optionen);
    return vereineMitFormular(mandat, roh);
  });
}

/**
 * Übernimmt die Werte eines paperless.io-Mandats.
 *
 * Der Text ist digital erzeugt, deshalb gilt hier: Was fehlt, fehlt
 * tatsächlich — es ist ein Fehler, kein Lesehinweis.
 */
function vereineMitIoMandat(mandat, roh, dokument) {
  const fehler = [];
  const hinweise = [...roh.hinweise];

  const ibanPruefung = pruefeIban(roh.iban);
  if (!ibanPruefung.gueltig) {
    fehler.push(roh.iban ? ibanPruefung.fehler : 'IBAN im Mandat nicht ausgefüllt');
  }
  if (!roh.kontoinhaber) fehler.push('Kontoinhaber*in fehlt');

  const mandatsId = String(roh.mandatsId ?? '').replace(/_/g, '-');
  if (!mandatsId) fehler.push('Mandatsreferenz fehlt');
  else if (mandatsId !== roh.mandatsId) {
    hinweise.push(`Unterstrich in der Mandatsreferenz durch Bindestrich ersetzt: ${mandatsId}`);
  }
  if (!roh.mandatsDatum) fehler.push('Mandatsdatum fehlt');

  if (roh.kreditinstitut) hinweise.push(`Kreditinstitut laut Mandat: ${roh.kreditinstitut}`);
  if (roh.glaeubigerId) hinweise.push(`Gläubiger-ID im Mandat: ${roh.glaeubigerId}`);

  return {
    ...mandat,
    titel: dokument.name ?? dokument.title ?? mandat.titel,
    kontoinhaber: roh.kontoinhaber,
    kind: roh.kind || mandat.kind,
    iban: ibanPruefung.gueltig ? ibanPruefung.iban : roh.iban,
    bic: roh.bic,
    mandatsId,
    mandatsDatum: roh.mandatsDatum,
    glaeubigerIdBeleg: roh.glaeubigerId,
    quelle: { iban: 'feld', kontoinhaber: 'feld', mandatsId: 'feld', mandatsDatum: 'feld' },
    fehler,
    hinweise,
    warnungen: [...fehler, ...hinweise],
    uebernehmen: fehler.length === 0,
    einwandfrei: fehler.length === 0 && hinweise.length === 0
  };
}

/** Übernimmt die Werte der Formularerkennung in ein Mandat. */
function vereineMitFormular(mandat, roh) {
  const ibanPruefung = pruefeIban(roh.iban);
  const fehler = [];
  const hinweise = [...roh.hinweise];

  if (!ibanPruefung.gueltig) fehler.push(ibanPruefung.fehler);
  if (!roh.kontoinhaber) fehler.push('Kontoinhaber*in fehlt');
  if (!roh.mandatsId) fehler.push('Mandatsreferenz fehlt');
  if (!roh.mandatsDatum) fehler.push('Mandatsdatum fehlt');
  if (roh.iban && !roh.ibanSicher) {
    hinweise.push(`IBAN im Beleg: ${roh.ibanRoh}`);
  }

  return {
    ...mandat,
    kontoinhaber: roh.kontoinhaber || mandat.kontoinhaber,
    kind: roh.kind || mandat.kind,
    iban: ibanPruefung.gueltig ? ibanPruefung.iban : roh.iban,
    bic: roh.bic || mandat.bic,
    mandatsId: roh.mandatsId || mandat.mandatsId,
    mandatsDatum: roh.mandatsDatum || mandat.mandatsDatum,
    glaeubigerIdBeleg: roh.glaeubigerId,
    ibanRoh: roh.ibanRoh,
    quelle: { ...mandat.quelle, iban: roh.ibanSicher ? 'text' : 'text-unsicher' },
    fehler,
    hinweise,
    warnungen: [...fehler, ...hinweise],
    uebernehmen: fehler.length === 0,
    einwandfrei: fehler.length === 0 && hinweise.length === 0
  };
}

/** Wandelt eine Liste Paperless-Dokumente um und sortiert nach Kontoinhaber. */
export function extrahiereMandate(dokumente, optionen = {}) {
  return dokumente
    .flatMap((d) => extrahiereMandateAusDokument(d, optionen))
    .sort((a, b) => a.kontoinhaber.localeCompare(b.kontoinhaber, 'de'));
}
