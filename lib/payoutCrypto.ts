import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

/**
 * Verschlüsselung der Refund-Auszahlungsdaten (IBAN, BIC, Inhaber, Telefon) — AES-256-GCM, nur serverseitig.
 * Schlüssel: Vercel-Env PAYOUT_ENC_KEY = 32 Byte, base64 (z. B. `openssl rand -base64 32`).
 * Format in der DB: enc:v1:<iv>:<tag>:<ciphertext> (alles base64). Ohne Schlüssel wird NIE im Klartext gespeichert.
 */
const PREFIX = 'enc:v1:'

function key(): Buffer {
  const raw = process.env.PAYOUT_ENC_KEY
  if (!raw) throw new Error('Payout encryption is not configured (PAYOUT_ENC_KEY missing on the server)')
  const k = Buffer.from(raw, 'base64')
  if (k.length !== 32) throw new Error('PAYOUT_ENC_KEY must be 32 bytes, base64-encoded')
  return k
}

export function encryptPayout(plain: string): string {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', key(), iv)
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()])
  return `${PREFIX}${iv.toString('base64')}:${c.getAuthTag().toString('base64')}:${ct.toString('base64')}`
}

export function decryptPayout(stored: string): string {
  if (!stored.startsWith(PREFIX)) return stored // Altbestand (Klartext) — sollte nach dem Rollout nicht mehr vorkommen
  const [iv, tag, ct] = stored.slice(PREFIX.length).split(':')
  const d = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'))
  d.setAuthTag(Buffer.from(tag, 'base64'))
  return Buffer.concat([d.update(Buffer.from(ct, 'base64')), d.final()]).toString('utf8')
}
