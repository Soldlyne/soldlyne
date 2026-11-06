'use client'

import { useTheme } from 'next-themes'
import { DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem } from '@/components/ui/dropdown-menu'

const THEMES = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

/** Light, dark or as the system is: this browser remembers it. */
export function ThemeChoice() {
  const { theme, setTheme } = useTheme()
  return (
    <>
      <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Theme</DropdownMenuLabel>
      <DropdownMenuRadioGroup value={theme ?? 'system'} onValueChange={setTheme}>
        {THEMES.map(({ value, label }) => (
          <DropdownMenuRadioItem key={value} value={value} onSelect={(event) => event.preventDefault()}>
            {label}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </>
  )
}
