# PropertyAgent CRM — Design System

Reverse-engineered from ZIEN CRM's live computed styles (2 Sep 2026). These are their **actual** values, not eyeballed. ZIEN is Tailwind + Next.js, so if your CRM is Tailwind you can paste most of this straight in.

The reason it reads "professional" is not the colors — it's **restraint**. Five rules do most of the work:

1. **One accent, used as a gradient.** Blue→sky, and nothing else competes.
2. **Borders instead of shadows.** Cards have a 1px `gray-100` border and *no* box-shadow. Shadow appears on exactly one thing: the active tab.
3. **A tinted page, white cards.** The canvas is `#eef2f9`, not white — so white cards float without needing shadow.
4. **Two fonts, one job each.** Space Grotesk for headings only, Geist for everything else.
5. **Fixed control heights.** Every control in a toolbar row is `h-10`. Every segmented tab is `30px`. Nothing is 38px or 42px.

---

## 1. Tokens

### Fonts

```
--font-display : "Space Grotesk", system-ui, sans-serif   /* headings only */
--font-sans    : "Geist", system-ui, sans-serif           /* everything else */
```

Both are free on Google Fonts. Space Grotesk on an H1 with `tracking-tight` is doing a lot of the "not a bootstrap app" feeling.

### Color

```css
/* Brand — Tailwind blue, aliased */
--brand-50 : #eff6ff;
--brand-100: #dbeafe;
--brand-500: #3b82f6;
--brand-600: #2563eb;   /* primary */
--sky-400  : #38bdf8;   /* gradient end */
--sky-500  : #0ea5e9;

/* Canvas */
--app-bg   : #eef2f9;   /* NOT white — this is the trick */
--card-bg  : #ffffff;
--border   : #f3f4f6;   /* gray-100, cards */
--border-2 : #e5e7eb;   /* gray-200, controls */

/* Text */
--text     : #0f172a;   /* slate-900 */
--text-2   : #6b7280;   /* gray-500 — labels, subtitles, idle tabs */
--text-3   : #9ca3af;   /* gray-400 — placeholders, meta */
```

### The page background (copy this exactly)

```css
.app-shell {
  background-color: #eef2f9;
  background-image: radial-gradient(
    900px 420px at 78% -8%,
    rgba(147, 197, 253, 0.55),
    transparent 60%
  );
}
```

A single soft blue glow bleeding in from the top-right, off-canvas. It's subtle enough that you don't consciously see it, and it's most of why the app doesn't look flat.

### Radii

```
rounded-lg  8px   — segmented tabs
rounded-xl  12px  — buttons, inputs, pills
rounded-2xl 16px  — cards, panels
rounded-full      — filter chips, avatars, the title bar
```

### Semantic / stage colors

Reused identically across chips, kanban headers and funnel bars:

| Meaning | Text | Background |
|---|---|---|
| Appointment / pending | `amber-600` | `amber-50` |
| No show / lost | `red-600` | `red-50` |
| Show up / in progress | `orange-600` | `orange-50` |
| Closed / success | `emerald-600` | `emerald-50` |
| Converted | `green-700` | `green-50` |
| Not interested / cancelled | `gray-500` | `gray-100` |
| WhatsApp affordance | `#25D366` | — |

---

## 2. Components (exact Tailwind from ZIEN)

### Page title block

```html
<div class="flex items-stretch gap-3">
  <div class="w-1 shrink-0 self-stretch rounded-full bg-gradient-to-b from-brand-500 to-sky-400"></div>
  <div class="min-w-0">
    <h1 class="font-display text-2xl font-bold tracking-tight text-gray-900">Working Leads</h1>
    <div class="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-500">
      <span class="text-brand-600 font-semibold">0</span> active leads to work on
    </div>
  </div>
</div>
```

That 4px vertical gradient bar next to every page title is the single cheapest thing you can steal. It costs one div and it brands every screen.

The subtitle is always **one big number + a plain-English clause** — "1 ongoing apt waiting to be closed", "1 lead in your database". Never a stat grid at the top of the page.

### Card

```html
<div class="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5">
```

No shadow. `p-5` (20px). That's the whole card.

### Primary button

```html
<button class="flex h-10 shrink-0 items-center gap-2 rounded-xl px-4
               bg-gradient-to-r from-brand-600 to-sky-500
               text-white text-sm font-semibold
               hover:brightness-110 transition">
```

`hover:brightness-110` rather than a second hover color — one gradient, no variants to maintain.

### Secondary button

```html
<button class="flex h-10 items-center gap-1.5 rounded-xl px-3
               border border-gray-200 bg-white
               text-sm font-medium text-gray-500
               hover:bg-gray-50 hover:border-gray-300 hover:text-gray-700 transition">
```

