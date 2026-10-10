---
name: Rabbit Studio
description: A dense, IDE-grade RabbitMQ console where queues, messages and routes are the widest, clearest thing on screen.
colors:
  accent: "#3574F0"
  accent-hover-dark: "#4682FA"
  accent-hover-light: "#2A63D6"
  accent-text-dark: "#6B9BFA"
  accent-text-light: "#2A63D6"
  on-accent: "#FFFFFF"
  seam-dark: "#1A1B1E"
  editor-dark: "#1E1F22"
  row-hover-dark: "#26282C"
  panel-dark: "#2B2D30"
  popover-dark: "#2B2D30"
  line-soft-dark: "#2F3135"
  line-dark: "#393B40"
  hover-dark: "#393B40"
  field-line-dark: "#4E5157"
  sel-soft-dark: "#25324A"
  sel-dark: "#2E436E"
  text-3-dark: "#959AA2"
  text-2-dark: "#B4B8BF"
  text-dark: "#DFE1E5"
  editor-light: "#FFFFFF"
  popover-light: "#FFFFFF"
  panel-light: "#F7F8FA"
  row-hover-light: "#F4F6FA"
  line-soft-light: "#EFF0F3"
  hover-light: "#E9EBEF"
  line-light: "#E4E6EB"
  seam-light: "#E4E6EB"
  field-line-light: "#C9CCD6"
  sel-soft-light: "#E8EEFD"
  sel-light: "#D5E1FF"
  text-3-light: "#6B6F7C"
  text-2-light: "#4F5361"
  text-light: "#1E1F22"
  ok-dark: "#5FB865"
  warn-dark: "#E2B45C"
  danger-dark: "#E5675F"
  ok-light: "#3F8F46"
  warn-light: "#A36B00"
  danger-light: "#C9372C"
  json-key-dark: "#C77DBB"
  json-string-dark: "#6AAB73"
  json-number-dark: "#2AACB8"
  json-keyword-dark: "#CF8E6D"
  json-bson-dark: "#56A8F5"
  json-punct-dark: "#8C8F96"
  code-comment-dark: "#7A7E85"
  json-key-light: "#871094"
  json-string-light: "#067D17"
  json-number-light: "#1750EB"
  json-keyword-light: "#0033B3"
  json-bson-light: "#00627A"
  json-punct-light: "#6E7180"
  code-comment-light: "#8C8C8C"
  conn-green: "#4FA25A"
  conn-blue: "#3574F0"
  conn-amber: "#C9912C"
  conn-red: "#D6453D"
  conn-magenta: "#B4448F"
  conn-teal: "#1E9AA6"
  conn-violet: "#7B61D1"
  conn-slate: "#6E7380"
  on-connection: "#15161A"
  series-1-dark: "#3987E5"
  series-2-dark: "#D95926"
  series-3-dark: "#199E70"
  series-1-light: "#2A78D6"
  series-2-light: "#EB6834"
  series-3-light: "#1BAF7A"
  mark-top: "#FFC28F"
  mark-body: "#E8590C"
  mark-rim: "#8F3506"
  mark-highlight: "#FFE2C8"
typography:
  display:
    fontFamily: "Inter Variable, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "22px"
    fontWeight: 600
    lineHeight: 1.2
  headline:
    fontFamily: "Inter Variable, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.3
  title:
    fontFamily: "Inter Variable, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.45
  body:
    fontFamily: "Inter Variable, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.45
    fontFeature: "\"cv11\", \"ss01\""
  label:
    fontFamily: "Inter Variable, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.45
  caption:
    fontFamily: "Inter Variable, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.45
  micro:
    fontFamily: "Inter Variable, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "10.5px"
    fontWeight: 400
    lineHeight: 1.3
  data:
    fontFamily: "JetBrains Mono Variable, ui-monospace, SF Mono, Menlo, Consolas, monospace"
    fontSize: "12.5px"
    fontWeight: 400
    lineHeight: "20px"
    fontFeature: "\"liga\" 0, \"tnum\""
  data-compact:
    fontFamily: "JetBrains Mono Variable, ui-monospace, SF Mono, Menlo, Consolas, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: "20px"
  code:
    fontFamily: "JetBrains Mono Variable, ui-monospace, SF Mono, Menlo, Consolas, monospace"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: "20px"
    fontFeature: "\"liga\" 0"
  metric:
    fontFamily: "JetBrains Mono Variable, ui-monospace, SF Mono, Menlo, Consolas, monospace"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: "20px"
    letterSpacing: "-0.01em"
    fontFeature: "\"tnum\""
rounded:
  xs: "3px"
  sm: "4px"
  md: "6px"
  lg: "8px"
  xl: "10px"
