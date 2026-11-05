'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { GripVertical, Plus } from 'lucide-react'
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core'
import { arrayMove, rectSortingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Entity, Product, Project } from '@prisma/client'
import { saveCatalogOrder, saveEntity } from '@/lib/crm/actions'
import { EditableField } from '@/components/crm/editable-field'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ProductCard } from './product-card'
import { ProjectHeader } from './project-header'

type Item = { kind: 'entity' | 'project' | 'product' | 'drop-entity' | 'drop-project'; id: string }
const NONE = 'none'

function parse(id: string | number): Item {
  const [kind, rest] = String(id).split(':') as [Item['kind'], string]
  return { kind, id: rest }
}

/** Drag handle bound to a sortable item. */
function Handle({ listeners, attributes, label }: { listeners: ReturnType<typeof useSortable>['listeners']; attributes: ReturnType<typeof useSortable>['attributes']; label: string }) {
  return (
    <button
      type="button"
      {...listeners}
      {...attributes}
      aria-label={`Move ${label}`}
      className="-ml-1 cursor-grab touch-none rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground active:cursor-grabbing"
    >
      <GripVertical className="size-4" />
    </button>
  )
}

function Sortable({ id, children, className }: { id: string; className?: string; children: (handle: React.ReactNode) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(className, isDragging && 'relative z-10 opacity-80 shadow-lg')}
    >
      {children(<Handle listeners={listeners} attributes={attributes} label={parse(id).kind} />)}
    </div>
  )
}

/** Empty drop zone so a project or company with no children still accepts drops. */
function DropZone({ id, label }: { id: string; label: string }) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div ref={setNodeRef} className={cn('rounded-lg border border-dashed px-3 py-4 text-center text-xs text-muted-foreground', isOver && 'border-ring bg-accent')}>
      {label}
    </div>
  )
}

/** Products in a grid, sortable and movable by their handles. */
function ProductGrid({ products, projects, stats, children }: { products: Product[]; projects: { value: string; label: string }[]; stats: Record<string, string>; children?: React.ReactNode }) {
  return (
    <SortableContext items={products.map((p) => `product:${p.id}`)} strategy={rectSortingStrategy}>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {children}
        {products.map((product) => (
          <Sortable key={product.id} id={`product:${product.id}`}>
            {(productHandle) => <ProductCard product={product} projects={projects} stats={stats[product.id] ?? ''} handle={productHandle} />}
          </Sortable>
        ))}
      </div>
    </SortableContext>
  )
}

