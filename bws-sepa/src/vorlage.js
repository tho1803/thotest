/** Platzhalter der Verwendungszweck-Vorlage füllen. */

export const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

/**
 * @param {string} vorlage z. B. "Elternbeitrag {monat} {jahr} {kind}"
 * @param {object} mandat  Mandat mit kind, kontoinhaber, mandatsId
 * @param {string} termin  Fälligkeit als ISO-Datum; bestimmt Monat und Jahr
 */
export function fuelleVorlage(vorlage, mandat = {}, termin = '') {
  const datum = termin ? new Date(`${termin}T12:00:00`) : new Date();
  return String(vorlage ?? '')
    .replaceAll('{kind}', mandat.kind || '')
    .replaceAll('{name}', mandat.kontoinhaber || '')
    .replaceAll('{monat}', MONATE[datum.getMonth()])
    .replaceAll('{jahr}', String(datum.getFullYear()))
    .replaceAll('{mandat}', mandat.mandatsId || '')
    .replace(/\s+/g, ' ')
    .trim();
}