spacing:
  xxs: "2px"
  xs: "4px"
  sm: "6px"
  md: "8px"
  lg: "12px"
  xl: "16px"
  xxl: "24px"
  row: "24px"
  control: "28px"
  field: "32px"
  bar: "40px"
  tab-row: "36px"
  status: "26px"
  tree-indent: "16px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.md}"
    padding: "0 10px"
    height: "28px"
  button-primary-hover-dark:
    backgroundColor: "{colors.accent-hover-dark}"
  button-primary-hover-light:
    backgroundColor: "{colors.accent-hover-light}"
  button-secondary:
    textColor: "{colors.text-dark}"
    rounded: "{rounded.md}"
    padding: "0 10px"
    height: "28px"
  button-secondary-hover-dark:
    backgroundColor: "{colors.hover-dark}"
  button-ghost:
    textColor: "{colors.text-2-dark}"
    rounded: "{rounded.md}"
    padding: "0 10px"
    height: "28px"
  button-small:
    rounded: "{rounded.md}"
    padding: "0 8px"
    height: "24px"
  button-icon:
    textColor: "{colors.text-2-dark}"
    rounded: "{rounded.md}"
    size: "28px"
  button-icon-sm:
    rounded: "{rounded.md}"
    size: "24px"
  button-icon-xs:
    rounded: "{rounded.sm}"
    size: "20px"
  button-destructive-dark:
    backgroundColor: "{colors.danger-dark}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.md}"
    padding: "0 10px"
    height: "28px"
  button-destructive-light:
    backgroundColor: "{colors.danger-light}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.md}"
    padding: "0 10px"
    height: "28px"
  input-dark:
    backgroundColor: "{colors.editor-dark}"
    textColor: "{colors.text-dark}"
    rounded: "{rounded.md}"
    padding: "0 10px"
    height: "32px"
  input-light:
    backgroundColor: "{colors.editor-light}"
    textColor: "{colors.text-light}"
    rounded: "{rounded.md}"
    padding: "0 10px"
    height: "32px"
  query-field:
    typography: "{typography.data-compact}"
    rounded: "{rounded.sm}"
    padding: "0 8px"
    height: "28px"
  segmented-control:
    rounded: "{rounded.md}"
    padding: "2px"
    height: "28px"
  segment:
    rounded: "{rounded.sm}"
    padding: "0 10px"
    height: "24px"
  switch:
    rounded: "15px"
    width: "30px"
    height: "18px"
  tree-row:
    typography: "{typography.body}"
    height: "{spacing.row}"
  tree-row-selected-dark:
    backgroundColor: "{colors.sel-dark}"
  tree-row-selected-light:
    backgroundColor: "{colors.sel-light}"
  grid-cell:
    typography: "{typography.data}"
    padding: "0 10px"
    height: "{spacing.row}"
  grid-row-selected-dark:
    backgroundColor: "{colors.sel-soft-dark}"
  grid-row-selected-light:
    backgroundColor: "{colors.sel-soft-light}"
  grid-header-dark:
    backgroundColor: "{colors.panel-dark}"
    textColor: "{colors.text-2-dark}"
    typography: "{typography.label}"
    padding: "0 10px"
    height: "30px"
  main-toolbar-dark:
    backgroundColor: "{colors.panel-dark}"
    height: "{spacing.bar}"
  view-toolbar-dark:
    backgroundColor: "{colors.editor-dark}"
    padding: "0 12px"
    height: "{spacing.bar}"
  editor-tab:
    textColor: "{colors.text-2-dark}"
    padding: "0 6px 0 12px"
    height: "{spacing.tab-row}"
  section-header:
    textColor: "{colors.text-2-dark}"
    typography: "{typography.caption}"
    padding: "0 12px"
    height: "30px"
  menu:
    backgroundColor: "{colors.popover-dark}"
    rounded: "{rounded.lg}"
    padding: "4px"
    width: "220px"
  menu-item-hover:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    rounded: "5px"
    padding: "0 8px"
    height: "28px"
  palette-item-selected-dark:
    backgroundColor: "{colors.sel-dark}"
    rounded: "{rounded.md}"
    height: "32px"
  tooltip:
    backgroundColor: "{colors.popover-dark}"
    rounded: "{rounded.md}"
    padding: "4px 8px"
  toast:
    backgroundColor: "{colors.popover-dark}"
    rounded: "{rounded.lg}"
    padding: "10px 14px"
  status-bar-dark:
    backgroundColor: "{colors.panel-dark}"
    textColor: "{colors.text-2-dark}"
    typography: "{typography.caption}"
    height: "{spacing.status}"
  dialog:
    backgroundColor: "{colors.editor-dark}"
    rounded: "{rounded.xl}"
    width: "448px"
  dialog-confirm:
    backgroundColor: "{colors.editor-dark}"
    rounded: "{rounded.xl}"
    width: "460px"
  dialog-task:
    rounded: "{rounded.xl}"
    width: "560px"
  confirm-guard:
    rounded: "{rounded.md}"
    padding: "10px"
  connection-chip:
    textColor: "{colors.on-connection}"
    rounded: "{rounded.sm}"
    size: "18px"
  connection-chip-sm:
    textColor: "{colors.on-connection}"
    rounded: "{rounded.xs}"
    size: "14px"
  connection-dot:
    rounded: "2px"
    size: "8px"
  metrics-cell:
    typography: "{typography.caption}"
    padding: "7px 12px 8px"
  notice:
    padding: "4px 8px 4px 12px"
    height: "36px"
  keycap:
    backgroundColor: "{colors.panel-dark}"
    rounded: "{rounded.xs}"
    padding: "0 4px"
    height: "16px"
  tag:
    rounded: "{rounded.xs}"
    padding: "2px 4px"
  meter:
    backgroundColor: "{colors.line-dark}"
    rounded: "{rounded.xs}"
    width: "64px"
    height: "4px"
  problem-row:
    typography: "{typography.body}"
    padding: "6px 12px"
  route-item:
    typography: "{typography.data-compact}"
    padding: "0 12px"
    height: "26px"
  payload-editor:
    typography: "{typography.code}"
  topology-node:
    backgroundColor: "{colors.panel-dark}"
    rounded: "{rounded.md}"
  binding-pill:
    backgroundColor: "{colors.editor-dark}"
    rounded: "{rounded.xs}"
    height: "15px"
  live-dot:
    backgroundColor: "{colors.ok-dark}"
    size: "6px"
