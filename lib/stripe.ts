import Stripe from 'stripe'

/**
 * Ein einziger Ort, an dem entschieden wird, gegen welches Stripe-Konto wir laufen.
 *
 * Der Client wird bewusst NICHT beim Laden des Moduls erzeugt: Next wertet die
 * Route-Module schon beim Build aus, und dort gibt es keine Umgebungsvariablen.
 * Ein `new Stripe(...)` auf Modulebene lässt den Build mit
 * „Neither apiKey nor config.authenticator provided" scheitern. Also lazy, und
 * alle Werte erst zur Laufzeit lesen.
 *
 * Sicherheitsnetz: solange STRIPE_ALLOW_LIVE nicht ausdrücklich gesetzt ist,
 * verweigert der Checkout die Arbeit mit einem Live-Key. In der Testphase liegt
 * damit ein versehentlich stehengebliebener sk_live_… Key nicht als Falle herum.
 */

/**
 * Keys aus Web-Oberflächen bringen regelmässig unsichtbaren Ballast mit:
 * Zeilenumbrüche, geschützte Leerzeichen, Zero-Width-Zeichen. Stripe setzt den
 * Key direkt in den Authorization-Header, und ein einziges solches Zeichen lässt
 * jeden Request scheitern — gemeldet als Verbindungsfehler, was in die völlig
 * falsche Richtung zeigt.
 *
 * `trim()` reicht dafür nicht: es entfernt kein U+200B, und gegen ein Zeichen
 * mitten im Key hilft es ohnehin nicht. Deshalb wird alles ausserhalb des
 * druckbaren ASCII-Bereichs entfernt. Ein Stripe-Key besteht ausschliesslich aus
 * base62-Zeichen, hier geht also nichts Echtes verloren.
 */
export function sanitizeKey(raw: string | undefined): { key: string; stripped: number } {
  const before = (raw ?? '').trim()
  const key = before.replace(/[^\x21-\x7E]/g, '')
  return { key, stripped: before.length - key.length }
}

function secretKey() {
  const { key, stripped } = sanitizeKey(process.env.STRIPE_SECRET_KEY)
  if (stripped > 0) {
    // Nicht lautlos: wer den Key setzt, soll erfahren, dass er unsauber war.
    console.warn(`[stripe] ${stripped} unzulässige(s) Zeichen aus STRIPE_SECRET_KEY entfernt — bitte in Vercel sauber neu einfügen.`)
  }
  return key
}

export function stripeIsLiveKey() {
  return secretKey().startsWith('sk_live_')
}

export function stripeLiveAllowed() {
  return process.env.STRIPE_ALLOW_LIVE === 'true'
}

export function assertStripeModeAllowed() {
  const key = secretKey()
  if (!key) throw new Error('STRIPE_SECRET_KEY fehlt')
  // Nach dem Säubern muss noch ein plausibler Key übrig sein. Keine Regel über
  // die Zeichenmenge dahinter — die hat Stripe über die Jahre geändert, und
  // eine solche Regel würde irgendwann gültige Keys ablehnen.
  if (!key.startsWith('sk_') && !key.startsWith('rk_')) {
    throw new Error('STRIPE_SECRET_KEY sieht nicht wie ein Stripe-Secret-Key aus (erwartet sk_… oder rk_…). Anführungszeichen mitkopiert?')
  }
  if (stripeIsLiveKey() && !stripeLiveAllowed()) {
    throw new Error(
      'Live-Key aktiv, aber STRIPE_ALLOW_LIVE ist nicht gesetzt. ' +
      'In der Sandbox-Testphase gehört hier ein sk_test_… Key hin.'
    )
  }
}

export type StripeMode = 'live' | 'test'

/**
 * Zweiter Key nur für Sandbox-Buchungen (Mitarbeiter-Simulator, Front-Office-Sandbox, Workshop).
 * STRIPE_TEST_SECRET_KEY muss ein sk_test_… sein — alles andere wird abgelehnt, damit hier
 * niemals ein Live-Key landet und eine Testbuchung echtes Geld bewegt.
 */
export function testSecretKey(): string {
  const { key } = sanitizeKey(process.env.STRIPE_TEST_SECRET_KEY)
  return key.startsWith('sk_test_') ? key : ''
}

export function stripeTestConfigured() {
  return testSecretKey().length > 0
}

/** Wirft, wenn der gewünschte Modus nicht nutzbar ist (Test: Key fehlt/ist kein sk_test_). */
export function assertStripeMode(mode: StripeMode) {
  if (mode === 'test') {
    if (!testSecretKey()) throw new Error('STRIPE_TEST_SECRET_KEY fehlt oder ist kein sk_test_-Key')
    return
  }
  assertStripeModeAllowed()
}

/** cs_test_… / cs_live_… verrät das Konto einer Checkout-Session. */
export function modeForSessionId(id: string | null | undefined): StripeMode {
  return (id ?? '').startsWith('cs_test_') ? 'test' : 'live'
}

const clients: Partial<Record<StripeMode, Stripe>> = {}

export function getStripe(mode: StripeMode = 'live'): Stripe {
  if (!clients[mode]) {
    const key = mode === 'test' ? testSecretKey() : secretKey()
    if (!key) throw new Error(mode === 'test' ? 'STRIPE_TEST_SECRET_KEY fehlt oder ist kein sk_test_-Key' : 'STRIPE_SECRET_KEY fehlt')
    clients[mode] = new Stripe(key, {
      apiVersion: '2026-08-26.dahlia',
      typescript: true,
    })
  }
  return clients[mode]!
}
