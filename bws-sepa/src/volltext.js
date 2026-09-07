/**
 * Volltextsuche über den Dokumentenbestand.
 *
 * paperless.io durchsucht nur Dokumentnamen — "Kreditbank" oder eine IBAN
 * findet es nicht, obwohl beides im Dokument steht. Weil der Helfer ohnehin
 * jeden PDF-Text ausliest, lässt sich daraus ein eigener Index bauen, der
 * über die Inhalte geht.
 *
 * Der Index bleibt auf dem Rechner des Vereins. Er enthält Bankdaten und
 * gehört weder in eine Cloud noch in die Versionsverwaltung.
 */

/** Zerlegt Text in Suchbegriffe. Umlaute bleiben, Satzzeichen fallen weg. */
export function zerlege(text) {
  return String(text ?? '')
    .toLowerCase()
    .split(/[^a-z0-9äöüß]+/i)
    .filter((wort) => wort.length >= 2);
}

/**
 * Baut den Index auf.
 * @param {Array} dokumente Dokumente mit content, title, state, vorlage, created
 */
export function baueIndex(dokumente) {
  const eintraege = dokumente.map((d, nummer) => ({
    nummer,
    id: d.id,
    titel: d.title ?? d.name ?? '',
    zustand: d.state ?? '',
    vorlage: d.vorlage ?? '',
    erstellt: d.created ?? '',
    text: d.content ?? '',
    worte: new Set([...zerlege(d.content), ...zerlege(d.title ?? d.name ?? '')])
  }));
  return { eintraege, gebautAm: new Date().toISOString() };
}

/** Findet die Fundstellen eines Begriffs im Text, mit Umgebung. */
export function fundstellen(text, begriff, umfeld = 60, hoechstens = 3) {
  const inhalt = String(text ?? '');
  const gesucht = String(begriff ?? '').toLowerCase();
  if (!gesucht) return [];

  const treffer = [];
  let ab = 0;
  for (;;) {
    const stelle = inhalt.toLowerCase().indexOf(gesucht, ab);
    if (stelle < 0 || treffer.length >= hoechstens) break;
    const von = Math.max(0, stelle - umfeld);
    const bis = Math.min(inhalt.length, stelle + gesucht.length + umfeld);
    treffer.push({
      vor: (von > 0 ? '… ' : '') + inhalt.slice(von, stelle).replace(/\s+/g, ' '),
      wort: inhalt.slice(stelle, stelle + gesucht.length),
      nach: inhalt.slice(stelle + gesucht.length, bis).replace(/\s+/g, ' ') + (bis < inhalt.length ? ' …' : '')
    });
    ab = stelle + gesucht.length;
  }
  return treffer;
}

/**
 * Durchsucht den Index.
 *
 * Mehrere Begriffe müssen alle vorkommen. Ein Begriff in Anführungszeichen
 * wird als zusammenhängende Wendung gesucht. Zusätzlich filtern:
 * zustand, vorlage, von, bis.
 *
 * @returns {Array} Treffer, nach Anzahl der Fundstellen sortiert
 */
export function suche(index, anfrage, filter = {}) {
  const roh = String(anfrage ?? '').trim();

  // Wendungen in Anführungszeichen bleiben zusammen.
  const wendungen = [...roh.matchAll(/"([^"]+)"/g)].map((t) => t[1].toLowerCase());
  const einzelne = zerlege(roh.replace(/"[^"]+"/g, ' '));
  const begriffe = [...wendungen, ...einzelne];

  const ergebnis = [];
  for (const eintrag of index.eintraege) {
    if (filter.zustand && eintrag.zustand !== filter.zustand) continue;
    if (filter.vorlage && eintrag.vorlage !== filter.vorlage) continue;
    if (filter.von && String(eintrag.erstellt).slice(0, 10) < filter.von) continue;
    if (filter.bis && String(eintrag.erstellt).slice(0, 10) > filter.bis) continue;

    if (!begriffe.length) {
      ergebnis.push({ ...ohneText(eintrag), anzahl: 0, stellen: [] });
      continue;
    }

    const kleintext = eintrag.text.toLowerCase();
    const alleDrin = begriffe.every((b) =>
      b.includes(' ') ? kleintext.includes(b) : eintrag.worte.has(b) || kleintext.includes(b));
    if (!alleDrin) continue;

    const stellen = begriffe.flatMap((b) => fundstellen(eintrag.text, b));
    ergebnis.push({ ...ohneText(eintrag), anzahl: stellen.length, stellen });
  }

  return ergebnis.sort((a, b) => b.anzahl - a.anzahl || String(b.erstellt).localeCompare(String(a.erstellt)));
}

/** Der Volltext selbst gehört nicht ins Suchergebnis — nur die Fundstellen. */
function ohneText({ nummer, id, titel, zustand, vorlage, erstellt }) {
  return { nummer, id, titel, zustand, vorlage, erstellt };
}

/** Was im Bestand steckt — für die Filterlisten der Oberfläche. */
export function bestandsUebersicht(index) {
  const zustaende = new Map();
  const vorlagen = new Map();
  let zeichen = 0;
  for (const e of index.eintraege) {
    zustaende.set(e.zustand, (zustaende.get(e.zustand) ?? 0) + 1);
    if (e.vorlage) vorlagen.set(e.vorlage, (vorlagen.get(e.vorlage) ?? 0) + 1);
    zeichen += e.text.length;
  }
  return {
    dokumente: index.eintraege.length,
    zeichen,
    zustaende: [...zustaende].sort((a, b) => b[1] - a[1]),
    vorlagen: [...vorlagen].sort((a, b) => b[1] - a[1]),
    gebautAm: index.gebautAm
  };
}