---

<!-- Recorded 2026-10-10 from the shipped app (Tauri 2 + React 19 + Tailwind 4 + shadcn/ui), replacing the earlier record taken from the mockup. Tokens come from src/index.css: the @theme block maps Tailwind names (bg-editor, text-fg-2, border-line, rounded-md, shadow-overlay, font-data) onto --t-* variables defined once per theme in the :root[data-theme] blocks; shadcn's own names (primary, popover, muted, destructive, ring, border, input) are mapped onto the same variables, so shadcn primitives render in this system. Components live in src/components/ui (primitives), src/components/data (DataTable, Inspector, TypedTree, JsonView and parts.tsx), src/components/charts, the shell folders and src/components/views. Connection colors live in src/lib/connectionColor.ts; the app mark in src/components/layout/AppLogo.tsx and icons/icon-source.svg.
The visual world is inherited from the family: postgres-studio/DESIGN.md (and mongo-studio/DESIGN.md), "The Data IDE". A change to an inherited token is a family change and belongs in the sibling first. UI copy is English, confirmed by the user on 2026-10-10; RabbitMQ terms stay verbatim. -->

# Design System: Rabbit Studio

## Overview

**Creative North Star: "The Data IDE"**

Rabbit Studio is the third sibling of Mongo Studio and Postgres Studio and inherits their world: a category-standard desktop developer tool, dense, quiet and exact. 13px Inter chrome, JetBrains Mono for every piece of data, 24px rows, 16px Lucide line icons, and a neutral stack of near-blacks (or near-whites) separated by hairline rules. It is an IDE frame (main toolbar, tool stripe, Explorer, editor tabs with split panes, status bar), not a web dashboard: there is no sidebar of pages and no KPI cards. Queues read like tables, messages like rows, and a message's properties, headers and payload like the typed row inspector.

The one loud signal is place. Every cluster is a connection with its own color, and that color rides on the main toolbar's leading tint, the tab's dot and underline, the initials chip and the status bar, so a production tab never looks like a local one. Clusters sit in environment folders (Production, Staging, Development) in the Explorer. Beyond identity, color is spent on the single blue for selection and primary action, on ok / warn / danger for health, on syntax color for typed values, and on three validated series hues in charts. Problems surface first: unhealthy queues, nodes and clusters carry warn or danger marks in the tree, notices at the top of the view, and a problems list. There is no AI assistant in this app.

Two twin themes, dark default and light, switched by a `data-theme` attribute on the root; same structure and token names.

**Key Characteristics:**
- IDE density: 24px data and tree rows, 28px controls, 32px form fields, 40px toolbars, 36px tab row, 26px status bar.
- Two type voices: Inter for interface, JetBrains Mono (ligatures off, tabular figures) for all data, names, routing keys and payloads.
- Tonal layering, not shadows: editor, panel and seam tones plus 1px rules; the overlay shadow only on floating layers.
- One blue accent in both themes; syntax colors carry value types.
- Connection identity is color-coded and repeated on every surface; clusters grouped by environment folder.
- Health is stated in strips and marks (notices, metrics strips, tree marks, problems list), never in cards; a state is always an icon plus a word, never color alone.
- RabbitMQ terminology verbatim: vhost, exchange, binding, routing key, ack, prefetch, quorum / classic / stream, x-death.
- Motion on state only, 100-160ms on one ease-out curve, nothing on load; reduced motion collapses every animation.

## Colors

The family's JetBrains-derived neutral stack in twin themes, one blue accent, three status hues, the syntax palette, the eight-swatch connection palette, a three-hue chart series and the orange app mark. Every interface color is a theme variable; components never carry a hex of their own, except the connection chip's dark initials and the app mark.