export function CatalogEditor({
  entities: initialEntities,
  projects: initialProjects,
  products: initialProducts,
  stats,
}: {
  entities: Entity[]
  projects: Project[]
  products: Product[]
  stats: Record<string, string>
}) {
  const [entities, setEntities] = useState(initialEntities)
  const [projects, setProjects] = useState(initialProjects)
  const [products, setProducts] = useState(initialProducts)
  const [, startTransition] = useTransition()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))

  // Server data changed (an edit, a new product): take it, keeping nothing stale.
  const [seen, setSeen] = useState({ initialEntities, initialProjects, initialProducts })
  if (seen.initialEntities !== initialEntities || seen.initialProjects !== initialProjects || seen.initialProducts !== initialProducts) {
    setSeen({ initialEntities, initialProjects, initialProducts })
    setEntities(initialEntities)
    setProjects(initialProjects)
    setProducts(initialProducts)
  }

  const entityOptions = entities.map((e) => ({ value: e.id, label: e.name }))
  const projectOptions = projects.map((p) => ({ value: p.id, label: p.name }))
  const groups: (Entity | null)[] = [...entities, null]
  const withoutProject = products.filter((p) => p.projectId === null)

  function persist(nextEntities = entities, nextProjects = projects, nextProducts = products) {
    startTransition(async () => {
      try {
        await saveCatalogOrder({
          entities: nextEntities.map((e) => e.id),
          projects: nextProjects.map((p) => ({ id: p.id, entityId: p.entityId })),
          products: nextProducts.map((p) => ({ id: p.id, projectId: p.projectId })),
        })
      } catch {
        toast.error('Could not save the new order')
      }
    })
  }

  /** Container a drop target belongs to: the project of a product, the company of a project. */
  function containerOf(target: Item): string | null {
    if (target.kind === 'product') return products.find((p) => p.id === target.id)?.projectId ?? null
    if (target.kind === 'project') return projects.find((p) => p.id === target.id)?.entityId ?? null
    return target.id === NONE ? null : target.id
  }

  // Moving across containers while dragging, so the item shows where it will land.
  function onDragOver({ active, over }: DragOverEvent) {
    if (!over) return
    const a = parse(active.id)
    const o = parse(over.id)
    if (a.kind === 'product') {
      const target = o.kind === 'product' ? containerOf(o) : o.kind === 'project' || o.kind === 'drop-project' ? o.id : undefined
      if (target === undefined) return
      setProducts((list) => {
        const item = list.find((p) => p.id === a.id)
        if (!item || item.projectId === target) return list
        const moved = { ...item, projectId: target }
        const rest = list.filter((p) => p.id !== a.id)
        const index = o.kind === 'product' ? rest.findIndex((p) => p.id === o.id) : rest.length
        return [...rest.slice(0, index), moved, ...rest.slice(index)]
      })
    } else if (a.kind === 'project') {
      const target = o.kind === 'project' ? containerOf(o) : o.kind === 'entity' || o.kind === 'drop-entity' ? (o.id === NONE ? null : o.id) : undefined
      if (target === undefined) return
      setProjects((list) => {
        const item = list.find((p) => p.id === a.id)
        if (!item || item.entityId === target) return list
        const moved = { ...item, entityId: target }
        const rest = list.filter((p) => p.id !== a.id)
        const index = o.kind === 'project' ? rest.findIndex((p) => p.id === o.id) : rest.length
        return [...rest.slice(0, index), moved, ...rest.slice(index)]
      })
    }
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    const a = parse(active.id)
    const o = over ? parse(over.id) : null
    let nextEntities = entities
    let nextProjects = projects
    let nextProducts = products
    if (o && a.kind === o.kind && a.id !== o.id) {
      if (a.kind === 'entity') {
        nextEntities = arrayMove(entities, entities.findIndex((e) => e.id === a.id), entities.findIndex((e) => e.id === o.id))
        setEntities(nextEntities)
      } else if (a.kind === 'project') {
        nextProjects = arrayMove(projects, projects.findIndex((p) => p.id === a.id), projects.findIndex((p) => p.id === o.id))
        setProjects(nextProjects)
      } else {
        nextProducts = arrayMove(products, products.findIndex((p) => p.id === a.id), products.findIndex((p) => p.id === o.id))
        setProducts(nextProducts)
      }
    }
    persist(nextEntities, nextProjects, nextProducts)
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragOver={onDragOver} onDragEnd={onDragEnd}>
      <SortableContext items={entities.map((e) => `entity:${e.id}`)} strategy={verticalListSortingStrategy}>
        <div className="space-y-12">
          {groups.map((entity) => {
            const entityId = entity?.id ?? null
            const groupProjects = projects.filter((p) => p.entityId === entityId)
            const body = (handle: React.ReactNode) => (
              <section>
                <div className="mb-4 flex flex-wrap items-baseline gap-3 border-b pb-2">
                  {handle}
                  <h2 className="text-base font-semibold">{entity?.name ?? 'No company'}</h2>
                  {entity && <EntityDetails entity={entity} />}
                </div>
                <SortableContext items={groupProjects.map((p) => `project:${p.id}`)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-8">
                    {groupProjects.length === 0 && projects.length > 0 && <DropZone id={`drop-entity:${entityId ?? NONE}`} label="Drop a project here" />}
                    {groupProjects.map((project) => {
                      const projectProducts = products.filter((p) => p.projectId === project.id)
                      return (
                        <Sortable key={project.id} id={`project:${project.id}`}>
                          {(projectHandle) => (
                            <div>
                              <ProjectHeader project={project} entities={entityOptions} handle={projectHandle} />
                              <ProductGrid products={projectProducts} projects={projectOptions} stats={stats}>
                                {projectProducts.length === 0 && <DropZone id={`drop-project:${project.id}`} label="Drop a product here" />}
                              </ProductGrid>
                            </div>
                          )}
                        </Sortable>
                      )
                    })}
                    {!entity && withoutProject.length > 0 && (
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">No project</h3>
                        <ProductGrid products={withoutProject} projects={projectOptions} stats={stats} />
                      </div>
                    )}
                  </div>
                </SortableContext>
              </section>
            )
            return entity ? (
              <Sortable key={entity.id} id={`entity:${entity.id}`}>
                {body}
              </Sortable>
            ) : (
              <div key={NONE}>{body(null)}</div>
            )
          })}
        </div>
      </SortableContext>
      <NewCompany />
    </DndContext>
  )
}

function EntityDetails({ entity }: { entity: Entity }) {
  const [open, setOpen] = useState(false)
  const save = (patch: Record<string, unknown>) => saveEntity(entity.id, patch)
  return (
    <>
      <span className="text-xs text-muted-foreground">{[entity.siren && `SIREN ${entity.siren}`, entity.website].filter(Boolean).join(' · ')}</span>
      <button type="button" onClick={() => setOpen(!open)} className="ml-auto text-xs text-muted-foreground hover:text-foreground">
        {open ? 'Done' : 'Edit company'}
      </button>
      {open && (
        <div className="grid w-full gap-x-6 md:grid-cols-2">
          <EditableField label="Name" field="name" value={entity.name} save={save} />
          <EditableField label="SIREN" field="siren" value={entity.siren} save={save} />
          <EditableField label="VAT number" field="vatNumber" value={entity.vatNumber} save={save} />
          <EditableField label="Email" field="email" value={entity.email} save={save} />
          <EditableField label="Website" field="website" value={entity.website} save={save} />
        </div>
      )}
    </>
  )
}

function NewCompany() {
  const [name, setName] = useState('')
  const [pending, startTransition] = useTransition()
  return (
    <form
      className="mt-10 flex max-w-sm items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        if (!name.trim()) return
        startTransition(async () => {
          try {
            await saveEntity(null, { name })
            setName('')
          } catch {
            toast.error('Could not add the company')
          }
        })
      }}
    >
      <input
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Add a legal company"
        className="h-8 flex-1 rounded-md border bg-background px-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      />
      <Button size="sm" type="submit" loading={pending} disabled={!name.trim()}>
        <Plus /> Add
      </Button>
    </form>
  )
}
