import { useEffect, useId, useRef, useState, type ReactNode } from 'react'

export function Card({ title, aside, children, className = '' }: { title?: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-line bg-card p-4 sm:p-5 ${className}`}>
      {(title || aside) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>}
          {aside && <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted">{aside}</div>}
        </div>
      )}
      {children}
    </section>
  )
}

const fieldCls = 'w-full min-w-0 rounded-lg border border-field bg-card px-3 text-[14px] text-ink placeholder:text-muted/60'

export function Label({ htmlFor, children }: { htmlFor: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-[13px] font-medium text-muted">
      {children}
    </label>
  )
}

/** Monospace text area. Read-only areas select all on focus for quick copying. */
export function Code({
  label,
  value,
  onChange,
  placeholder,
  rows = 10,
  invalid,
  describedBy,
}: {
  label: string
  value: string
  onChange?: (s: string) => void
  placeholder?: string
  rows?: number
  invalid?: boolean
  describedBy?: string
}) {
  const id = useId()
  const readOnly = !onChange
  return (
    <div className="min-w-0">
      <Label htmlFor={id}>{label}</Label>
      <textarea
        id={id}
        rows={rows}
        spellCheck={false}
        autoCapitalize="off"
        autoComplete="off"
        autoCorrect="off"
        readOnly={readOnly}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        placeholder={placeholder}
        value={value}
        onChange={onChange && ((e) => onChange(e.target.value))}
        onFocus={readOnly ? (e) => e.currentTarget.select() : undefined}
        className={`${fieldCls} block resize-y py-2.5 font-mono text-[13px] leading-relaxed ${readOnly ? 'bg-paper' : ''} ${invalid ? 'border-warn' : ''}`}
      />
    </div>
  )
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  mono,
  invalid,
  describedBy,
}: {
  label: string
  value: string
  onChange: (s: string) => void
  placeholder?: string
  mono?: boolean
  invalid?: boolean
  describedBy?: string
}) {
  const id = useId()
  return (
    <div className="min-w-0">
      <Label htmlFor={id}>{label}</Label>
      <input
        id={id}
        type="text"
        spellCheck={false}
        autoComplete="off"
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className={`${fieldCls} h-10 ${mono ? 'font-mono text-[13px]' : ''} ${invalid ? 'border-warn' : ''}`}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

export function Select<T extends string>({ label, value, onChange, options }: { label: string; value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  const id = useId()
  return (
    <div className="min-w-0">
      <Label htmlFor={id}>{label}</Label>
      <select id={id} className={`${fieldCls} h-10`} value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}

/** Mutually exclusive options shown as a row of buttons. */
export function Segmented<T extends string>({ label, value, onChange, options }: { label: string; value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex max-w-full overflow-x-auto rounded-lg border border-line bg-paper p-0.5">
      {options.map((o) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={`min-h-9 shrink-0 rounded-md px-3 text-sm whitespace-nowrap ${on ? 'bg-card font-medium text-ink shadow-sm' : 'text-muted hover:text-ink'}`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (b: boolean) => void }) {
  return (
    <label className="flex min-h-9 cursor-pointer items-center gap-2 text-sm">
      <input type="checkbox" className="size-4 accent-(--accent)" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  )
}

export function Button({
  children,
  onClick,
  variant = 'secondary',
  disabled,
  label,
}: {
  children: ReactNode
  onClick: () => void
  variant?: 'primary' | 'secondary' | 'ghost'
  disabled?: boolean
  label?: string
}) {
  const styles = {
    primary: 'bg-accent text-on-accent border-accent hover:opacity-85',
    secondary: 'bg-card text-ink border-line hover:border-field',
    ghost: 'border-transparent text-muted hover:text-ink',
  }[variant]
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition disabled:opacity-35 ${styles}`}
    >
      {children}
    </button>
  )
}

/** Copies `text` and says so for a moment. */
export function CopyButton({ text, label = 'Copy', small }: { text: string; label?: string; small?: boolean }) {
  const [done, setDone] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setDone(true)
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setDone(false), 1200)
    } catch {
      // Clipboard blocked: the text is still selectable.
    }
  }
  return small ? (
    <button type="button" onClick={copy} disabled={!text} className="min-h-8 shrink-0 rounded-md px-2 text-xs font-medium text-muted hover:text-ink disabled:opacity-35" aria-live="polite">
      {done ? 'Copied' : label}
    </button>
  ) : (
    <Button onClick={copy} disabled={!text}>
      <span aria-live="polite">{done ? 'Copied' : label}</span>
    </Button>
  )
}

export function download(text: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function ErrorNote({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} role="alert" className="mt-2 rounded-lg bg-warn-soft px-3 py-2 text-[13px] text-warn">
      {children}
    </p>
  )
}

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'good' | 'warn'; children: ReactNode }) {
  const cls = { neutral: 'bg-accent-soft text-ink', good: 'bg-accent text-on-accent', warn: 'bg-warn-soft text-warn' }[tone]
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>{children}</span>
}

/** Label and value rows with a copy button on each value. */
export function Rows({ rows }: { rows: { label: string; value: string }[] }) {
  return (
    <dl className="divide-y divide-line">
      {rows.map((r) => (
        <div key={r.label} className="flex flex-wrap items-center gap-x-4 gap-y-0.5 py-2 sm:flex-nowrap">
          <dt className="w-full shrink-0 text-[13px] text-muted sm:w-44">{r.label}</dt>
          <dd className="min-w-0 flex-1 font-mono text-[13px] break-all">{r.value}</dd>
          <CopyButton text={r.value} small />
        </div>
      ))}
    </dl>
  )
}