### Primary
- **Selection Blue** (accent): primary buttons (Get, Publish, Trace a message), the 2px keyboard focus outline and the field focus border and ring, the active tool-stripe marker, the highlighted menu item, the traced route in the topology. Identical in both themes; hover deepens in light (accent-hover-light) and brightens in dark (accent-hover-dark).
- **Link Blue** (accent-text-dark / accent-text-light): accent as text on neutral grounds: link buttons, "Try again", the info notice icon, sort arrows in grid heads, the x-death card's reply icon.
- **Selection Fill / Selection Tint** (sel-*, sel-soft-*): the selected tree row and palette item take the fill; the selected grid row takes the softer tint. Text selection also uses the fill.

### Secondary: health
- **OK** (ok-dark / ok-light): healthy state labels, the live dot, connected dots, "valid JSON", meters under 75%, the 1.2s saved flash.
- **Warn** (warn-dark / warn-light): warning notices (9% over the editor tone), warm tree marks and counts, meters from 75%, dead-letter edges in the topology, the read-only lock in the status bar.
- **Danger** (danger-dark / danger-light): critical notices (9% fill), hot tree marks, unreachable clusters, broken consumer and missing-exchange marks in the topology, the confirm dialog's warning icon, the guard tint (8%), destructive buttons and destructive menu items, meters from 90%.

### Tertiary: data syntax
- Inherited unchanged: **Key Orchid**, **String Green**, **Number Cyan / Blue**, **Keyword Clay / Navy**, **Type Blue / Teal** (json-bson-*, used for message ids and timestamps), **Punctuation Grey**, **Comment Grey**. In typed trees: strings green, numbers number color, booleans keyword color, null italic Text 3, a faint 10px type tag at the right of each row. In the x-death card keys take Key Orchid, reasons the keyword color, times the type color.

### Chart series
- **Series Blue, Series Orange, Series Green** (series-1/2/3, per theme; `--t-s1..s3`): the only chart line colors, in that order, validated for color-vision deficiency on the editor tone. Never used outside charts, never for status, never for connections.

### Connection palette
- Eight swatches in picker order: **Green, Blue, Amber, Red, Magenta, Teal, Violet, Slate**. A connection without a chosen color gets a stable one hashed from its id. The workspace (every-cluster) tab is always **Slate**, never a connection's hue. Chip initials are set in **Connection Ink** (on-connection) at 600. Production clusters take the hot hues by convention, not by rule: the folder, the lock mark and the typed guard carry the environment; the color carries the connection.

### App mark
- **Mark Peach / Mark Orange / Mark Rim / Mark Highlight** (mark-top, mark-body, mark-rim, mark-highlight): the family's rounded-square mark on a near-black gradient tile, with Rabbit's own object, a rabbit sitting in profile built from soft-cornered blocks, the RabbitMQ mark's square window become its eye (Mongo Studio has a cylinder, Postgres Studio a table). The source is icons/icon-source.svg; the toolbar renders it at 18px. Used only inside the app mark; never as an interface color.

### Neutral
- **Editor** (editor-*): the view surface, tab row, view toolbars, inspector, dialogs, fields (fields share the editor tone in both themes).
- **Panel** (panel-*): main toolbar, status bar, Explorer, grid heads, keycaps, topology nodes. **Popover** (popover-*): menus, palette, tooltips, toasts; panel tone in dark, white in light.
- **Seam** (seam-*): the rule between the window chrome bars (main toolbar, status bar) and the editor.
- **Line / Line Soft** (line-*, line-soft-*): 1px structural rules / row and cell dividers. **Field Line** (field-line-*): field and secondary-button strokes, the switch's off track, hovered topology nodes.
- **Hover / Row Hover** (hover-*, row-hover-*): button and icon hover / tree, grid, list and metrics-cell hover.
- **Text / Text 2 / Text 3** (text-*, text-2-*, text-3-*): primary / secondary chrome and data-adjacent labels / faint counts, placeholders, row numbers and the empty-value dash.

### Named Rules
**The One Blue Rule.** The accent is the only interface hue. It marks selection, focus, the traced route and the single primary action per bar; it is never decoration.

**The Connection Owns Its Color Rule.** Connection colors appear only where they identify a connection (chip, tab dot and underline, toolbar tint, status bar). They are never reused for status, types, chart series or emphasis, and status colors are never a connection's only cue.

**The Twin Themes Rule.** Every token exists in both themes under the same name; a component reads `var(--color-*)` and never branches on the theme.

## Typography

**Interface Font:** Inter Variable (with system-ui, -apple-system, Segoe UI, sans-serif), cv11 and ss01 on, weights 400-600, bundled through fontsource.
**Data / Code Font:** JetBrains Mono Variable (with ui-monospace, SF Mono, Menlo, Consolas, monospace), weights 400-500, ligatures off, tabular numerals, bundled through fontsource.

