/**
 * Browser-compatible HMAC-SHA256 signing using the Web Crypto API.
 *
 * Signing algorithm (matches authMiddleware.js):
 *   HMAC-SHA256(body + timestamp, secret)  →  hex string
 */

async function hmacSha256Hex(message: string, secret: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, enc.encode(message))
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export interface RequestHeaders {
  Authorization: string
  'X-Timestamp': string
  'X-Signature': string
  'X-Idempotency-Key': string
  'Content-Type': string
}

export async function buildAuthHeaders(
  keyId: string,
  secret: string,
  body: string,
): Promise<RequestHeaders> {
  const timestamp = Date.now().toString()
  const signature = await hmacSha256Hex(body + timestamp, secret)
  const idempotencyKey = crypto.randomUUID()

  return {
    Authorization: `Bearer ${keyId}:${secret}`,
    'X-Timestamp': timestamp,
    'X-Signature': signature,
    'X-Idempotency-Key': idempotencyKey,
    'Content-Type': 'application/json',
  }
}
