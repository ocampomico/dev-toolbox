import { collectMatches, compileRegex, replacePreview, type MatchList } from '../lib/regex'

export type RegexJob = { id: number; pattern: string; flags: string; text: string; replacement: string; limit: number }

export type RegexReply = { id: number; ok: true; list: MatchList; replaced: string } | { id: number; ok: false; error: string }

// Runs off the main thread so a pattern that backtracks for minutes only ties up this worker,
// which the page can terminate.
self.onmessage = (e: MessageEvent<RegexJob>) => {
  const { id, pattern, flags, text, replacement, limit } = e.data
  const compiled = compileRegex(pattern, flags)
  let reply: RegexReply
  if (!compiled.ok) reply = { id, ok: false, error: compiled.error }
  else {
    try {
      reply = { id, ok: true, list: collectMatches(compiled.regex, text, limit), replaced: replacePreview(compiled.regex, text, replacement) }
    } catch (err) {
      reply = { id, ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }
  // The DOM lib types self as a window, whose postMessage wants a target origin.
  ;(self as unknown as { postMessage: (msg: RegexReply) => void }).postMessage(reply)
}
