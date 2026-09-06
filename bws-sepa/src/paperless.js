/**
 * Lesender Zugriff auf Paperless-ngx.
 *
 * Der Token bleibt nur im Arbeitsspeicher der Seite — er wird bewusst
 * nicht gespeichert und nicht mitprotokolliert. Alle Aufrufe gehen
 * direkt vom Browser an die Paperless-Instanz; es gibt keinen Server
 * dazwischen, der Daten sehen könnte.
 */

/** Liest den Fehlertext einer Antwort so gut wie möglich aus. */
async function fehlertext(antwort) {
  try {
    const text = await antwort.text();
    return text.slice(0, 300);
  } catch {
    return '';
  }
}

export class PaperlessClient {
  /**
   * @param {string} basisUrl z. B. https://paperless.bws-ev.de
   * @param {string} token API-Token aus dem Paperless-Benutzerprofil
   */
  constructor(basisUrl, token, fetchImpl = globalThis.fetch) {
    this.basisUrl = String(basisUrl ?? '').replace(/\/+$/, '');
    this.token = String(token ?? '').trim();
    this.fetch = fetchImpl;
  }

  get kopfzeilen() {
    return {
      Authorization: `Token ${this.token}`,
      Accept: 'application/json'
    };
  }

  async hole(pfad, parameter = {}) {
    const url = new URL(`${this.basisUrl}${pfad}`);
    for (const [schluessel, wert] of Object.entries(parameter)) {
      if (wert !== undefined && wert !== null && wert !== '') url.searchParams.set(schluessel, wert);
    }

    let antwort;
    try {
      antwort = await this.fetch(url.toString(), { headers: this.kopfzeilen });
    } catch (ursache) {
      throw new Error(
        'Verbindung zu Paperless nicht möglich. Häufigste Ursache: CORS ist für diese Seite ' +
        'nicht freigegeben (siehe docs/paperless-setup.md) oder die Adresse stimmt nicht. ' +
        `Technisch: ${ursache.message}`
      );
    }

    if (antwort.status === 401 || antwort.status === 403) {
      throw new Error('Paperless weist den Token ab (401/403). Token im Benutzerprofil neu erzeugen.');
    }
    if (!antwort.ok) {
      throw new Error(`Paperless antwortet mit ${antwort.status}. ${await fehlertext(antwort)}`);
    }
    return antwort.json();
  }

  /** Prüft Adresse und Token mit einem billigen Aufruf. */
  async pruefeVerbindung() {
    const daten = await this.hole('/api/documents/', { page_size: 1 });
    return { erreichbar: true, dokumenteGesamt: daten.count ?? 0 };
  }

  /** Definition aller Custom Fields (für die Feldzuordnung). */
  async holeCustomFields() {
    const daten = await this.hole('/api/custom_fields/', { page_size: 200 });
    return daten.results ?? [];
  }

  /** Alle Tags (für die Auswahl des Mandats-Tags). */
  async holeTags() {
    const daten = await this.hole('/api/tags/', { page_size: 500 });
    return daten.results ?? [];
  }

  /**
   * Holt alle Dokumente zu einem Tag, über alle Seiten hinweg.
   * @param {object} optionen { tagId, tagName, suchtext, seitenGroesse, beiFortschritt }
   */
  async holeDokumente(optionen = {}) {
    const seitenGroesse = optionen.seitenGroesse ?? 100;
    const parameter = {
      page_size: seitenGroesse,
      ordering: 'title',
      truncate_content: 'false'
    };
    if (optionen.tagId) parameter.tags__id__all = optionen.tagId;
    else if (optionen.tagName) parameter.tags__name__iexact = optionen.tagName;
    if (optionen.suchtext) parameter.title_content = optionen.suchtext;

    const alle = [];
    let seite = 1;
    let gesamt = null;

    // Paperless liefert nächste Seiten als absolute URL; wir zählen selbst
    // weiter, damit auch abweichende Host-Namen hinter Proxys funktionieren.
    for (;;) {
      const daten = await this.hole('/api/documents/', { ...parameter, page: seite });
      gesamt = daten.count ?? 0;
      alle.push(...(daten.results ?? []));
      if (optionen.beiFortschritt) optionen.beiFortschritt(alle.length, gesamt);
      if (!daten.next || alle.length >= gesamt || (daten.results ?? []).length === 0) break;
      seite += 1;
      if (seite > 200) break; // Schutz gegen Endlosschleifen
    }
    return alle;
  }

  /** Link auf das Dokument in der Paperless-Oberfläche (zum Nachschlagen am Beleg). */
  dokumentUrl(dokumentId) {
    return `${this.basisUrl}/documents/${dokumentId}/details`;
  }
}

/**
 * Rückfallweg ohne Netzzugriff: eine aus Paperless exportierte JSON-Datei lesen.
 * Akzeptiert sowohl die API-Antwort ({results: [...]}) als auch eine reine Liste.
 */
export function ausJsonExport(inhalt) {
  const daten = typeof inhalt === 'string' ? JSON.parse(inhalt) : inhalt;
  if (Array.isArray(daten)) return daten;
  if (Array.isArray(daten?.results)) return daten.results;
  if (Array.isArray(daten?.documents)) return daten.documents;
  throw new Error('Die Datei enthält keine erkennbare Dokumentliste aus Paperless.');
}

/**
 * Liest die Definition der Custom Fields aus derselben Datei mit, falls
 * vorhanden. Ohne sie bleiben nur die Regeln auf dem OCR-Text.
 */
export function felddefinitionenAusJson(inhalt) {
  const daten = typeof inhalt === 'string' ? JSON.parse(inhalt) : inhalt;
  const kandidat = daten?.custom_fields_definition ?? daten?.custom_fields;
  return Array.isArray(kandidat) ? kandidat : [];
}
