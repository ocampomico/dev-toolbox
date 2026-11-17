/** UTF-8 safe Base64. `urlSafe` uses - and _ and drops padding. */
export function base64Encode(text: string, urlSafe = false): string {
  const bytes = new TextEncoder().encode(text)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  const b64 = btoa(bin)
  return urlSafe ? b64.replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '') : b64
}

/** Accepts standard or URL-safe Base64, with or without padding and whitespace. */
export function base64DecodeBytes(input: string): Uint8Array {
  let s = input.replace(/\s+/g, '').replaceAll('-', '+').replaceAll('_', '/')
  if (/[^A-Za-z0-9+/=]/.test(s)) throw new Error('Not valid Base64: unexpected character.')
  s = s.replace(/=+$/, '')
  if (s.length % 4 === 1) throw new Error('Not valid Base64: wrong length.')
  s += '='.repeat((4 - (s.length % 4)) % 4)
  const bin = atob(s)
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

export function base64Decode(input: string): string {
  return new TextDecoder('utf-8', { fatal: true }).decode(base64DecodeBytes(input))
}

export const urlEncode = (s: string) => encodeURIComponent(s)
export const urlDecode = (s: string) => decodeURIComponent(s.replaceAll('+', ' '))
