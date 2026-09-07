/**
 * Zugriff auf paperless.io — den Dienst für digitale Vertragsunterzeichnung.
 *
 * Nicht zu verwechseln mit paperless-ngx (siehe paperless.js). Hier liegen
 * die Mandate, die Eltern digital ausfüllen und unterschreiben; ihre
 * Formularfelder kommen strukturiert zurück, ohne Texterkennung.
 *
 * Die Basisadresse https://app.paperless.io/api antwortet auf
 * /v1/documents mit 403, wenn der Token fehlt — die Adresse existiert also.
 * Wie die Felder im Einzelnen heißen, entscheidet der Anbieter; deshalb
 * werden sie nicht geraten, sondern aus der Antwort eingesammelt und in der
 * Oberfläche zugeordnet.
 */

export const STANDARD_BASIS = 'https://app.paperless.io/api';

export class PaperlessIoClient {
  /**
   * @param {string} basisUrl z. B. https://app.paperless.io/api
   * @param {string} token API-Token aus dem Paperless-Konto
   */
  constructor(basisUrl = STANDARD_BASIS, token = '', fetchImpl = globalThis.fetch) {
    this.basisUrl = String(basisUrl ?? '').replace(/\/+$/, '');
    this.token = String(token ?? '').trim();
    // fetch verliert als Objekteigenschaft seine Bindung an window und wirft
    // im Browser sofort "Illegal invocation". Deshalb hier fest binden.
    this.fetch = fetchImpl === globalThis.fetch ? fetchImpl.bind(globalThis) : fetchImpl;
  }

  get kopfzeilen() {
    return { Authorization: `Bearer ${this.token}`, Accept: 'application/json' };
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
        'Verbindung zu paperless.io nicht möglich. Meist blockiert der Browser die ' +
        'Anfrage, weil paperless.io diese Seite nicht als Aufrufer zulässt (CORS). ' +
        `Dann hilft der Weg über eine Datei. Technisch: ${ursache.message}`
      );
    }

    if (antwort.status === 401 || antwort.status === 403) {
      throw new Error(
        `paperless.io nimmt den Token nicht an (${antwort.status}). Die Adresse stimmt, ` +
        'der Token nicht — oder er ist für diesen Bereich nicht freigeschaltet.'
      );
    }
    if (antwort.status === 404) {
      throw new Error(`Diese Adresse gibt es bei paperless.io nicht: ${pfad}`);
    }
    if (!antwort.ok) throw new Error(`paperless.io antwortet mit ${antwort.status}.`);

    const typ = antwort.headers.get?.('content-type') ?? '';
    if (typ && !typ.includes('json')) {
      throw new Error(
        'Statt Daten kam die Weboberfläche zurück. Die Basisadresse zeigt nicht auf die API.'
      );
    }
    return antwort.json();
  }

  /** Prüft Adresse und Token mit einem kleinen Aufruf. */
  async pruefeVerbindung() {
    const daten = await this.hole('/v1/documents', { limit: 1 });
    return { erreichbar: true, probe: daten };
  }

  /**
   * Holt Dokumente über alle Seiten. Paperless-Dienste geben ihre Liste je
   * nach Version unter `data`, `documents` oder direkt als Feld zurück.
   */
  async holeDokumente(optionen = {}) {
    const proSeite = optionen.seitenGroesse ?? 100;
    const alle = [];
    let seite = 1;

    for (;;) {
      const daten = await this.hole('/v1/documents', {
        limit: proSeite,
        page: seite,
        ...(optionen.zusatzParameter ?? {})
      });
      const stapel = listeAus(daten);
      alle.push(...stapel);
      if (optionen.beiFortschritt) optionen.beiFortschritt(alle.length);
      if (stapel.length < proSeite) break;
      seite += 1;
      if (seite > 200) break;
    }
    return alle;
  }

  /** Holt ein einzelnes Dokument samt seiner ausgefüllten Felder. */
  async holeDokument(id) {
    return this.hole(`/v1/documents/${encodeURIComponent(id)}`);
  }
}

