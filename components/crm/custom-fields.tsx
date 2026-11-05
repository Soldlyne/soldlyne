'use client'

import type { CustomField } from '@prisma/client'
import { EditableField } from './editable-field'

type Option = { value: string; label: string }

/** Rows for the user-defined fields of a record; values live in its `custom` JSON. */
export function CustomFields({
  fields,
  values,
  save,
}: {
  fields: CustomField[]
  values: unknown
  save: (patch: Record<string, unknown>) => Promise<unknown>
}) {
  const custom = (values ?? {}) as Record<string, unknown>
  return fields.map((field) => {
    const raw = custom[field.key]
    const value = Array.isArray(raw) ? raw.join(', ') : raw === undefined || raw === null ? null : String(raw)
    const saveCustom = (patch: Record<string, unknown>) => save({ custom: { [field.key]: patch[field.key] } })
    const options = (field.options as Option[] | null) ?? undefined
    const type =
      field.type === 'SELECT' ? 'select' : field.type === 'DATE' ? 'date' : field.type === 'URL' ? 'url' : field.type === 'MULTI_SELECT' ? 'list' : 'text'
    return (
      <EditableField
        key={field.id}
        label={field.label}
        field={field.key}
        value={value}
        save={saveCustom}
        type={type}
        options={options}
        href={field.type === 'URL' && value ? value : undefined}
        parse={field.type === 'NUMBER' ? (input) => (input === '' ? null : Number(input)) : field.type === 'BOOLEAN' ? (input) => /^(y|yes|true|1)$/i.test(input) : undefined}
      />
    )
  })
}
