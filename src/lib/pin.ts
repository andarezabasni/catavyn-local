// PIN hashing with PBKDF2-SHA256 + random per-note salt.
// Stored format: "pbkdf2$<iterations>$<saltHex>$<hashHex>"
// Legacy format (pre-005): bare 64-char SHA-256 hex — still verifiable so
// existing locked notes keep working; rehash happens when the PIN is changed.

const PBKDF2_ITERATIONS = 210_000

function toHex(buffer: ArrayBuffer | Uint8Array): string {
  return Array.from(new Uint8Array(buffer as ArrayBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

async function pbkdf2(pin: string, salt: Uint8Array, iterations: number): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pin),
    'PBKDF2',
    false,
    ['deriveBits']
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    keyMaterial,
    256
  )
  return toHex(bits)
}

async function legacySha256(pin: string): Promise<string> {
  const data = new TextEncoder().encode(pin)
  const buffer = await crypto.subtle.digest('SHA-256', data)
  return toHex(buffer)
}

export async function hashPin(pin: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = await pbkdf2(pin, salt, PBKDF2_ITERATIONS)
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toHex(salt)}$${hash}`
}

export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  if (stored.startsWith('pbkdf2$')) {
    const [, iterStr, saltHex, expected] = stored.split('$')
    const iterations = parseInt(iterStr, 10)
    if (!iterations || !saltHex || !expected) return false
    return (await pbkdf2(pin, fromHex(saltHex), iterations)) === expected
  }
  // Legacy unsalted SHA-256
  return (await legacySha256(pin)) === stored
}

// True when the stored hash uses the old unsalted format and should be
// re-hashed (call hashPin again) after a successful verification.
export function isLegacyPinHash(stored: string): boolean {
  return !stored.startsWith('pbkdf2$')
}
