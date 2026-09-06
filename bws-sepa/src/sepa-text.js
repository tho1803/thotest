/**
 * Zeichensatz für SEPA-Zahlungsverkehr.
 *
 * Der SEPA-Basiszeichensatz (EPC217-08) erlaubt nur:
 *   a-z A-Z 0-9 / - ? : ( ) . , ' + und das Leerzeichen.
 * Umlaute und ß werden umgeschrieben, alles andere wird zu einem Leerzeichen.
 * Damit ist die Ausgabedatei reines ASCII — Encoding-Probleme beim Import
 * in windata können gar nicht erst entstehen.
 */

const ERSETZUNGEN = {
  'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'Ä': 'Ae', 'Ö': 'Oe', 'Ü': 'Ue', 'ß': 'ss',
  'à': 'a', 'á': 'a', 'â': 'a', 'ã': 'a', 'å': 'a', 'æ': 'ae',
  'è': 'e', 'é': 'e', 'ê': 'e', 'ë': 'e',
  'ì': 'i', 'í': 'i', 'î': 'i', 'ï': 'i',
  'ò': 'o', 'ó': 'o', 'ô': 'o', 'õ': 'o', 'ø': 'o',
  'ù': 'u', 'ú': 'u', 'û': 'u',
  'ç': 'c', 'ñ': 'n', 'ý': 'y', 'ÿ': 'y',
  'À': 'A', 'Á': 'A', 'Â': 'A', 'Ã': 'A', 'Å': 'A', 'Æ': 'Ae',
  'È': 'E', 'É': 'E', 'Ê': 'E', 'Ë': 'E',
  'Ì': 'I', 'Í': 'I', 'Î': 'I', 'Ï': 'I',
  'Ò': 'O', 'Ó': 'O', 'Ô': 'O', 'Õ': 'O', 'Ø': 'O',
  'Ù': 'U', 'Ú': 'U', 'Û': 'U',
  'Ç': 'C', 'Ñ': 'N', 'Ý': 'Y',
  '„': '', '“': '', '”': '', '‚': "'", '‘': "'", '’': "'",
  '–': '-', '—': '-', '…': '...', '€': 'EUR', '&': 'und', '"': ''
};

const ERLAUBT = /[^A-Za-z0-9/?:().,'+\- ]/g;

/** Schreibt einen Text in den SEPA-Basiszeichensatz um. */
export function sepaText(wert) {
  let text = String(wert ?? '');
  text = text.replace(/[^\x00-\x7F]|["&]/g, (z) => (z in ERSETZUNGEN ? ERSETZUNGEN[z] : z));
  text = text.replace(ERLAUBT, ' ');
  return text.replace(/\s+/g, ' ').trim();
}

/** Kürzt auf die zulässige Feldlänge (ohne Wort mittendrin zu zerreißen, wenn möglich). */
export function kuerze(wert, laenge) {
  const text = String(wert ?? '');
  if (text.length <= laenge) return text;
  const hart = text.slice(0, laenge);
  const letzteLuecke = hart.lastIndexOf(' ');
  return letzteLuecke > laenge * 0.6 ? hart.slice(0, letzteLuecke) : hart;
}

/** SEPA-konform umschreiben und auf Feldlänge kürzen. */
export function feld(wert, laenge) {
  return kuerze(sepaText(wert), laenge);
}

/** Zerlegt einen Verwendungszweck in n Zeilen à 27 Zeichen (windata-Format). */
export function verwendungszweckZeilen(text, maxZeilen = 14, zeilenLaenge = 27) {
  const sauber = sepaText(text);
  if (!sauber) return [];
  const woerter = sauber.split(' ');
  const zeilen = [];
  let aktuell = '';

  for (const wort of woerter) {
    const kandidat = aktuell ? `${aktuell} ${wort}` : wort;
    if (kandidat.length <= zeilenLaenge) {
      aktuell = kandidat;
      continue;
    }
    if (aktuell) zeilen.push(aktuell);
    // Einzelwort länger als eine Zeile: hart umbrechen.
    let rest = wort;
    while (rest.length > zeilenLaenge) {
      zeilen.push(rest.slice(0, zeilenLaenge));
      rest = rest.slice(zeilenLaenge);
    }
    aktuell = rest;
  }
  if (aktuell) zeilen.push(aktuell);
  return zeilen.slice(0, maxZeilen);
}