**Character:** The JetBrains pairing, split by content: anything stored in or sent to the broker (queue, exchange and vhost names, routing keys, headers, payloads, filters, URIs) is mono; anything the app says is Inter. 13px is set on the body, not the root, so Tailwind's rem spacing stays 16px-based.

### Hierarchy
- **Display** (600, 22px, 1.2): the welcome screen title only.
- **Headline** (600, 15px, 1.3): dialog titles.
- **Title** (600, 13px): panel heads ("Explorer"), view and inspector titles (object names in mono 500 at 13px / 12.5px).
- **Body** (400, 13px, 1.45): chrome text, tree rows, tab labels, menu items, buttons.
- **Label** (500, 12px): grid column heads, state labels, notices, dialog body notes, small buttons.
- **Caption** (400, 11px): metrics keys and details, section headers (600, Text 2, sentence case), status bar, key hints, problem sublines.
- **Micro** (10.5px): chart axes (mono), topology subtitles and binding keys; keycaps, tags and typed-tree type tags drop to 10px.
- **Data** (12.5px mono, 20px line): the grid, the `font-data` utility, tab and breadcrumb object names. **Data compact** (12px mono): inspector key/values, filter and guard fields, route lists, tree values.
- **Code** (13px mono, 20px line): the payload editor.
- **Metric** (500, 13px mono, 20px line, -0.01em, tabular): a metrics cell's value line. Chart legend values are 11.5px mono 500.

### Named Rules
**The Data Is Mono Rule.** Names of broker objects, routing keys, headers, filters and payloads are always JetBrains Mono with ligatures off; chrome is never mono.

**The Four Sizes Rule.** Chrome text lives on 13 / 12 / 11px; 10.5 and 10px are reserved for micro labels (axes, type tags, keycaps, tags, topology). Larger sizes belong only to the welcome title (22px), dialog titles (15px) and the palette input (14px); metric values stay at 13px.

## Layout

A fixed IDE frame. A 40px main toolbar on the panel tone (app mark, connection widget, breadcrumb cluster / vhost / object, centered Ctrl K search at min(320px, 28vw), New connection, Connect all, theme switcher), a narrow tool stripe of 30px buttons, a resizable Explorer, the editor area of one or more panes, each with a 36px tab row on the editor tone, and a 26px status bar on the panel tone. Main toolbar and status bar are ruled from the editor by the seam tone. Rabbit Studio has no Assistant panel and no saved scripts.

Inside a tab, every view starts with a 40px view toolbar (icon, mono object name, a quiet kind, tags, then the view switch and actions pushed right). The toolbar is a container query, so what it drops as it narrows follows its own width, not the window's. Below it, overview-type views stack full-width strips: notices, a metrics strip, a chart row (two columns, one under 1180px), then grids and section-headed lists. The inspector sits to the right of the grid at a width shared by every view, resizable, and hides under 900px. Dialog bodies pad 18px / 22px.

The Explorer is the map of every cluster: an "All clusters" row, then environment folders (Production, Staging, Development) with counts, then connections, then per connection Overview, Topology, a Runtime folder (Nodes, Connections, Channels), one row per vhost holding Exchanges / Queues / Streams folders, and an Admin folder (Users, Virtual hosts, Policies, Limits, Feature flags, Federation, Shovels, Definitions). Depth steps 16px.

Rhythm is the 2-4-6-8-12-16-24 scale. The reused breakpoints are 1180px (charts stack), 960px (breadcrumb and secondary status items drop), 900px (inspector hides) and 640px (search collapses to an icon).

### Named Rules
**The Data Is Widest Rule.** The grid and inspector own the center; chrome widths are fixed and small.

**The Always Show Where Rule.** Cluster, vhost and object are visible in the toolbar, the tab (which names its cluster beside the object) and the status bar; every destructive dialog names the cluster.

## Elevation & Depth

Flat, tonal and ruled. No panel, strip or row inside the window has a shadow; depth is the editor / panel / seam tones and 1px rules. The overlay shadow belongs to floating layers: menus, popovers, the palette, tooltips, toasts, dialogs and the chart tooltip, each on the popover or editor tone with a 1px line. Modal dialogs sit over a scrim (black at 40% in dark, the dark editor tone at 30% in light). Two small inherited lifts exist at rest: the pressed segment of a segmented control and the switch thumb. The only glow is the live dot's single expanding ring.

### Shadow Vocabulary
- **Overlay** (dark `0 12px 32px rgba(0,0,0,.45), 0 2px 6px rgba(0,0,0,.3)`; light `0 12px 32px rgba(20,24,35,.16), 0 2px 6px rgba(20,24,35,.08)`): every floating layer.
- **Segment lift** (dark `0 1px 2px rgba(0,0,0,.25)`; light `0 1px 2px rgba(20,24,35,.12)`, plus a 1px line ring): the pressed segment.
- **Switch thumb** (`0 1px 2px rgba(0,0,0,.3)`): the white switch knob.
- **Field focus ring** (2px accent at 30%): focused text inputs; everything else focuses with a 2px accent outline.
- **Live beat** (`0 0 0 0` to `0 0 0 6px`, ok at 55% fading out, 0.8s, once): the status bar's live dot, once per refresh.

