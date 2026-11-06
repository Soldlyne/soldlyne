# Design system

## The closing rule

In a ledger, the double rule under a figure means it's final: counted, settled. A deal moves stage by stage until someone draws that line. So the look is printed matter, a ledger and a signed quote: flat ink on paper, with no gradient, glow or glass.

- **Colours** (`app/globals.css`). Bordeaux, the colour of sealing wax, for actions, links and the mark. Paper neutrals with a rose undertone, light first; ink is near-black. At night the background is near-black with the same undertone and the primary colour is rose. The sidebar is the one dark surface of a light page, in the wine of the mark. Components use the semantic tokens (`bg-primary`, `text-muted-foreground`, `text-success`), never raw palette classes.
- **Status.** Green says won, a vivid red-orange says destructive or overdue, ochre says it needs a look. Bordeaux never means an error: it is darker and bluer than `--destructive`, and an error always says so in words.
- **Type.** Schibsted Grotesk for everything you read, IBM Plex Mono for figures. `.num` sets a figure in the mono, so amounts line up in every column and read as a ledger's. Both are under the SIL Open Font License. Don't turn on `tnum` for the sans: its tabular comma sits apart from the digits.
- **Mark** (`components/layout/logo.tsx`, `app/icon.svg`). A lowercase s, doubly underlined: the way a ledger marks a final figure. The s is outlined from the font, so it needs nothing to load.
- **The rule** (`.rule-double`). Two hairlines, in the current text colour: under a quote's total, at the top of the pages outside the app, over an empty state. It's the only ornament. Use it where something is closed or starts fresh, not as a divider.
- **Theme.** It follows the system until a member chooses, in the workspace menu. Every colour comes from a token, so both modes hold.

## Buttons

Sizes are the only way to size a button: never pass `h-*`, `size-*`, `px-*` or `text-*` through `className`.

- `default` (36px): page header actions, dialog footers, forms.
- `sm` (32px): toolbars, card headers, filters, table actions.
- `xs` (28px): dense inline actions inside table rows or lists.
- `lg` (40px): the single main action of an auth or empty page.
- `icon`, `icon-sm`, `icon-xs`, `icon-lg`: square buttons matching the sizes above.

## Touch

On touch screens, controls are 44px tall and checkboxes keep their drawn size with an invisible 44px hit area. On phones, fields are 16px so iOS doesn't zoom on focus. The rules are at the end of `app/globals.css`.
