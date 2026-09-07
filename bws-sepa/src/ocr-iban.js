/**
 * IBAN aus schlecht erkanntem Formulartext gewinnen.
 *
 * Die Mandate der BildungsWerkstatt sind handschriftlich ausgefüllte,
 * gescannte Formulare. Die Texterkennung liefert dort Zeilen wie
 *   "DE 86/5001/0513/5442/0050/+0"  oder  "DE 13/1203100001001613115,16"
 * — Schrägstriche und Kommas als Kästchentrenner, dazu vertauschte Zeichen.
 *
 * Grundsatz dieses Moduls: Eine rekonstruierte IBAN wird niemals
 * stillschweigend übernommen. Die Prüfziffer trifft zufällig in etwa einem
 * von 97 Fällen zu — bei vielen Rekonstruktionsversuchen ist das kein
 * Beweis mehr. Deshalb gilt:
 *   - unverändert gültig  → sicher
 *   - genau eine Variante gültig → Vorschlag, ausdrücklich zu prüfen
 *   - mehrere Varianten gültig → kein Vorschlag, nur Meldung
 */

import { pruefeIban, IBAN_LAENGEN } from './iban.js';

/** Zeichen, die die Texterkennung regelmäßig verwechselt. */
const VERWECHSLUNGEN = {
  O: '0', Q: '0', D: '0', I: '1', L: '1', J: '1', S: '5', B: '8',
  G: '6', Z: '2', T: '7', A: '4', '+': '4', '?': '7', '!': '1'
};