### Named Rules
**The Flat Window Rule.** Nothing inside the window casts a shadow at rest, except the segment lift and the switch thumb. Shadow means "floating above".

## Shapes

Controls, fields, segmented tracks, tooltips and the chart tooltip round at 6px; segments, small icon buttons, chips, filter and guard fields and status items at 4px; tags, keycaps, meters, binding pills and the tree's disclosure target at 3px; menus, popovers and toasts at 8px (menu items 5px); dialogs at 10px. Borders are always 1px hairlines. Grids, trees, toolbars, notices, metrics strips and panels are square and edge-to-edge. The tab underline is a 2px bar with 2px top corners inset 6px; the tool-stripe marker a 2px pill; the connection dot an 8px square at 2px; the live dot a 6px circle; meters 4 x 64px tracks; the switch a full pill. Topology nodes are 6px-radius rects, binding keys 15px pills at 3px.

## Components

Components are React: shadcn/ui primitives restyled onto the design tokens (button, input, select, checkbox, switch, segmented control, tabs, dialog, dropdown and context menu, popover, tooltip, command, sonner toasts) plus the data parts every view shares (ViewToolbar, ViewTitle, Metrics, Notice, StateLabel, SectionHeader, KeyValues, KeyHints / Keycap, Tag, Meter, EmptyState, Loading, ErrorState, FilterField, Dash). Views are composed of these so they read as one app.

### Buttons
- **Shape:** 6px radius, 13px label, 16px icons, 6px gap; 100ms color transition; disabled at 45% with a not-allowed cursor.
- **Primary:** accent fill, white 500 label, 28px tall, 10px sides; hover to the theme's accent hover. One per bar.
- **Secondary (default):** 1px field-line stroke, Text; hover fills the hover tone.
- **Ghost:** no stroke, Text 2; hover, open and pressed states fill the hover tone and lift the text to Text. View switches (Overview, Messages, Consumers, Bindings, Publish) and toolbar icons are ghost.
- **Destructive:** danger fill, white 500 label; hover at 90%. Confirms destructive dialogs (Purge, Delete, Reject). Destructive actions inside a bar (Move, Purge, Delete) are ghost with danger text.
- **Link:** Link Blue text, underline on hover.
- **Sizes:** 28px default and icon, 24px small and icon-small (14px icons, 12px label), 20px extra-small icon (4px radius, 12px icons) for tab close and row menus.
- **Focus:** 2px accent outline, 1px offset.

### Segmented control
- A 6px track tinted with Text at 6%, 2px padding and gap; 24px segments at 4px radius in Text 2. The chosen segment takes the editor tone, Text, the segment lift and a 1px line ring. Icon-only segments tighten to 6px sides.

### Inputs / Fields
- **Form input:** 32px, 6px radius, 1px field-line stroke on the field tone, 13px Text, 10px sides, Text 3 placeholder; focus turns the border accent with a 2px accent ring at 30%; invalid turns it danger with a danger ring; disabled at 50%.
- **Query field (filter, guard, topology filter):** 28px, 4px radius, field-line stroke, 12px mono, Inter placeholder; focus turns the border accent with no ring. Escape clears a filter.
- **Labelled query field (where, count, exchange, routing key, times):** a 28px field with a faint 11px Inter label inside at the left and a bare mono input after it.
- **Switch:** 30 x 18 (24 x 14 small), accent when on, field-line when off, white thumb sliding 150ms.

### Navigation: main toolbar, tabs, Explorer, status bar
- **Main toolbar:** panel tone with a seam rule; when a connection is active, a gradient of its color at 26% into the panel tone over the first 360px. The connection widget is a ghost button with the connection name in 500 and a chevron; the breadcrumb sets object names in mono.
- **Editor tabs:** 36px, 13px, an 8px connection dot, a 14px icon, the name (mono for broker objects), the cluster name faint at 12px, an optional pane number, and a 20px close that shows on hover or focus. Inactive tabs are Text 2 and take the row-hover tone on hover; the active tab is Text with a 2px underline in the connection color. A dragged tab marks its drop target with a 2px accent inset. Middle-click closes.
- **Explorer tree:** 24px rows, 13px, 6px base indent plus 16px per level, a 16px disclosure target with a 12px chevron rotating 150ms, row-hover on hover, selection fill when selected, 2px inset focus outline. Trailing counts and kinds sit right in 11px Text 3.
- **Status bar:** 26px, panel tone, seam rule, 11px Text 2. Items are 22px with 4px radius: connection dot and name in 500 with the RabbitMQ version, open connections, a warn lock when the profile is read-only, a shield note when destructive actions ask for the name, AMQP state, the live dot, then vhost / object in mono at the right.

