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
  line-soft-dark: "#2F3135"
  line-dark: "#393B40"
  field-line-dark: "#4E5157"
  sel-soft-dark: "#25324A"
  sel-dark: "#2E436E"
  text-3-dark: "#959AA2"
  text-2-dark: "#B4B8BF"
  text-dark: "#DFE1E5"
  editor-light: "#FFFFFF"
  panel-light: "#F7F8FA"
  row-hover-light: "#F4F6FA"
  line-soft-light: "#EFF0F3"
  hover-light: "#E9EBEF"
  line-light: "#E4E6EB"
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
  series-1-dark: "#3987E5"
  series-2-dark: "#D95926"
  series-3-dark: "#199E70"
  series-1-light: "#2A78D6"
  series-2-light: "#EB6834"
  series-3-light: "#1BAF7A"
  mark-top: "#FFC28F"
  mark-body: "#E8590C"
  mark-rim: "#8F3506"
typography:
  display:
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "22px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.3
  title:
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.45
  body:
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.45
    fontFeature: "\"cv11\", \"ss01\""
  label:
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.45
  caption:
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.45
  data:
    fontFamily: "JetBrains Mono, ui-monospace, SF Mono, Menlo, Consolas, monospace"
    fontSize: "12.5px"
    fontWeight: 400
    lineHeight: "20px"
    fontFeature: "\"liga\" 0, \"tnum\""
  code:
    fontFamily: "JetBrains Mono, ui-monospace, SF Mono, Menlo, Consolas, monospace"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: "20px"
rounded:
  xs: "3px"
  sm: "4px"
  md: "6px"
  overlay: "8px"
  lg: "10px"
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
  button-ghost:
    textColor: "{colors.text-2-dark}"
    rounded: "{rounded.md}"
    padding: "0 10px"
    height: "28px"
  toolbar-icon-button:
    textColor: "{colors.text-2-dark}"
    rounded: "{rounded.md}"
    size: "28px"
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
    typography: "{typography.data}"
    rounded: "{rounded.md}"
    height: "30px"
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
    typography: "{typography.label}"
    height: "30px"
  editor-tab:
    textColor: "{colors.text-2-dark}"
    padding: "0 6px 0 12px"
    height: "36px"
  segmented-control:
    rounded: "{rounded.md}"
    padding: "2px"
    height: "28px"
  menu:
    backgroundColor: "{colors.panel-dark}"
    rounded: "{rounded.overlay}"
    padding: "4px"
  menu-item-hover:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    height: "28px"
  status-bar-dark:
    backgroundColor: "{colors.panel-dark}"
    textColor: "{colors.text-2-dark}"
    typography: "{typography.caption}"
    height: "26px"
  dialog:
    backgroundColor: "{colors.editor-dark}"
    rounded: "{rounded.lg}"
  connection-chip:
    rounded: "{rounded.sm}"
    size: "18px"
  button-danger-dark:
    backgroundColor: "{colors.danger-dark}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.md}"
    padding: "0 10px"
    height: "28px"
  button-danger-light:
    backgroundColor: "{colors.danger-light}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.md}"
    padding: "0 10px"
    height: "28px"
  metrics-cell:
    typography: "{typography.caption}"
    padding: "7px 12px 8px"
  notice:
    padding: "4px 8px 4px 12px"
    height: "36px"
  problem-row:
    typography: "{typography.body}"
    padding: "6px 12px"
  route-item:
    padding: "0 12px"
    height: "26px"
  dialog-confirm:
    backgroundColor: "{colors.editor-dark}"
    rounded: "{rounded.lg}"
    width: "460px"
  confirm-guard:
    rounded: "{rounded.md}"
    padding: "10px"
  payload-editor:
    typography: "{typography.code}"
    padding: "8px 12px 8px 4px"
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