/** Alles entfernen, was in einer IBAN nicht vorkommen kann. */
export function bereinige(text) {
  return String(text ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Ersetzt an einer Stelle ein verwechseltes Zeichen. */
function mitZiffern(kompakt, abStelle = 2) {
  const kopf = kompakt.slice(0, abStelle);
  const rest = [...kompakt.slice(abStelle)]
    .map((z) => (VERWECHSLUNGEN[z] !== undefined && /[A-Z+?!]/.test(z) ? VERWECHSLUNGEN[z] : z))
    .join('');
  return kopf + rest;
}

/**
 * Schneidet aus einer Zeile den Bereich ab dem Länderkürzel heraus.
 * Nimmt bis zu vier Zeichen mehr mit, als die IBAN lang sein darf —
 * so bleibt Raum für Zeichen, die die Texterkennung zu viel gelesen hat.
 */
function rohkandidaten(text) {
  const treffer = [];
  const zeilen = String(text ?? '').split(/\r?\n/);
  for (const zeile of zeilen) {
    const gross = zeile.toUpperCase();
    for (const start of [...gross.matchAll(/\b([A-Z]{2})\s*[0-9OISBGZ]/g)]) {
      const land = start[1];
      if (!IBAN_LAENGEN[land]) continue;
      const ab = gross.slice(start.index);
      const kompakt = bereinige(ab);
      const soll = IBAN_LAENGEN[land];
      if (kompakt.length < soll - 2) continue;

      // "DES ZAHLUNGSEMPFÄNGERS" beginnt auch mit DE + Buchstabe. Eine IBAN
      // besteht hinter der Länderkennung fast nur aus Ziffern — daran lässt
      // sich laufender Text aussortieren. Gemessen wird auf der Form, in der
      // typische Verwechslungen schon aufgelöst sind: ein Scan, der "0" als
      // "O" liest, ist deshalb noch keine Fließtextzeile.
      const kern = mitZiffern(kompakt).slice(2, soll + 2);
      const ziffern = (kern.match(/[0-9]/g) ?? []).length;
      if (ziffern / kern.length < 0.6) continue;

      treffer.push({ land, roh: ab.trim(), kompakt, ziffernAnteil: ziffern / kern.length });
    }
  }
  // Der ziffernreichste Kandidat ist am ehesten die IBAN.
  return treffer.sort((a, b) => b.ziffernAnteil - a.ziffernAnteil);
}

/**
 * Erzeugt Varianten eines zu langen Kandidaten, indem je ein Zeichen
 * entfernt wird. Bei mehr als zwei überzähligen Zeichen wird nicht
 * mehr geraten — dann ist der Scan zu schlecht.
 */
function kuerzungen(kompakt, sollLaenge) {
  const zuviel = kompakt.length - sollLaenge;
  if (zuviel <= 0) return [kompakt];
  if (zuviel > 2) return [];
  const varianten = new Set();
  if (zuviel === 1) {
    for (let i = 2; i < kompakt.length; i += 1) {
      varianten.add(kompakt.slice(0, i) + kompakt.slice(i + 1));
    }
  } else {
    for (let i = 2; i < kompakt.length; i += 1) {
      for (let j = i + 1; j < kompakt.length; j += 1) {
        varianten.add(kompakt.slice(0, i) + kompakt.slice(i + 1, j) + kompakt.slice(j + 1));
      }
    }
  }
  return [...varianten];
}

/**
 * Sucht die IBAN in einem Formulartext.
 * @returns {{iban:string, sicher:boolean, roh:string, mehrdeutig:boolean, hinweis:string}|null}
 */
export function findeIbanImFormular(text) {
  const kandidaten = rohkandidaten(text);
  if (!kandidaten.length) return null;

  // 1. Der einfache Fall: irgendwo steht eine unbeschädigte IBAN.
  for (const kandidat of kandidaten) {
    const soll = IBAN_LAENGEN[kandidat.land];
    if (kandidat.kompakt.length >= soll) {
      const genau = pruefeIban(kandidat.kompakt.slice(0, soll));
      if (genau.gueltig) {
        return {
          iban: genau.iban, sicher: true, roh: kandidat.roh,
          mehrdeutig: false, hinweis: ''
        };
      }
    }
  }

  // 2. Rekonstruktion: verwechselte Zeichen ersetzen, Überzähliges entfernen.
  const gefunden = new Set();
  let rohZurBesten = '';
  for (const kandidat of kandidaten) {
    const soll = IBAN_LAENGEN[kandidat.land];
    for (const grundform of [kandidat.kompakt, mitZiffern(kandidat.kompakt)]) {
      for (const variante of kuerzungen(grundform, soll)) {
        if (variante.length !== soll) continue;
        if (pruefeIban(variante).gueltig) {
          gefunden.add(variante);
          if (!rohZurBesten) rohZurBesten = kandidat.roh;
        }
      }
    }
  }

  if (gefunden.size === 1) {
    return {
      iban: [...gefunden][0],
      sicher: false,
      roh: rohZurBesten,
      mehrdeutig: false,
      hinweis: 'IBAN aus einem beschädigten Scan rekonstruiert — zwingend am Beleg prüfen'
    };
  }
  if (gefunden.size > 1) {
    return {
      iban: '',
      sicher: false,
      roh: kandidaten[0].roh,
      mehrdeutig: true,
      hinweis: `Der Scan lässt ${gefunden.size} verschiedene gültige IBANs zu — von Hand erfassen`
    };
  }
  return {
    iban: '',
    sicher: false,
    roh: kandidaten[0].roh,
    mehrdeutig: false,
    hinweis: 'IBAN im Scan nicht lesbar — von Hand erfassen'
  };
}

/** Räumt einen aus dem Scan gelesenen BIC auf ("DK: BYLADEM, 1001" → "BYLADEM1001"). */
export function findeBicImFormular(text) {
  const zeilen = String(text ?? '').split(/\r?\n/);
  for (let i = 0; i < zeilen.length; i += 1) {
    const zeile = zeilen[i];
    // Der BIC steht entweder hinter "BIC" oder in der Zeile über "Kreditinstitut".
    // Der BIC steht entweder in einer Zeile, die ihn benennt, oder direkt
    // über dem Vordruck "Kreditinstitut (Name und BIC)".
    const benannt = /BIC/i.test(zeile);
    const ueberVordruck = /Kreditinstitut/i.test(zeilen[i + 1] ?? '');
    if (!benannt && !ueberVordruck) continue;

    // Fließtext ausschließen: aus "von meinem/unserem Konto mittels …" lässt
    // sich zufällig ein formal gültiger BIC schneiden. Ein falscher BIC ist
    // schlimmer als gar keiner — bei deutschen IBANs ist er entbehrlich.
    if (zeile.trim().split(/\s+/).length > 5) continue;
    // Der Vordrucktext selbst ("Kreditinstitut (Name und BIC)") ergibt sonst
    // Fenster wie "KREDITINSTI", die formal als BIC durchgehen.
    const ohneVordruck = zeile
      .replace(/Kreditinstitut(?:s|e)?/gi, ' ')
      .replace(/Name\s+(?:und|des)/gi, ' ')
      .replace(/BIC/gi, ' ');
    const kompakt = ohneVordruck.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const funde = [];
    for (const laenge of [11, 8]) {
      for (let start = 0; start + laenge <= kompakt.length; start += 1) {
        const stueck = kompakt.slice(start, start + laenge);
        if (!/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(stueck)) continue;
        // Stelle 5 und 6 tragen die Länderkennung. Ohne diese Prüfung hält
        // das Muster auch Fließtext wie "VONMEINEMUN" für einen BIC.
        if (!IBAN_LAENGEN[stueck.slice(4, 6)]) continue;
        funde.push(stueck);
      }
    }
    // Ein Fenster kann sich um eine Stelle verschieben ("DKBYLADEM1001"
    // enthält auch das scheinbar gültige "KBYLADEM100"). Deutsche Institute
    // sind hier der Regelfall, deshalb haben sie Vorrang.
    const deutsch = funde.filter((b) => b.slice(4, 6) === 'DE');
    if (deutsch.length) return deutsch.sort((a, b) => b.length - a.length)[0];
    if (funde.length) return funde.sort((a, b) => b.length - a.length)[0];
  }
  return '';
}
