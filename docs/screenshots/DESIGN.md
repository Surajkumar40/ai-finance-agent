# Design notes

How the interface is put together, so the next change stays consistent.

## Direction

A calm, paper-and-ink look for a tool people open to think about money. Warm neutrals, one accent (petrol blue), no gradients, no glow, no tinted shadows. Money colours (green, red, amber) are used only to mean income, spending and warning. Numbers use IBM Plex Mono with tabular figures so columns line up.

## Colour tokens

Colours that change between themes are CSS variables in `frontend/src/index.css` (`:root` for light, `.dark` for dark). `tailwind.config.js` maps them to the usual Tailwind names, so a single class works in both themes.

| Use | Class | Light | Dark |
|---|---|---|---|
| Page background | `bg-canvas` | `#f6f5f1` | `#141413` |
| Cards | `bg-surface` / `.card` | `#ffffff` | `#1c1c1a` |
| Dialogs, menus | `bg-raised` | `#ffffff` | `#242421` |
| Borders | `border-line` | `#e4e1d8` | `#343430` |
| Body text | `text-slate-900` (add `dark:text-slate-100`) | | |
| Secondary text | `text-slate-400` to `text-slate-600` | retuned per theme | |
| Accent | `bg-brand-500`, `text-brand-500` (`dark:text-brand-400` on dark) | `#1f6f8b` | |
| Income / spend / warning | `text-emerald-500`, `text-red-500`, `text-amber-500` | retuned per theme | |

Secondary greys and the money colours were checked for at least 4.5:1 contrast against the surfaces they sit on, in both themes. Re-check when you change a value.

## Shared classes (`index.css`)

`.card`, `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.btn-danger`, `.field`, `.field-label`, `.chip`, `.skeleton`, `.modal-overlay` + `.modal-panel`.

## Theme

`index.html` sets the theme before the first paint, so there is no white flash. `ThemeContext` follows the device until the person clicks the toggle; only then is the choice saved.

## Motion

Short fades and small slides (0.16 to 0.22 s). Everything is switched off for people who ask their device for reduced motion.

## Accessibility

Skip link, one `<main>` that receives focus on page change, visible focus ring on everything clickable, the phone menu is a real dialog (Escape closes it, focus stays inside, the page behind does not scroll, and it is unreachable while closed).

## Temporary compatibility rules

The bottom of `index.css` has rules for the old hard-coded dark colours (`#16161f`, `#0d0d14`, `#11111a`, `#1e1e2e`, `#1c1c28`) so pages not yet moved to the tokens still match. When `grep -r "<colour>" frontend/src` finds nothing, delete that rule.