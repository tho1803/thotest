/**
 * IBAN- und BIC-Prüfung nach ISO 13616 / ISO 9362.
 * Läuft ohne Abhängigkeiten in Browser und Node.
 */

/** Sollängen der IBAN je Länderkennung (SEPA-Raum, Stand 2026). */
export const IBAN_LAENGEN = {
  AD: 24, AT: 20, BE: 16, BG: 22, CH: 21, CY: 28, CZ: 24, DE: 22, DK: 18,
  EE: 20, ES: 24, FI: 18, FR: 27, GB: 22, GI: 23, GR: 27, HR: 21, HU: 28,
  IE: 22, IS: 26, IT: 27, LI: 21, LT: 20, LU: 20, LV: 21, MC: 27, MT: 31,
  NL: 18, NO: 15, PL: 28, PT: 25, RO: 24, SE: 24, SI: 19, SK: 24, SM: 27,
  VA: 22
};

/** Entfernt Leerzeichen und Bindestriche, macht Großbuchstaben. */
export function normalisiereIban(wert) {
  return String(wert ?? '').replace(/[\s -]/g, '').toUpperCase();
}

/** Formatiert eine IBAN in Vierergruppen (nur für die Anzeige). */
export function formatiereIban(wert) {
  return normalisiereIban(wert).replace(/(.{4})/g, '$1 ').trim();
}

/**
 * Mod-97-10-Prüfung nach ISO 7064, stückweise gerechnet,
 * damit auch 34-stellige IBANs ohne BigInt sicher bleiben.
 */
function mod97(ziffernfolge) {
  let rest = 0;
  for (const zeichen of ziffernfolge) {
    rest = (rest * 10 + Number(zeichen)) % 97;
  }
  return rest;
}

/**
 * Prüft eine IBAN vollständig.
 * @returns {{gueltig: boolean, iban: string, land: string|null, fehler: string|null}}
 */
export function pruefeIban(wert) {
  const iban = normalisiereIban(wert);
  const ergebnis = { gueltig: false, iban, land: null, fehler: null };

  if (!iban) {
    ergebnis.fehler = 'IBAN fehlt';
    return ergebnis;
  }
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]+$/.test(iban)) {
    ergebnis.fehler = 'IBAN enthält unerlaubte Zeichen oder ist falsch aufgebaut';
    return ergebnis;
  }

  const land = iban.slice(0, 2);
  ergebnis.land = land;

  const sollLaenge = IBAN_LAENGEN[land];
  if (sollLaenge === undefined) {
    ergebnis.fehler = `Länderkennung ${land} gehört nicht zum SEPA-Raum`;
    return ergebnis;
  }
  if (iban.length !== sollLaenge) {
    ergebnis.fehler = `IBAN für ${land} muss ${sollLaenge} Zeichen haben, hat aber ${iban.length}`;
    return ergebnis;
  }

  const umgestellt = iban.slice(4) + iban.slice(0, 4);
  const ziffern = umgestellt.replace(/[A-Z]/g, (b) => String(b.charCodeAt(0) - 55));
  if (mod97(ziffern) !== 1) {
    ergebnis.fehler = 'Prüfziffer der IBAN stimmt nicht — vermutlich Tippfehler oder OCR-Fehler';
    return ergebnis;
  }

  ergebnis.gueltig = true;
  return ergebnis;
}

/** Prüft einen BIC (8 oder 11 Stellen). Leerer BIC gilt als zulässig (IBAN-only). */
export function pruefeBic(wert) {
  const bic = String(wert ?? '').replace(/\s/g, '').toUpperCase();
  if (!bic) return { gueltig: true, bic: '', fehler: null };
  if (!/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(bic)) {
    return { gueltig: false, bic, fehler: 'BIC muss 8 oder 11 Stellen haben (z. B. BFSWDE33MUE)' };
  }
  return { gueltig: true, bic, fehler: null };
}

/** Grobe Plausibilitätsprüfung: passt die Länderkennung des BIC zur IBAN? */
export function bicPasstZuIban(bic, iban) {
  const b = String(bic ?? '').toUpperCase();
  const i = normalisiereIban(iban);
  if (b.length < 6 || i.length < 2) return true;
  return b.slice(4, 6) === i.slice(0, 2);
}
