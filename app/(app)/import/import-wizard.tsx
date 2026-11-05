'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import Papa from 'papaparse'
import { toast } from 'sonner'
import { Upload } from 'lucide-react'
import { importRows } from '@/lib/crm/import'
import { IMPORT_TARGETS, guessTarget } from '@/lib/crm/import-targets'
import { CHANNELS, CHANNEL_LABELS } from '@/lib/crm/format'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

type Product = { id: string; name: string; color: string }
type Result = Awaited<ReturnType<typeof importRows>>

const BATCH = 200

export function ImportWizard({ products }: { products: Product[] }) {
  const [fileName, setFileName] = useState<string | null>(null)
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<Record<string, string>[]>([])
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [productId, setProductId] = useState<string | null>(null)
  const [source, setSource] = useState<string | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [pending, startTransition] = useTransition()

  function onFile(file: File) {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (parsed) => {
        const fields = parsed.meta.fields ?? []
        setFileName(file.name)
        setHeaders(fields)
        setRows(parsed.data)
        setResult(null)
        setMapping(Object.fromEntries(fields.map((field) => [field, guessTarget(field) || 'company.custom'])))
      },
      error: () => toast.error('Could not read this file'),
    })
  }

  function run() {
    startTransition(async () => {
      const total: Result = { companies: 0, people: 0, deals: 0, skipped: 0 }
      try {
        for (let i = 0; i < rows.length; i += BATCH) {
          setProgress(i / rows.length)
          const part = await importRows({ rows: rows.slice(i, i + BATCH), mapping, productId, source: source as never })
          for (const key of Object.keys(total) as (keyof Result)[]) total[key] += part[key]
        }
        setResult(total)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Import failed')
      } finally {
        setProgress(null)
      }
    })
  }

  if (!fileName) {
    return (
      <label className="mt-6 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-6 py-16 text-center hover:bg-accent/40">
        <Upload className="size-5 text-muted-foreground" aria-hidden />
        <span className="text-sm font-medium">Choose a CSV file</span>
        <span className="text-xs text-muted-foreground">First row must hold the column names.</span>
        <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(event) => event.target.files?.[0] && onFile(event.target.files[0])} />
      </label>
    )
  }

  if (result) {
    return (
      <div className="mt-6 rounded-lg border p-6">
        <p className="font-medium">Import done</p>
        <p className="num mt-1 text-sm text-muted-foreground">
          {result.companies} new companies, {result.people} new people, {result.deals} new deals
          {result.skipped ? `, ${result.skipped} rows skipped (no company or person)` : ''}. Existing records were updated.
        </p>
        <div className="mt-4 flex gap-2">
          <Button asChild size="sm">
            <Link href="/companies">See companies</Link>
          </Button>
          <Button variant="outline" size="sm" onClick={() => setFileName(null)}>
            Import another file
          </Button>
        </div>
      </div>
    )
  }

  const select = 'h-8 rounded-md border bg-background px-2 text-sm'
  return (
    <div className="mt-6 space-y-6">
      <p className="text-sm">
        <span className="font-medium">{fileName}</span> <span className="num text-muted-foreground">· {rows.length} rows</span>
      </p>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="px-3 py-2 font-medium">Column</th>
              <th className="px-3 py-2 font-medium">Example</th>
              <th className="px-3 py-2 font-medium">Import as</th>
            </tr>
          </thead>
          <tbody>
            {headers.map((header) => (
              <tr key={header} className="border-b last:border-0">
                <td className="px-3 py-2 font-medium">{header}</td>
                <td className="max-w-64 truncate px-3 py-2 text-muted-foreground">{rows.find((row) => row[header])?.[header]}</td>
                <td className="px-3 py-2">
                  <select className={select} value={mapping[header] ?? ''} onChange={(event) => setMapping({ ...mapping, [header]: event.target.value })}>
                    <option value="">Ignore</option>
                    {Object.entries(IMPORT_TARGETS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Open a deal per row for</Label>
          <select className={`${select} w-full`} value={productId ?? ''} onChange={(event) => setProductId(event.target.value || null)}>
            <option value="">No deal, records only</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>Source</Label>
          <select className={`${select} w-full`} value={source ?? ''} onChange={(event) => setSource(event.target.value || null)}>
            <option value="">Not set</option>
            {CHANNELS.map((channel) => (
              <option key={channel} value={channel}>
                {CHANNEL_LABELS[channel]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button onClick={run} loading={pending}>
          Import {rows.length} rows
        </Button>
        <Button variant="ghost" onClick={() => setFileName(null)} disabled={pending}>
          Cancel
        </Button>
        {progress !== null && <span className="num text-sm text-muted-foreground">{Math.round(progress * 100)}%</span>}
      </div>
    </div>
  )
}