### Explorer environment tree (signature)
- Environment folders (folder icon, label, trailing count, row menu) at depth 0; connections at depth 1 with a 14px initials chip, a warn or danger triangle when they carry problems, a faint lock when guarded or read-only, and a green dot when connected; an unreachable cluster shows a danger tree note and does not expand.
- Queues show a trailing ready count, warm for a dead-letter backlog and hot for a problem; exchanges show their type.

### Data grid (signature)
- A virtualized table set in the data type. Heads are 30px, sticky, on the panel tone, 12px Inter 500 in Text 2, 10px sides, soft vertical rules and a line rule beneath; sorting shows a 12px Link Blue arrow. Rows are 24px with soft rules; optional sticky row numbers in Text 3. Hover takes the row-hover tone, selection the selection tint; a row can be muted (Text 3), warn or danger. Right-aligned columns use tabular figures; prose columns switch to 13px Inter. An empty grid says so in 12px Text 3.

### Inspector
- A resizable right panel on the editor tone with a left line rule. Head: at least 40px, title in 12.5px mono 500, optional 11px faint subtitle, actions, a 24px close. Body scrolls; content is SectionHeaders, KeyValues (a 96px Text 3 key column, 12px mono values), typed trees and JSON views, ending in a KeyHints strip of keycaps.

### Section header
- 30px, 12px sides, 11px Inter 600 in Text 2, sentence case, an optional faint 400 count ("Headers 9"), actions at the right, a soft rule above every header but the first.

### Metrics strip
- A full-width grid of cells (min 128px, auto-fit) divided by soft hairlines, a line rule underneath. Each cell: an 11px Text 2 key (optionally with a 12px icon in its tone), the metric value (in its tone when ok, warn or crit), an 11px faint detail. Clickable cells take the row-hover tone. No backgrounds, borders or radius per cell.

### Notices
- Full-width strips at the top of the view, min 36px, a line rule underneath, 12px Text 2 with a bold (500) Text lead, a 14px icon in the severity color and optional trailing small buttons. Crit and warn fill with 9% of their hue over the editor tone; info has no fill and a Link Blue icon. Crit is announced as an alert.

### State labels, tags, meters, empty values
- **State label:** a 12px icon in the tone (check, triangle, x-circle, pause, info) and a 12px word in Text. Never a colored dot alone.
- **Tag:** queue type, policy or feature as 10px mono 500 in Text 2 on Text at 7%, 3px radius; a title makes it a help cursor.
- **Meter:** a 4 x 64px track on the line tone, filled ok, warn from 75%, danger from 90%.
- **Keycap:** 16px, 3px radius, 1px line, panel tone, 10px Inter in Text 2.
- **Empty value:** one faint en dash, never "none" or a blank. Empty, loading and error states center a 20px icon, a 13px 500 title and a 12px Text 3 note, with "Try again" as a link.

### Messages view (signature)
- **Query bar:** a Peek / Get (ack) / Reject segmented control (eye, check, ban), a `where` field, a `count` field and the primary **Get**. Peek is the default and requeues every message; Get (ack) and Reject confirm first.
- **Filter language:** `path op value`, clauses joined by `and`. Paths: `routing_key`, `exchange`, `headers.*`, `properties.*`, `payload.*`.
- **Results head:** "N of M ready", the mode's effect ("requeued") and the timing, Export JSON at the right.
- **Grid:** message_id in the type color, routing_key, exchange, and for a dead-letter queue x-first-death (queue plus a reason in the keyword color) and deaths.

### Message inspector (signature)
- Head "Message" with the id faint, copy and republish icon buttons. For a dead-lettered message, an x-death card first: 12px margin, 1px soft line, 6px radius; a 30px head with a Link Blue reply icon, "dead-lettered from", the source queue in 12px mono and a faint "reason · N×" at the right; then 12px mono rows with a 96px Key Orchid key column (queue, exchange, routing keys, reason, died at, x-error); then a small **Replay to <exchange>** button.
- Then Properties, Headers and Payload as typed trees with counts in the section heads; binary payloads show a hex dump in the data type.

### Charts
- Canvas line charts, 120px tall by default. Lines in the three series colors, soft gridlines, 10.5px mono axis. The legend sits above: a 10 x 2 swatch, the series name in 11px Text 2 and its current value in 11.5px mono 500, so numbers read without hovering. On hover a tooltip floats (popover tone, 1px line, 6px radius, overlay shadow, min 140px) with the time in faint mono and each series' value right-aligned in mono.

