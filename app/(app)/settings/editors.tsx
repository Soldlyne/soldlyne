'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react'
import type { CustomField, Product, Project, Stage } from '@prisma/client'
import { deleteCustomField, deleteStage, reorderStages, saveCustomField, saveProduct, saveProject, saveStage } from '@/lib/crm/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

function useRun() {
  const [pending, startTransition] = useTransition()
  const run = (fn: () => Promise<unknown>, done?: () => void) =>
    startTransition(async () => {
      try {
        await fn()
        done?.()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Could not save')
      }
    })
  return { pending, run }
}

const select = 'h-9 rounded-md border bg-background px-2 text-sm'

export function ProjectsEditor({ projects }: { projects: Project[] }) {
  const { pending, run } = useRun()
  const [name, setName] = useState('')
  return (
    <div className="divide-y rounded-lg border">
      {projects.map((project) => (
        <div key={project.id} className="flex items-center gap-2 px-3 py-2">
          <input
            type="color"
            defaultValue={project.color}
            onBlur={(event) => event.target.value !== project.color && run(() => saveProject(project.id, { color: event.target.value }))}
            className="size-6 cursor-pointer rounded border-0 bg-transparent p-0"
            aria-label="Color"
          />
          <Input
            defaultValue={project.name}
            onBlur={(event) => event.target.value.trim() && event.target.value !== project.name && run(() => saveProject(project.id, { name: event.target.value }))}
            className="h-8 flex-1 border-0 shadow-none"
          />
          <Button variant="ghost" size="xs" onClick={() => run(() => saveProject(project.id, { archived: !project.archived }))}>
            {project.archived ? 'Unarchive' : 'Archive'}
          </Button>
        </div>
      ))}
      <form
        className="flex items-center gap-2 px-3 py-2"
        onSubmit={(event) => {
          event.preventDefault()
          if (name.trim()) run(() => saveProject(null, { name }), () => setName(''))
        }}
      >
        <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Add a project" className="h-8 flex-1" />
        <Button size="sm" type="submit" loading={pending} disabled={!name.trim()}>
          Add
        </Button>
      </form>
    </div>
  )
}

export function ProductsEditor({ products, projects }: { products: (Product & { label: string })[]; projects: Project[] }) {
  const { pending, run } = useRun()
  const [name, setName] = useState('')
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '')
  return (
    <div className="divide-y rounded-lg border">
      {products.map((product) => (
        <div key={product.id} className="flex items-center gap-2 px-3 py-2">
          <input
            type="color"
            defaultValue={product.color}
            onBlur={(event) => event.target.value !== product.color && run(() => saveProduct({ ...product, color: event.target.value }))}
            className="size-6 cursor-pointer rounded border-0 bg-transparent p-0"
            aria-label="Color"
          />
          <Input
            defaultValue={product.name}
            onBlur={(event) => event.target.value.trim() && event.target.value !== product.name && run(() => saveProduct({ ...product, name: event.target.value }))}
            className="h-8 flex-1 border-0 shadow-none"
          />
          <select
            className={select}
            defaultValue={product.projectId ?? ''}
            onChange={(event) => run(() => saveProduct({ ...product, projectId: event.target.value || null }))}
            aria-label="Project"
          >
            <option value="">No project</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
          <Button variant="ghost" size="xs" onClick={() => run(() => saveProduct({ ...product, archived: !product.archived }))}>
            {product.archived ? 'Unarchive' : 'Archive'}
          </Button>
        </div>
      ))}
      <form
        className="flex items-center gap-2 px-3 py-2"
        onSubmit={(event) => {
          event.preventDefault()
          if (name.trim()) run(() => saveProduct({ name, color: '#731b32', projectId: projectId || null }), () => setName(''))
        }}
      >
        <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Add a product" className="h-8 flex-1" />
        <select className={select} value={projectId} onChange={(event) => setProjectId(event.target.value)} aria-label="Project">
          <option value="">No project</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
        <Button size="sm" type="submit" loading={pending} disabled={!name.trim()}>
          Add
        </Button>
      </form>
    </div>
  )
}

