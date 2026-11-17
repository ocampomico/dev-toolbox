import { useMemo, useState } from 'react'
import { csvToJson, detectDelimiter, formatJson, jsonToCsv, minifyJson, parseJson, sortKeys, toTable, type Delimiter } from '../lib/json'
import { Button, Card, Code, CopyButton, download, ErrorNote, Segmented, Select, Toggle } from '../ui'

type Mode = 'format' | 'tocsv' | 'tojson'
type Indent = '2' | '4' | 'tab'
type DelimChoice = 'auto' | Delimiter

const SAMPLE = '[{"id":1,"name":"Ada","team":{"name":"Core","lead":true},"tags":["math","engines"]},{"id":2,"name":"Grace","team":{"name":"Compilers","lead":false},"tags":["cobol"]}]'

const DELIMS: { value: DelimChoice; label: string }[] = [
  { value: 'auto', label: 'Detect' },
  { value: ',', label: 'Comma' },
  { value: '\t', label: 'Tab' },
  { value: ';', label: 'Semicolon' },
]

type Out = { text: string; error?: string; table?: ReturnType<typeof toTable> }

export function Json() {
  const [mode, setMode] = useState<Mode>('format')
  const [input, setInput] = useState('')
  const [indent, setIndent] = useState<Indent>('2')
  const [minify, setMinify] = useState(false)
  const [sort, setSort] = useState(false)
  const [delim, setDelim] = useState<DelimChoice>('auto')
  const [infer, setInfer] = useState(true)

  const out: Out = useMemo(() => {
    if (!input.trim()) return { text: '' }
    try {
      if (mode === 'tojson') {
        const d = delim === 'auto' ? detectDelimiter(input) : delim
        const data = csvToJson(input, { delimiter: d, inferTypes: infer })
        return { text: formatJson(data, indent === 'tab' ? '\t' : Number(indent)), table: toTable(data) }
      }
      const p = parseJson(input)
      if (!p.ok) return { text: '', error: p.line ? `Line ${p.line}, column ${p.column}: ${p.error}` : p.error }
      const v = sort ? sortKeys(p.value) : p.value
      if (mode === 'tocsv') return { text: jsonToCsv(v, delim === 'auto' ? ',' : delim), table: toTable(v) }
      return { text: minify ? minifyJson(v) : formatJson(v, indent === 'tab' ? '\t' : Number(indent)) }
    } catch (e) {
      return { text: '', error: e instanceof Error ? e.message : String(e) }
    }
  }, [input, mode, indent, minify, sort, delim, infer])

  const outExt = mode === 'tocsv' ? 'csv' : 'json'
  const errId = 'json-error'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          label="Mode"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'format', label: 'Format' },
            { value: 'tocsv', label: 'JSON to CSV' },
            { value: 'tojson', label: 'CSV to JSON' },
          ]}
        />
        <Button variant="ghost" onClick={() => setInput(mode === 'tojson' ? jsonToCsv(JSON.parse(SAMPLE)) : SAMPLE)}>
          Load sample
        </Button>
      </div>

      <Card>
        <div className="mb-4 flex flex-wrap items-end gap-x-5 gap-y-3">
          {mode !== 'tocsv' && (
            <div className="w-32">
              <Select
                label="Indent"
                value={indent}
                onChange={setIndent}
                options={[
                  { value: '2', label: '2 spaces' },
                  { value: '4', label: '4 spaces' },
                  { value: 'tab', label: 'Tab' },
                ]}
              />
            </div>
          )}
          {mode !== 'format' && (
            <div className="w-36">
              <Select label="Delimiter" value={mode === 'tocsv' && delim === 'auto' ? ',' : delim} onChange={setDelim} options={mode === 'tocsv' ? DELIMS.filter((d) => d.value !== 'auto') : DELIMS} />
            </div>
          )}
          {mode === 'format' && <Toggle label="Minify" checked={minify} onChange={setMinify} />}
          {mode !== 'tojson' && <Toggle label="Sort keys" checked={sort} onChange={setSort} />}
          {mode === 'tojson' && <Toggle label="Numbers, booleans and null" checked={infer} onChange={setInfer} />}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <Code
              label={mode === 'tojson' ? 'CSV in' : 'JSON in'}
              value={input}
              onChange={setInput}
              rows={16}
              invalid={!!out.error}
              describedBy={out.error ? errId : undefined}
              placeholder={mode === 'tojson' ? 'id,name\n1,Ada' : '{"paste": "JSON here"}'}
            />
            {out.error && <ErrorNote id={errId}>{out.error}</ErrorNote>}
          </div>
          <div>
            <Code label={mode === 'tocsv' ? 'CSV out' : 'JSON out'} value={out.text} rows={16} />
            <div className="mt-2 flex flex-wrap gap-2">
              <CopyButton text={out.text} />
              <Button onClick={() => download(out.text, `output.${outExt}`, mode === 'tocsv' ? 'text/csv' : 'application/json')} disabled={!out.text}>
                Download .{outExt}
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {mode !== 'format' && out.table && out.table.cols.length > 0 && (
        <Card title="Table" aside={out.table.total > out.table.rows.length ? `First ${out.table.rows.length} of ${out.table.total} rows` : `${out.table.total} rows`}>
          <div className="max-h-96 overflow-auto rounded-lg border border-line">
            <table className="w-full text-left font-mono text-[12px]">
              <thead className="sticky top-0 bg-accent-soft">
                <tr>
                  {out.table.cols.map((c) => (
                    <th key={c} className="border-b border-line px-3 py-2 font-semibold whitespace-nowrap">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {out.table.rows.map((r, i) => (
                  <tr key={i} className="border-b border-line last:border-0">
                    {r.map((cell, j) => (
                      <td key={j} className="max-w-64 truncate px-3 py-1.5" title={cell}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
