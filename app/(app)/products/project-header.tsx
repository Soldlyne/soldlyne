'use client'

import Link from 'next/link'
import type { Project } from '@prisma/client'
import { saveProject } from '@/lib/crm/actions'
import { EditableField } from '@/components/crm/editable-field'

export function ProjectHeader({ project, entities, handle }: { project: Project; entities: { value: string; label: string }[]; handle?: React.ReactNode }) {
  const save = (patch: Record<string, unknown>) => saveProject(project.id, patch)
  return (
    <div className="rounded-lg bg-surface p-3">
      <div className="flex items-center gap-2">
        {handle}
        <span className="size-3 rounded-full" style={{ backgroundColor: project.color }} aria-hidden />
        <Link href={`/pipeline/${project.id}`} className="font-semibold hover:underline">
          {project.name}
        </Link>
        {project.archived && <span className="text-xs text-muted-foreground">Archived</span>}
      </div>
      <div className="mt-1 grid gap-x-6 md:grid-cols-2">
        <EditableField label="Pitch" field="tagline" value={project.tagline} save={save} />
        <EditableField label="Website" field="url" value={project.url} save={save} href={project.url ?? undefined} />
        <EditableField label="Company" field="entityId" value={project.entityId} save={save} type="select" options={entities} />
      </div>
    </div>
  )
}