/** Findet die eigentliche Liste in einer Antwort, wie auch immer sie verpackt ist. */
export function listeAus(daten) {
  if (Array.isArray(daten)) return daten;
  for (const schluessel of ['data', 'documents', 'results', 'items', 'records']) {
    if (Array.isArray(daten?.[schluessel])) return daten[schluessel];
  }
  return daten && typeof daten === 'object' ? [daten] : [];
}

/**
 * Sammelt alle Blattpfade eines Objekts ein, damit die Oberfläche daraus
 * Auswahllisten bauen kann: "signers.0.fields.iban" und so weiter.
 * @returns {Array<{pfad: string, beispiel: string}>}
 */
export function sammleFeldpfade(objekt, praefix = '', tiefe = 0, gesammelt = new Map()) {
  if (tiefe > 6 || objekt === null || objekt === undefined) return [...gesammelt.values()];

  if (Array.isArray(objekt)) {
    // Bei Listen genügt der erste Eintrag als Muster.
    if (objekt.length) sammleFeldpfade(objekt[0], `${praefix}.0`, tiefe + 1, gesammelt);
    return [...gesammelt.values()];
  }

  if (typeof objekt === 'object') {
    for (const [schluessel, wert] of Object.entries(objekt)) {
      sammleFeldpfade(wert, praefix ? `${praefix}.${schluessel}` : schluessel, tiefe + 1, gesammelt);
    }
    return [...gesammelt.values()];
  }

  const text = String(objekt);
  if (praefix && text.trim() !== '') {
    gesammelt.set(praefix, { pfad: praefix, beispiel: text.length > 60 ? `${text.slice(0, 60)}…` : text });
  }
  return [...gesammelt.values()];
}

/** Liest einen Wert über einen Pfad wie "signers.0.fields.iban" aus. */
export function leseUeberPfad(objekt, pfad) {
  if (!pfad) return '';
  let aktuell = objekt;
  for (const teil of String(pfad).split('.')) {
    if (aktuell === null || aktuell === undefined) return '';
    aktuell = Array.isArray(aktuell) ? aktuell[Number(teil)] : aktuell[teil];
  }
  return aktuell === null || aktuell === undefined ? '' : String(aktuell);
}

/**
 * Rät eine Feldzuordnung anhand der Feldnamen vor. Was hier danebenliegt,
 * wird in der Oberfläche von Hand richtiggestellt.
 */
export function schlageZuordnungVor(feldpfade) {
  const regeln = {
    iban: /iban/i,
    bic: /bic|swift/i,
    kontoinhaber: /kontoinhaber|account.?holder|inhaber|payer|zahlungspflicht/i,
    kind: /kind|child|sch[uü]ler|teilnehmer/i,
    mandatsId: /mandat.?(referenz|id|nummer)|mandate.?(reference|id)/i,
    mandatsDatum: /(mandat|signed|signatur|unterschrift).*(datum|date|at)|date.?of.?signature/i,
    betrag: /betrag|beitrag|amount|monatlich/i
  };
  const zuordnung = {};
  for (const [ziel, muster] of Object.entries(regeln)) {
    const treffer = feldpfade.find((f) => muster.test(f.pfad));
    if (treffer) zuordnung[ziel] = treffer.pfad;
  }
  return zuordnung;
}

/** Baut aus einem Dokument und einer Feldzuordnung die Rohwerte eines Mandats. */
export function mandatAusFeldern(dokument, zuordnung) {
  const lies = (ziel) => leseUeberPfad(dokument, zuordnung[ziel]).trim();
  return {
    kontoinhaber: lies('kontoinhaber'),
    kind: lies('kind'),
    iban: lies('iban').replace(/\s/g, '').toUpperCase(),
    bic: lies('bic').replace(/\s/g, '').toUpperCase(),
    mandatsId: lies('mandatsId'),
    mandatsDatum: lies('mandatsDatum'),
    betrag: lies('betrag')
  };
}