### Topology canvas (signature)
- Columns appear only when they have nodes: Publishers, Exchanges, Via exchanges (one per hop), Queues, Consumers, headed in 11px Inter 500 Text 3. The canvas pans and zooms; it first fits at no less than 80%, and Fit and 100% buttons sit at the bottom right.
- Nodes are panel-tone 6px rects with a 1px line, a 12px mono 500 name and a 10.5px Inter subtitle (type, ready count); a small danger or warn dot marks an unhealthy queue; hover strokes field-line; selection and focus stroke accent (1.5px when selected). A missing exchange is a dashed danger outline with no fill.
- Edges are 1.25px field-line curves. Dead-letter edges are dashed 4 4 in warn at 80%; a broken edge is dashed 2 4 in danger. Binding keys ride in editor-tone 15px pills (3px radius, 1px line, 10.5px mono Text 2), stroked warn or danger to match their edge.
- Tracing a route washes its nodes with 14% accent and an accent stroke, draws its edges at 2px accent, tints its pills' strokes, and dims the rest (nodes 45%, edges 22%, pills 50%) over 150ms. Nothing moves along the edges.

### Confirm dialog and production guard
- 460px (task dialogs 560px; general dialogs 448px), 10px radius, a 48px head with the title and a close, an 18px / 22px body, a 56px foot with a line rule. A 16px danger triangle leads a Text 2 message naming the count, object and cluster.
- When the connection asks for typed confirmation, a guard block (8% danger tint, 6px radius, 10px padding) says "<cluster> is guarded. Type <object> to confirm." with the object in mono, above a 28px mono query field; the destructive button stays disabled until the text matches, and Enter confirms only then. The typed word is the object's own name (queue, vhost, flag), never a generic "DELETE".

### Publish view
- A query-bar row (exchange select, routing key, Persistent / Transient segmented control, times, primary **Publish** with an inline Ctrl ⏎ keycap on white at 20%), then the payload editor beside a routing and properties inspector. Publishing to a production connection raises a crit notice above the editor.
- **Payload editor:** 13px mono on a 20px line, ligatures off. Its 32px head states the content type in faint mono and a live status: "valid JSON" in ok with a check, "invalid JSON" in danger with an x (warn when JSON was not required).
- **Route preview:** "Delivered to N queues" and 26px mono rows of the queues the message would reach; no route shows in warn.

### Menus, palette, tooltips, toasts
- **Menus:** popover tone, 8px radius, 1px line, 4px padding, min 220px, overlay shadow; 28px items at 5px radius, 16px Text 2 icons; the highlighted item fills accent with white text and icons; destructive items read danger and fill danger when highlighted.
- **Quick open (Ctrl K):** a 46px 14px input, 32px items at 6px radius, the selected item on the selection fill.
- **Tooltip:** popover tone, 6px radius, 1px line, 4px / 8px padding, 12px Text, overlay shadow. **Toast:** popover tone, 8px radius, 1px line, 10px / 14px padding, 13px, overlay shadow.
- Floating layers fade and zoom in from 95% over 150ms.

### Connection chip
- The connection's initials on its color in Connection Ink at 600: 18px with 9px type and 4px radius in the toolbar and menus, 14px with 7.5px type and 3px radius in the tree and lists, or an 8px square dot (2px radius) with no text on tabs, empty panes and the status bar.

### Live dot
- 6px ok circle in the status bar beside "Live · Ns"; it beats once per refresh (one 0.8s ring) and turns faint (Text 3 at 60%) when paused.

## Do's and Don'ts

### Do:
- **Do** set every broker object name, routing key, header, filter and payload in JetBrains Mono with ligatures off and tabular figures (12.5px in grids, 12px in compact lists).
- **Do** keep rows at 24px and controls at 28px; density is the point.
- **Do** build depth with the editor / panel / seam tones and 1px rules; reserve the overlay shadow for floating layers.
- **Do** compose views from the shared data parts (view toolbar, notices, metrics strip, section headers, data grid, inspector) so every view reads as one app.
- **Do** read colors through the theme variables (`var(--color-*)`, Tailwind's token classes); never write a theme hex into a component.
- **Do** show cluster, vhost and object in the toolbar, tab and status bar, and name the cluster in every destructive dialog.
- **Do** keep one primary (accent-filled) action per bar; the solid destructive button only confirms a destructive dialog.
- **Do** require the object's own name typed before a destructive action on a guarded connection.
- **Do** state health as notices, metrics strips, tree marks and the problems list, and pair every state color with an icon and a word.
- **Do** give chart legends their current values and keep the tooltip for hover.
- **Do** define every new token in both themes under the same name.
- **Do** animate only state changes, 100-160ms on the ease-out-expo curve, and let the reduced-motion rule collapse them.

### Don't:
- **Don't** build a web dashboard: no sidebar of pages, no KPI cards.
- **Don't** add an AI assistant, an ask field or a sparkle mark; this app has none.
- **Don't** reintroduce per-editor themes; the identity is one dark and one light version.
- **Don't** use the accent, a connection color or a chart series as decoration, and don't reuse connection colors for status, types or series.
- **Don't** set chrome in mono or data in Inter.
- **Don't** add shadows to resting surfaces inside the window.
- **Don't** set section headers or labels in uppercase; headers are sentence case.
- **Don't** animate anything on load.
- **Don't** shrink the topology below 80% to fit it on first show; pan and zoom instead.