### Segmented tabs (Active / Inactive / Appointment)

```html
<!-- active -->
<button class="flex h-[30px] shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-3
               text-[13px] font-semibold whitespace-nowrap transition
               bg-gradient-to-r from-brand-600 to-sky-500 text-white
               shadow-md shadow-brand-600/25">

<!-- idle -->
<button class="flex h-[30px] shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-3
               text-[13px] font-semibold whitespace-nowrap transition
               text-gray-500 hover:bg-gray-900/5 hover:text-gray-800">
```

Note `shadow-brand-600/25` — a *colored* shadow matching the button. This is the only shadow in the entire app, and it's what makes the active tab pop.

Each tab carries its count as a second element, not in the label text.

### Filter chip

```html
<button class="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium
               border border-gray-200 bg-white text-gray-500
               hover:border-gray-300 hover:text-gray-700 transition shrink-0">
```

### Search input

```html
<input class="w-full h-10 pl-9 pr-4 rounded-xl border border-gray-200 bg-white text-sm
              outline-none transition
              focus:border-blue-500 focus:ring-2 focus:ring-blue-100">
```

Icon absolutely positioned in the `pl-9` gutter.

### Table header

```
text-[11px] font-semibold uppercase tracking-wider text-gray-400
```

Sortable columns get a small ⇅ glyph at `text-gray-300`, darkening on hover.

---

## 3. Layout rules

- **Icon rail**: 64px fixed, transparent over the app background (not a white sidebar). Active item = `rounded-lg bg-brand-600` with a white icon. Idle = `text-gray-400`. Avatar pinned bottom.
- **Toolbar row**: title block → tabs → spacer → search (flex-1, max ~520px) → follow-up pill → Configuration → primary CTA. All `h-10`, `gap-2`.
- **Filter chip row** sits on its own line below the toolbar, `gap-2`, horizontally scrollable on mobile.
- **Content max-width**: none — cards stretch. Two-column dashboard is a plain `grid grid-cols-1 lg:grid-cols-2 gap-4`.
- **Kanban**: columns `min-w-[260px]`, horizontal scroll, `snap-x` on mobile. Empty column shows a centered `text-gray-300 text-xs` "Empty" — do not leave columns blank.

---

## 4. Copy voice

This is half of why it feels professional. ZIEN never writes "No data".

| Instead of | They write |
|---|---|
| Loading… | "Counting…" / "Working out your follow-ups" |
| No results | "No active leads yet" + *"Leads land here when someone assigns them to you, or when you take one from the Collab Pool."* |
| Empty column | "Empty" |
| Section help | *"Sequence = a lead is handed to collaborators one after another; if a collaborator doesn't work it in time, it passes to the next."* |

Every empty state teaches the feature. Every config tab opens with a one-sentence blue info banner defining the term. Write these before you write the component.

---

## 5. Dark mode

Every class in ZIEN ships a `dark:` pair. If you want it, the mapping is mechanical:

```
bg-white        → dark:bg-gray-900
border-gray-100 → dark:border-gray-800
border-gray-200 → dark:border-gray-700
text-gray-900   → dark:text-white
text-gray-500   → dark:text-slate-400
hover:bg-gray-50→ dark:hover:bg-gray-800
--app-bg #eef2f9 → #0b1220 with the same radial glow at lower alpha
```

Do it from day one or not at all — retrofitting is the expensive version.

---

## 6. Setup

```bash
npm i @fontsource-variable/space-grotesk @fontsource-variable/geist
```

```js
// tailwind.config.js
theme: {
  extend: {
    fontFamily: {
      display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
      sans:    ['Geist', 'system-ui', 'sans-serif'],
    },
    colors: {
      brand: { 50:'#eff6ff',100:'#dbeafe',500:'#3b82f6',600:'#2563eb',700:'#1d4ed8' },
    },
    backgroundImage: {
      'app-glow': 'radial-gradient(900px 420px at 78% -8%, rgba(147,197,253,.55), transparent 60%)',
    },
  },
}
```

---

## 7. Do this first

If you only change four things, change these — they'll get you 80% of the look in an afternoon:

1. Page background `#eef2f9` + the radial glow, white `rounded-2xl` cards with `border-gray-100` and **no shadow**.
2. Space Grotesk on headings, with the 4px vertical gradient bar beside every page title.
3. One blue→sky gradient for every primary action and active tab, with `shadow-brand-600/25` on the active tab only.
4. Lock every toolbar control to `h-10` and every radius to the 8/12/16 scale.

Then rewrite your empty states in ZIEN's voice. That last one is free and it changes the perceived quality more than any color choice.