export function StagesEditor({ stages }: { stages: Stage[] }) {
  const { pending, run } = useRun()
  const [name, setName] = useState('')
  const move = (index: number, delta: number) => {
    const ids = stages.map((stage) => stage.id)
    const [id] = ids.splice(index, 1)
    ids.splice(index + delta, 0, id)
    run(() => reorderStages(ids))
  }
  return (
    <div className="divide-y rounded-lg border">
      {stages.map((stage, index) => (
        <div key={stage.id} className="flex items-center gap-2 px-3 py-2">
          <div className="flex flex-col">
            <button type="button" disabled={index === 0} onClick={() => move(index, -1)} className="text-muted-foreground hover:text-foreground disabled:opacity-30" aria-label="Move up">
              <ArrowUp className="size-3.5" />
            </button>
            <button type="button" disabled={index === stages.length - 1} onClick={() => move(index, 1)} className="text-muted-foreground hover:text-foreground disabled:opacity-30" aria-label="Move down">
              <ArrowDown className="size-3.5" />
            </button>
          </div>
          <Input
            defaultValue={stage.name}
            onBlur={(event) => event.target.value.trim() && event.target.value !== stage.name && run(() => saveStage({ ...stage, name: event.target.value }))}
            className="h-8 flex-1 border-0 shadow-none"
          />
          <select className={select} defaultValue={stage.kind} onChange={(event) => run(() => saveStage({ ...stage, kind: event.target.value as Stage['kind'] }))} aria-label="Kind">
            <option value="OPEN">Open</option>
            <option value="WON">Won</option>
            <option value="LOST">Lost</option>
          </select>
          <div className="flex items-center gap-1">
            <Input
              type="number"
              min={0}
              max={100}
              defaultValue={stage.probability}
              onBlur={(event) => Number(event.target.value) !== stage.probability && run(() => saveStage({ ...stage, probability: Number(event.target.value) }))}
              className="h-8 w-16 text-right"
              aria-label="Probability"
            />
            <span className="text-sm text-muted-foreground">%</span>
          </div>
          <Button variant="ghost" size="icon-xs" onClick={() => confirm(`Delete ${stage.name}?`) && run(() => deleteStage(stage.id))} aria-label="Delete stage">
            <Trash2 />
          </Button>
        </div>
      ))}
      <form
        className="flex items-center gap-2 px-3 py-2"
        onSubmit={(event) => {
          event.preventDefault()
          if (name.trim()) run(() => saveStage({ name, kind: 'OPEN', probability: 50 }), () => setName(''))
        }}
      >
        <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Add a stage" className="h-8 flex-1" />
        <Button size="sm" type="submit" loading={pending} disabled={!name.trim()}>
          Add
        </Button>
      </form>
    </div>
  )
}

const OBJECT_LABELS = { COMPANY: 'Company', PERSON: 'Person', DEAL: 'Deal' } as const
const TYPE_LABELS = { TEXT: 'Text', NUMBER: 'Number', DATE: 'Date', URL: 'Link', SELECT: 'Select', MULTI_SELECT: 'Tags', BOOLEAN: 'Yes / no' } as const

export function FieldsEditor({ fields }: { fields: CustomField[] }) {
  const { pending, run } = useRun()
  const [label, setLabel] = useState('')
  const [object, setObject] = useState<CustomField['object']>('COMPANY')
  const [type, setType] = useState<CustomField['type']>('TEXT')
  const [options, setOptions] = useState('')
  return (
    <div className="divide-y rounded-lg border">
      {fields.map((field) => (
        <div key={field.id} className="flex items-center gap-2 px-3 py-2 text-sm">
          <span className="w-20 text-muted-foreground">{OBJECT_LABELS[field.object]}</span>
          <span className="flex-1 font-medium">{field.label}</span>
          <span className="text-muted-foreground">{TYPE_LABELS[field.type]}</span>
          <Button variant="ghost" size="icon-xs" onClick={() => confirm(`Delete ${field.label}? Values stay in the records.`) && run(() => deleteCustomField(field.id))} aria-label="Delete field">
            <Trash2 />
          </Button>
        </div>
      ))}
      <form
        className="flex flex-wrap items-center gap-2 px-3 py-2"
        onSubmit={(event) => {
          event.preventDefault()
          if (!label.trim()) return
          run(
            () => saveCustomField({ object, label, type, options: options.split(',').map((o) => o.trim()).filter(Boolean) }),
            () => {
              setLabel('')
              setOptions('')
            },
          )
        }}
      >
        <select className={select} value={object} onChange={(event) => setObject(event.target.value as CustomField['object'])} aria-label="Record">
          {Object.entries(OBJECT_LABELS).map(([value, text]) => (
            <option key={value} value={value}>
              {text}
            </option>
          ))}
        </select>
        <Input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Field name" className="h-9 min-w-40 flex-1" />
        <select className={select} value={type} onChange={(event) => setType(event.target.value as CustomField['type'])} aria-label="Type">
          {Object.entries(TYPE_LABELS).map(([value, text]) => (
            <option key={value} value={value}>
              {text}
            </option>
          ))}
        </select>
        {(type === 'SELECT' || type === 'MULTI_SELECT') && (
          <Input value={options} onChange={(event) => setOptions(event.target.value)} placeholder="Options, comma separated" className="h-9 min-w-48 flex-1" />
        )}
        <Button size="sm" type="submit" loading={pending} disabled={!label.trim()}>
          Add
        </Button>
      </form>
    </div>
  )
}
