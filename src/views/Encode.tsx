import { useMemo, useState } from 'react'
import { base64Decode, base64Encode, urlDecode, urlEncode } from '../lib/encode'
import { Button, Card, Code, CopyButton, ErrorNote, Segmented, Toggle } from '../ui'

type Kind = 'base64' | 'url'
type Dir = 'encode' | 'decode'

export function Encode() {
  const [kind, setKind] = useState<Kind>('base64')
  const [dir, setDir] = useState<Dir>('encode')
  const [urlSafe, setUrlSafe] = useState(false)
  const [input, setInput] = useState('')

  const out = useMemo(() => {
    if (!input) return { text: '' }
    try {
      if (kind === 'base64') return { text: dir === 'encode' ? base64Encode(input, urlSafe) : base64Decode(input) }
      return { text: dir === 'encode' ? urlEncode(input) : urlDecode(input) }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (e instanceof URIError) return { text: '', error: 'Not valid percent-encoding.' }
      if (e instanceof TypeError) return { text: '', error: 'Decoded bytes are not valid UTF-8 text.' }
      return { text: '', error: msg }
    }
  }, [input, kind, dir, urlSafe])

  const name = kind === 'base64' ? 'Base64' : 'URL'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          label="Encoding"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'base64', label: 'Base64' },
            { value: 'url', label: 'URL' },
          ]}
        />
        <Segmented
          label="Direction"
          value={dir}
          onChange={setDir}
          options={[
            { value: 'encode', label: 'Encode' },
            { value: 'decode', label: 'Decode' },
          ]}
        />
        {kind === 'base64' && dir === 'encode' && <Toggle label="URL-safe, no padding" checked={urlSafe} onChange={setUrlSafe} />}
      </div>

      <Card>
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <Code
              label={dir === 'encode' ? 'Text' : name}
              value={input}
              onChange={setInput}
              rows={12}
              invalid={!!out.error}
              describedBy={out.error ? 'encode-error' : undefined}
            />
            {out.error && <ErrorNote id="encode-error">{out.error}</ErrorNote>}
          </div>
          <div>
            <Code label={dir === 'encode' ? name : 'Text'} value={out.text} rows={12} />
            <div className="mt-2 flex flex-wrap gap-2">
              <CopyButton text={out.text} />
              <Button
                onClick={() => {
                  setInput(out.text)
                  setDir(dir === 'encode' ? 'decode' : 'encode')
                }}
                disabled={!out.text}
              >
                Swap
              </Button>
            </div>
          </div>
        </div>
        {kind === 'base64' && dir === 'decode' && <p className="mt-3 text-xs text-muted">Accepts standard and URL-safe Base64, with or without padding.</p>}
      </Card>
    </div>
  )
}