<!-- Recorded 2026-10-10 from the shipped mockup rabbit-studio.html. The visual world is inherited verbatim from the family: postgres-studio/DESIGN.md (and mongo-studio/DESIGN.md), "The Data IDE". The mockup inlines the siblings' base.css unchanged (byte-identical), experiments.css, the relational style block and shared.js; Rabbit's own rules sit at the end of its <style> block after "Rabbit Studio additions". The tokens above repeat the sibling's frontmatter unchanged and add only the chart series, the app-mark tint and the Rabbit components. A change to an inherited token is a family change and belongs in the sibling first.
Open decision: UI copy is English to match the siblings (Claude's call on 2026-10-10), confirmed by the user on 2026-10-10. RabbitMQ terms stay verbatim in either language. -->

# Design System: Rabbit Studio

## Overview

**Creative North Star: "The Data IDE"**

Rabbit Studio is the third sibling of Mongo Studio and Postgres Studio and inherits their world without change: a category-standard desktop developer tool, dense, quiet and exact. 13px Inter chrome, JetBrains Mono for every piece of data, 24px rows, 16px line icons, and a neutral stack of near-blacks (or near-whites) separated by hairline rules. It is an IDE frame (toolbar, tool stripe, Explorer, editor tabs, status bar), not a web dashboard: there is no sidebar of pages and no KPI cards. Queues read like tables, messages like rows, and a message's properties, headers and payload like the typed row inspector.

The one loud signal is still place. Every cluster is a connection with its own color, and that color rides on the toolbar's leading edge, the tab underline, the initials chip and the status bar, so a production tab never looks like a local one. Clusters sit in environment folders (Production, Staging, Local) in the Explorer. Beyond identity, color is spent on the single blue for selection and primary action, on ok / warn / danger for health, on syntax color for typed values, and on three validated series hues in charts. Problems surface first: unhealthy queues, nodes and clusters carry warn or danger marks in the tree, notices at the top of the editor, and a problems list.

Two twin themes, dark default and light, same structure and token names.

**Key Characteristics:**
- IDE density: 24px data and tree rows, 28px controls, 36px tab and panel bars, 26px status bar.
- Two type voices: Inter for interface, JetBrains Mono (ligatures off, tabular figures) for all data, names, routing keys and payloads.
- Tonal layering, not shadows: editor, panel and seam tones plus 1px rules; shadows only on floating layers.
- One blue accent (#3574F0) in both themes; syntax colors carry value types.
- Connection identity is color-coded and repeated on every surface; clusters grouped by environment folder.
- Health is stated in strips and marks (notices, metrics strips, tree marks, problems list), never in cards.
- RabbitMQ terminology verbatim: vhost, exchange, binding, routing key, ack, prefetch, quorum / classic / stream, x-death.
- Motion on state only, 140-200ms ease-out, nothing on load; reduced motion honored.

## Colors

The sibling's JetBrains-derived neutral stack in twin themes, one blue accent, three status hues, the syntax palette, the eight-swatch connection palette, plus a three-hue chart series and the orange app mark.

### Primary
- **Selection Blue** (accent): primary buttons (Get, Publish, Save), focus outline and field ring, active tool-stripe marker, menu item hover, the topology route trace and its flow dots, progress fills. Identical in both themes.
- **Link Blue** (accent-text-dark / accent-text-light): accent as text on neutral grounds: info notice icon, highlighted binding keys in the topology, drop-zone links.
- **Selection Fill / Selection Tint** (sel-*, sel-soft-*): selected tree node and palette item; the softer tint marks the selected message row in the grid.

### Secondary: health
- **OK** (ok-dark / ok-light): healthy status, node health dots, the live dot, "valid JSON".
- **Warn** (warn-dark / warn-light): warning notices (9% over the editor tone), warm tree marks, node memory or disk near a limit, dead-letter edges in the topology.
- **Danger** (danger-dark / danger-light): critical notices, hot tree marks, unreachable clusters, broken consumer edges, the confirm dialog's head icon, the guard tint and the solid destructive button.

### Tertiary: data syntax
- Inherited unchanged: **Key Orchid**, **String Green**, **Number Cyan / Blue**, **Keyword Clay / Navy**, **Type Blue / Teal** (json-bson-*, used for message ids, timestamps and app names in the grid), **Punctuation Grey**, **Comment Grey**. In the message grid plain strings stay in body text; ids and times take the type color, numbers the number color, booleans and death reasons the keyword color.

### Chart series
- **Series Blue, Series Orange, Series Green** (series-1/2/3, per theme): the only chart line colors, in that order. They are tuned per theme for contrast against the editor tone and are never used outside charts, never for status, never for connections.

### Connection palette
- Inherited eight swatches. The shipped clusters use **Red** for Production SA (PS), **Magenta** for Production US (PU), **Amber** for Staging (ST), **Slate** for QA ephemeral (QA) and **Green** for Local dev (LD); a new connection defaults to **Teal**. Production clusters take the hot hues by convention, not by rule: the folder, the lock mark and the typed guard carry the environment, the color carries the connection.

### App mark
- **Mark Peach / Mark Orange / Mark Rim** (mark-top, mark-body, mark-rim): the family's rounded-square mark with Rabbit's own object, a rabbit head (Mongo Studio has a cylinder, Postgres Studio a table); the source is icons/icon-source.svg. Used only inside the app mark; never as an interface color.

### Neutral
- Inherited unchanged: **Editor**, **Panel**, **Seam**, **Line / Line Soft**, **Field Line**, **Row Hover / Hover**, **Text / Text 2 / Text 3**, same roles as the sibling. Group rows in tables take the panel tone.

### Named Rules
**The One Blue Rule.** The accent is the only interface hue. It marks selection, focus, the route trace and the single primary action per bar; it is never decoration.

**The Connection Owns Its Color Rule.** Connection colors appear only where they identify a connection (chip, tab underline, toolbar edge, status bar). They are never reused for status, types, chart series or emphasis, and status colors are never a connection's only cue.

**The Twin Themes Rule.** Every token exists in both themes under the same name; the chart series are defined per theme for this reason.

## Typography

**Interface Font:** Inter (with system-ui, -apple-system, Segoe UI, sans-serif), cv11 and ss01 on, weights 400-600, embedded as woff2.
**Data / Code Font:** JetBrains Mono (with ui-monospace, SF Mono, Menlo, Consolas, monospace), weights 400-500, ligatures off, tabular numerals, embedded as woff2.

**Character:** The JetBrains pairing, split by content: anything stored in or sent to the broker (queue, exchange and vhost names, routing keys, headers, payloads, filters) is mono; anything the app says is Inter.

### Hierarchy
- Inherited roles unchanged: **Display** (22px, welcome only), **Headline** (15px, dialog titles), **Title** (13px/600, panel and inspector heads), **Body** (13px), **Label** (12px/500), **Caption** (11px), **Data** (12.5px mono, 20px line), **Code** (13px mono, 20px line: the payload editor).
- **Metric value** (500, 13px mono, 20px line, -0.01em, tabular): the value line of a metrics cell. Its key and detail lines are 11px Inter.
- **Chart axis** (400, 10.5px mono, tabular) and **legend value** (500, 11.5px mono): chart numerals.
- **Topology** node names 12px/500 mono, node subtitles 10.5px Inter, binding keys 10.5px mono, column heads 11px/500 Inter.
- **Tree object names** (vhosts, exchanges, queues, streams) in 12.5px mono inside the 13px Inter tree.

### Named Rules
**The Data Is Mono Rule.** Names of broker objects, routing keys, headers, filters and payloads are always JetBrains Mono with ligatures off; chrome is never mono.

**The Four Sizes Rule.** Chrome lives on 13 / 12 / 11px. Larger sizes are reserved for the welcome title and dialog titles; the metrics value stays at 13px.

## Layout

The sibling's fixed IDE frame, unchanged: a 40px toolbar (connection widget tinted by the connection color, breadcrumb cluster / vhost / object, centered Ctrl K search, settings, window controls; Rabbit Studio has no Assistant), a 40px tool stripe, a resizable Explorer, a 36px tab row, the per-tab toolbar with its segmented view switch, the query bar, a 34px results head, the grid with the inspector to its right, and a 26px status bar.

The Explorer is the map of every cluster: an "All clusters" row, then environment folders (Production, Staging, Local) with counts, then connections, then per connection Overview, Topology, a Runtime folder (Nodes, Connections, Channels), one row per vhost holding Exchanges / Queues / Streams folders, and an Admin folder (Users, Virtual hosts, Policies, Limits and the rest). Depth steps 16px with hairline guides.

Inside the editor, overview-type views stack full-width strips: notices, a metrics strip, a two-column chart row (one column under 1180px), then grids. Quiet pages (definitions) use 18px / 22px padding with a 16px gap and cap content at 760px. Rhythm is the inherited 2-4-6-8-12-16-24 scale; responsive behavior at 1180 / 960 / 640px is inherited.

### Named Rules
**The Data Is Widest Rule.** The grid and inspector own the center; chrome widths are fixed and small.

**The Always Show Where Rule.** Cluster, vhost and object are visible in the toolbar, the tab and the status bar; every destructive dialog names the cluster with its chip.

## Elevation & Depth

Flat, tonal and ruled, inherited. No resting surface inside the window has a shadow. The overlay shadow belongs to menus, the palette, dialogs, toasts and the chart tooltip (raised tone, 1px line, 6px radius). Scrims dim the window behind modal dialogs. The only other glow is the live dot's single expanding ring.

### Shadow Vocabulary
- **Overlay** (dark `0 12px 32px rgba(0,0,0,.45), 0 2px 6px rgba(0,0,0,.3)`; light `0 12px 32px rgba(20,24,35,.16), 0 2px 6px rgba(20,24,35,.08)`): floating layers and the chart tooltip.
- **Segment lift** and **Focus ring**: inherited.
- **Live beat** (`0 0 0 0` to `0 0 0 6px`, ok at 55% fading out, 0.8s, once): the status bar's live dot, once per refresh.

### Named Rules
**The Flat Window Rule.** Nothing inside the window casts a shadow at rest. Depth inside the window is tone and rule; shadow means "floating above".

## Shapes

Inherited: controls and fields round at 6px, chips and keycaps at 4px, inline highlights at 3px, menus and toasts at 8px, dialogs and the window at 10px; borders are always 1px hairlines; grids, trees and panels are square and edge-to-edge. Rabbit adds: topology nodes as 6px-radius rects, binding-key pills at 3px, feature abbreviations at 3px, node-health dots as 12 x 6 bars at 2px, bars and progress as 4px tracks with 2px ends, the live dot as a 6px circle, and the drop zone as a 1px dashed field-line box at 6px.

## Components

Every inherited component (buttons, segmented control, inputs and query fields, switch, tool stripe, Explorer tree, editor tabs and tab groups, split panes, breadcrumb, status bar, data grid, inspector, menus, quick open, toasts, dialog) keeps the sibling's spec. The sibling's Assistant (panel, inline ask, sparkle mark) and saved scripts are deliberately absent: the user ruled out an AI assistant and saved messages for this app on 2026-10-10. Rabbit additions follow.

### Buttons
- **Danger:** solid danger fill, white text at 500, 28px, 6px radius; hover brightens 8%; disabled at 45%. Only as the confirming action of a destructive dialog (Purge, Delete, Close connection), beside a ghost Cancel. A ghost red variant marks destructive actions inside bars.

### Explorer environment tree (signature)
- Environment folders (folder icon, label, trailing count, row menu) at depth 0; connections at depth 1 with initials chip, a warn or hot triangle when they carry problems, a faint lock on production ("Destructive actions ask for the name") and a green live dot; an unreachable cluster shows "unreachable" in danger with a retry button and does not expand.
- Queues show a trailing ready count, warm (warn, 500) for a dead-letter backlog and hot (danger, 500) for a problem; exchanges show their type; vhosts show a hot mark if any queue in them is unhealthy.

### Messages view (signature)
- **Query bar:** a Peek / Ack / Reject segmented control (eye, check, ban), a `where` query field, a `count` field, and the primary **Get ⏎**. Peek is the default and requeues every message.
- **Filter language:** `path op value`, clauses joined by `and`. Paths: `routing_key`, `exchange`, `headers.*`, `properties.*`, `payload.*`. Operators `= != >= <= > <` and `~` (contains). Quoted values are strings. An unreadable clause shows a crit notice with an example (`payload.amount.value > 100`).
- **Results head:** "N of M messages", the mode's effect ("requeued", "acked and removed", "rejected") and the timing.
- **Grid:** message_id, routing_key, then for a dead-letter queue x-first-death (queue plus reason) and deaths, otherwise exchange and redelivered; app_id, timestamp, size (right-aligned) and a faint one-line payload preview.

### Message inspector (signature)
- Head "Message" with the id, copy and republish icon buttons. For a dead-lettered message, an x-death card first, built on the inherited related-rows block (1px soft line, 6px radius): a 30px head with a Link Blue reply icon, "dead-lettered from", the source queue in 12px mono, and a right-aligned faint "reason · N×"; then 12px mono rows (96px key column in Key Orchid) for exchange, routing key and x-error; then a small **Replay to <queue>** button.
- Then Properties, Headers and Payload as inherited typed kv trees with counts in the section heads; the payload head states content type and size. A footer lists Republish R, Replay ⏎, Copy Ctrl C as keycaps.

### Metrics strip
- A full-width row of cells (min 128px, auto-fit) divided by soft hairlines, a line rule underneath. Each cell: an 11px Text 2 key (optionally with an icon), the metric value, an 11px faint detail. Clickable cells take the row-hover tone. No backgrounds, borders or radius per cell.

### Notices
- Full-width strips at the top of the editor content, min 36px, a line rule underneath, 12px Text 2 with a bold Text lead sentence, an icon in the severity color and an optional trailing small button (Consumers, Replay). Crit and warn fill with 9% of their hue over the editor tone; info has no fill and a Link Blue icon.

### Problems list
- Rows with a 16px severity icon column (danger or warn), a 13px title and an 11px faint subline with the object in 11px mono. Hover takes the row-hover tone. Used in the inspector and side panel.

### Charts
- Lines 2px, round joins, area fill at 10%, soft gridlines, 10.5px mono axis. The legend sits above, a 10 x 2 swatch, the series name and its current value in 11.5px mono, so the numbers are readable without hovering. Markers (3.5px, editor-tone stroke) and a field-line crosshair appear only on hover, with a raised tooltip listing each series' value in mono.

### Topology canvas (signature)
- Four columns (Publishers, Exchanges, Queues, Consumers), drawn 1:1 and panned and zoomed, never squeezed to fit.
- Nodes are panel-tone 6px rects with a 1px line, mono name and Inter subtitle (type, ready count); a 3.5px danger or warn dot marks an unhealthy queue; hover strokes field-line; selection strokes accent at 1.5px.
- Edges are 1.25px field-line curves. Dead-letter edges are dashed 4 4 in warn at 75%; a broken consumer edge is dashed 2 4 in danger. Binding keys ride in editor-tone pills (3px radius, 1px line) drawn above the edges; fanout bindings read "(fanout)".
- Tracing a route lights its nodes (14% accent wash, accent stroke), edges (2px accent) and keys (Link Blue), dims the rest (nodes 45%, edges 25%), and sends accent flow dots along the lit edges (1.8s loop) unless the user prefers reduced motion.

### Confirm dialog
- One column, 460px (560px for task dialogs), the inherited head and foot, a danger icon in the head, 13px Text 2 body naming the count, object (mono) and cluster. On production a guard block (8% danger tint, 6px radius, 10px padding) shows the cluster chip and name and asks for the object's name typed exactly; the solid danger button stays disabled until it matches, and Enter confirms only then.

### Payload editor
- 13px mono on a 20px line, a 48px right-aligned faint line-number gutter, accent caret. Above it, the results head states the content type and a live status: "valid JSON" in ok with a check, or "invalid JSON" in danger with the gutter turning danger. Publishing refuses invalid JSON with a toast. A route preview lists the queues the message would reach (26px mono rows, the via binding faint at the right); no route shows in warn.

### Live dot
- 6px ok circle in the status bar beside "Live · Ns"; it beats once per refresh (one 0.8s ring), turns faint when paused.

## Do's and Don'ts

### Do:
- **Do** set every broker object name, routing key, header, filter and payload in JetBrains Mono at 12.5px with ligatures off and tabular figures.
- **Do** keep rows at 24px and controls at 28px; density is the point.
- **Do** build depth with the editor / panel / seam tones and 1px rules; reserve the overlay shadow for floating layers.
- **Do** show cluster, vhost and object in the toolbar, tab and status bar, and name the cluster with its chip in every destructive dialog.
- **Do** keep one primary (accent-filled) action per bar; the solid danger button only confirms a destructive dialog.
- **Do** require the typed object name before a destructive action on production.
- **Do** state health as notices, metrics strips, tree marks and the problems list: strips and marks inside the editor, never cards.
- **Do** give chart legends their current values and keep markers hidden until hover.
- **Do** define every new token in both themes under the same name.
- **Do** animate only state changes at 140-200ms with the ease-out curve, and gate every animation, including SVG motion, on reduced motion.

### Don't:
- **Don't** build a web dashboard: no sidebar of pages, no KPI cards.
- **Don't** reintroduce per-editor themes; the identity is one dark and one light version.
- **Don't** use the accent, a connection color or a chart series as decoration, and don't reuse connection colors for status, types or series.
- **Don't** set chrome in mono or data in Inter.
- **Don't** add shadows to resting surfaces inside the window.
- **Don't** animate anything on load.
- **Don't** shrink the topology to fit the window; pan and zoom it at 1:1.
