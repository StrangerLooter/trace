# TRACE — Visual Research & UI/UX Design System

**Phase:** 4 — Visual Research & Design System  
**Tagline:** *"Look Beyond the File."*  
**Design Ethos:** *"Crazy simple on the surface; surgical precision beneath."*

---

## 1. Visual Inspection & Synthesis of the 7 Reference Images

We inspected all 7 reference images provided in the workspace across layout, spacing, typography, visual hierarchy, navigation, hero composition, section structure, and responsive implications.

### 1.1 Per-Image Breakdown

| Ref | Source Aesthetic | Layout & Hero Composition | Spacing & Typography | Visual Hierarchy & Navigation | Adapted for TRACE |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Img 1** | *Playful & Creative Fonts* (Editorial Specimen) | Clean 2-column centered grid with generous vertical breathing room and tiny uppercase captions beneath each headline. | High-contrast display headings paired with small, wide-tracked technical sub-labels (`PARADISO`, `RAKS`). | Strict typographic contrast between primary title and metadata caption; framed bottom pill badge. | Pair crisp editorial/geometric display headlines (`Inter` / `Geist`) with micro-spaced `JetBrains Mono` / `Geist Mono` technical labels (`SHA-256`, `0x000000`, `APP1`). |
| **Img 2** | *Railroad.ai* (Serene Framed Hero) | Centered hero inside a clean rounded viewport frame; subtle badge above H1, 2-line subtitle, and one unified rounded pill action bar (`input + primary button`). | Generous outer margins; tight vertical rhythm between badge -> H1 -> subcopy -> focal pill bar. | Floating centered pill nav (`4` links) + isolated top-left logo + isolated top-right CTA (`Get Started`). | Adopt the exact **3-part top bar** (Logo left, `4` centered pill nav links, `Inspect a File` CTA right) and replace the waitlist email pill with a serene **"Drop a file or browse locally"** pill/zone. |
| **Img 3** | *Dispatch* (Editorial Calm) | Ultra-minimalist full-bleed canvas with centered eyebrow (`ISSUE N°142`), strong 2-line H1, concise 2-line lead, single focal pill, and calm 1-line trust caption beneath. | Large negative space above and below the focal bar; zero decorative cards above the fold. | Top-left brand mark + clean uppercase right nav (`5` items, underlined primary CTA). | Use the **calm trust micro-caption** directly under the hero dropzone: *"Local-first in your browser. Zero silent uploads."* |
| **Img 4** | *Atlas* (*"Small Stories Vast Oceans"*) | Split **"Above vs. Beneath the Surface"** depth composition; left-aligned H1 + short stacked lead + dual CTAs (`Primary Solid` + `Secondary Ghost`), right-side vertical depth scale (`0m` -> `10,000m`), bottom-left coordinates & metadata block, top-right live `ONLINE •` status pill. | Asymmetric balance: left editorial anchor, open visual depth across center, structured telemetry along edges. | Minimal single-line top bar with hairline rule, geographic/telemetry coordinates, and live status indicator. | **Core Signature Metaphor for TRACE:** *"Look Beyond the File."* Surface layer = `Analysis Mode` (clean plain-language summary); Depth layer = `RE Mode` + byte-offset ruler (`0x0000` -> `EOF`) + `LOCAL WORKER • READY` status badge. |
| **Img 5** | *UGH* (High-Contrast Minimal Dark Glass) | Bottom-left anchored bold headline + 2-line subcopy + dark glass action pill (`icon + input + crisp white button`), balanced by minimal sponsor/trust marks bottom-right and `Logo` / `Menu` top corners. | Clean perimeter grid hairlines; generous open backdrop above headline. | Minimal 2-corner top bar (`Logo` left, `Menu` right) on mobile/compact views. | Inspire TRACE's **dark-graphite glass action bar** and crisp white-on-graphite primary CTA button with restrained `1px` borders. |
| **Img 6** | *BlacX Metadata Extractor* (Workspace + Hex Collage) | Left sidebar rail (`General`, `Metadata Extractor`, `Tasks`, `Settings`), main panel with clean **Processing Level** cards (`Quick` vs `Basic`), dashed dropzone below, paired with dense binary inspector panels. | Compact `12px–16px` card padding, subtle `1px` charcoal dividers, zero flashy gradients. | Persistent left workspace rail with active highlight state + clean upload card. | Directly shapes TRACE's **`/workspace` shell**: collapsible left rail (File Queue, Overview, Metadata, Forensics, Hex, Sanitizer, Export) + explicit scan coverage selector (`Local Quick Scan` vs `Full Stream + Deep Inspection`). |
| **Img 7** | *ImHex* (Reverse Engineering Workstation) | Classic 3-pane binary cockpit: top-left synchronized **Address / Hex / ASCII** columns with color-coded structural spans; top-right **Data Inspector** (`uint8`..`uint64`, `float32`, `ASCII`); bottom **Pattern Data** tree (`Name`, `Start`, `End`, `Size`, `Type`, `Value`) + Console. | Dense `12px–13px` monospace rows (`16 bytes/row`), aligned tabular numerals, clear column dividers. | Multi-pane inspection workbench where clicking any structural node highlights its exact bytes in the hex grid. | Direct blueprint for TRACE's **`RE Mode` + `Hex Inspector`**, decluttered for the web in deep graphite/charcoal with restrained color-coding for verified byte ranges only. |

### 1.2 Responsive Implications from the References
- **Landing Hero (`Railroad.ai` / `Dispatch` / `Atlas`):** Translates cleanly to mobile (`320px+`) by collapsing the center pill nav into a crisp drawer (`UGH` Menu pattern), stacking the dual CTAs, and hiding the vertical byte-depth ruler on `< 768px` so the hero remains uncluttered.
- **Workspace (`BlacX` / `ImHex`):** Desktop (`>= 1024px`) displays Sidebar + Main Analysis/RE Split; Tablet (`768px–1023px`) collapses the sidebar into an icon rail/drawer; Mobile (`< 768px`) converts Hex Inspector to `8 bytes/row` (from `16 bytes/row`) and opens Data Inspector / Field Details in a bottom sheet so **zero horizontal page overflow** occurs.

---

## 2. Color Tokens (Dark Default + Restrained Light Theme)

### 2.1 Primary Theme: Deep Graphite (Default)
| Token | Hex / Value | Usage |
| :--- | :--- | :--- |
| `--bg-primary` | `#0B0D10` | Deep graphite page & workspace canvas |
| `--bg-secondary` | `#12161C` | Dark charcoal panels, cards, sidebars, code/hex surfaces |
| `--bg-elevated` | `#181D25` | Hover states, active tabs, dropdowns, modals |
| `--border-subtle` | `#232A35` | Hairline `1px` panel/table borders |
| `--border-strong` | `#323B49` | Focused inputs, active dropzone borders |
| `--text-primary` | `#F4F4F5` | Off-white headings, primary values, active labels (Contrast >= 15:1 on `#0B0D10`) |
| `--text-secondary` | `#9CA3AF` | Neutral grey descriptions, secondary labels, timestamps (Contrast >= 6.4:1) |
| `--text-muted` | `#6B7280` | Disabled/hint labels (never used for critical body text) |
| `--accent-primary` | `#22C55E` | Restrained terminal green (verified status, active worker dot, RE Mode cursor) |
| `--accent-soft` | `rgba(34, 197, 94, 0.12)` | Subtle green badge/highlight tint (no neon glow) |
| `--status-warning` | `#D97706` / `#F59E0B` | Muted amber (partial coverage, medium/low warnings, mismatch caution) |
| `--status-critical` | `#DC2626` / `#EF4444` | Controlled red (high/critical findings, malformed headers, sanitization failure) |
| `--status-info` | `#60A5FA` | Muted slate-blue (informational findings, hex structure selection) |

### 2.2 Secondary Theme: Architectural Paper (Optional Light Mode)
Implemented via CSS variables (`[data-theme="light"]`) without altering component structure:
- `--bg-primary`: `#F7F7F5` (warm architectural off-white, inspired by `Dispatch`)
- `--bg-secondary`: `#FFFFFF`
- `--bg-elevated`: `#EFEFEA`
- `--border-subtle`: `#E2E2DC`
- `--text-primary`: `#111317`
- `--text-secondary`: `#525866`
- `--accent-primary`: `#15803D` (deep forest/terminal green for WCAG AA contrast on light paper)

---

## 3. Typography System

**Visual Evaluation Choice:** **`Inter`** (or `Geist Sans`) for UI & editorial clarity + **`JetBrains Mono`** (or `Geist Mono`) for offsets, hashes, MIME strings, hex grids, and `RE Mode` logs. Both load cleanly via `next/font/google` with `font-display: swap` and tabular numerals (`tabular-nums`) for byte counts and addresses.

| Role | Font Family | Size (`clamp` / scale) | Weight | Tracking / Line-Height |
| :--- | :--- | :--- | :--- | :--- |
| **Hero Display (H1)** | Inter / Geist | `clamp(2.25rem, 4.5vw, 4.25rem)` | `600` | `-0.03em` / `1.06` |
| **Section Title (H2)** | Inter / Geist | `clamp(1.5rem, 2.5vw, 2.25rem)` | `600` | `-0.02em` / `1.18` |
| **Panel Heading (H3)** | Inter / Geist | `1.125rem` (`18px`) | `500` | `-0.01em` / `1.35` |
| **Body Lead** | Inter / Geist | `clamp(1rem, 1.2vw, 1.125rem)` | `400` | `0` / `1.6` |
| **Body / Table Cell** | Inter / Geist | `0.875rem` (`14px`) | `400` | `0` / `1.5` |
| **Micro Eyebrow / Badge** | JetBrains Mono | `0.75rem` (`12px`) | `500` | `+0.08em` uppercase / `1.2` |
| **Hex / RE Event Line** | JetBrains Mono | `0.8125rem` (`13px`) | `400` | `0` / `1.55` (`tabular-nums`) |

---

## 4. Spacing, Layout & Max-Width Rules

- **Base Grid:** `4px` base unit (`4, 8, 12, 16, 24, 32, 48, 64, 96, 128`).
- **Landing Container Max-Width:** `1200px` centered (`1440px` max on showcase splits) — prevents ultrawide/4K card stretching and keeps prose lines `<= 68ch`.
- **Workspace Shell:** Full-bleed viewport (`100dvh` on desktop) with constrained inner max-widths on reading panels and `260px` collapsible left rail.
- **Border Radius:** Restrained precision: `6px` inputs/buttons, `8px` cards/tables, `12px` dropzone/modals, `9999px` pill nav/badges.
- **Elevation:** Flat `1px solid var(--border-subtle)` borders instead of heavy drop shadows or glowing neon outlines.

---

## 5. Component Standards

### 5.1 Buttons & CTAs
- **Primary CTA:** High-contrast off-white (`#F4F4F5`) fill with `#0B0D10` text (dark mode) or `#111317` fill with `#FFFFFF` text (light mode); subtle hover opacity/surface shift (`150ms ease`).
- **Secondary / Ghost:** Transparent background, `1px solid var(--border-strong)`, `--text-primary`.
- **Danger / Destructive (`Cancel & Delete`):** Muted surface with `--status-critical` border/text on confirmation.
- **Focus State:** Mandatory `2px solid var(--accent-primary)` with `2px` offset (`:focus-visible`).

### 5.2 Inputs, Forms & Controls
- Minimum touch target `44px x 44px` on mobile/touch viewports.
- Clean `1px` borders, explicit `<label>` elements, inline validation messages, and zero placeholder-only labels.
- Optional Contact / Format Request form (`/contact`): Topic select, optional email, description, explicit privacy notice.

### 5.3 Navigation (Landing vs. Workspace)
- **Landing Top Bar (3-Zone Pill Layout from `Railroad.ai` / `Dispatch`):**
  - Left: `TRACE` geometric mark + wordmark.
  - Center (Desktop): Floating subtle pill container with `4` links: `Formats`, `How It Works`, `Guides`, `Privacy & Security`.
  - Right: Theme toggle (subtle icon) + `Inspect a File` CTA button.
  - Mobile (`< 768px`): Logo left + `Menu` button right opening an accessible full-height drawer.
- **Workspace Navigation (`BlacX`-inspired Rail):**
  - Top bar: Active filename, detected signature badge, `LOCAL WORKER • READY` (or `REMOTE SANDBOX` if consented), and prominent **`Analysis Mode` | `RE Mode`** segmented toggle.
  - Left rail: File Queue list + Section views (`Overview`, `Metadata`, `Forensics`, `Hex Inspector`, `Sanitizer`, `Export`).

### 5.4 Upload Zones
- **Hero Inline Dropzone (`Railroad.ai` / `Dispatch` simplicity):** Clean rounded pill/frame (`min-height: 76px`) inviting drag-and-drop or click-to-browse, paired with a calm 1-line pledge: *"Runs locally in Web Workers. Files never leave your device without explicit consent."*
- **Workspace Dropzone:** Full dashed/solid target supporting multi-file drops, keyboard `Enter`/`Space` activation, and clear drag-over highlight (`--accent-primary` `1px` border + `--accent-soft` tint).

### 5.5 Metadata Tables
- Grouped collapsible sections (`General`, `EXIF`, `GPS`, `Camera`, `Video`, `PDF`, `Binary`).
- Columns: `Field`, `Value`, `Type`, `Sensitivity`, `Parser`, `Byte Offset` (clickable mono pill `0x0001A4` when exact, or muted `N/A` tooltip when unavailable).
- Mobile (`< 640px`): Converts dense multi-column rows into clean stacked key/value cards or horizontally scrollable table containers (`overflow-x: auto`) with zero page overflow.

### 5.6 Terminal & Hex Panels (`RE Mode`)
- **No fake ASCII hacker effects, no CRT scanlines, no arbitrary command prompt.**
- **Live Event Console:** Timestamp (`HH:MM:SS.mmm`), colored event badge (`SIGNATURE_MATCHED`, `HEADER_READ`, `ANOMALY_DETECTED`), parser ID, concise message, and clickable offset pill. Controls: `Pause Display`, `Clear View`, `Severity Filter`, `Parser Filter`, `Search`, `Copy`, `Export Log`.
- **Hex Inspector (`ImHex`-inspired):**
  - Desktop (`>= 1024px`): `Offset (8-10 hex digits)` | `16 Hex Bytes (8+8 split)` | `16 ASCII Chars` + right-hand `Data Inspector` (`uint8..64`, `float32/64`, `binary`, `UTF-8`).
  - Mobile (`< 768px`): `Offset` | `8 Hex Bytes` | `8 ASCII Chars` + bottom-sheet `Data Inspector`.

---

## 6. Responsive Breakpoints & Testing Matrix

| Tier | Width | Layout Strategy |
| :--- | :--- | :--- |
| **Small Phone** | `320px–479px` | Single-column, `44px` touch targets, drawer nav, `8-byte` hex grid, bottom-sheet detail inspector. |
| **Large Phone** | `480px–767px` | Single-column with 2-up compact stat pills, `8-byte` hex grid. |
| **Tablet** | `768px–1023px` | 2-column capability cards, collapsible icon rail in Workspace, `16-byte` hex grid without Data Inspector pinned (toggleable drawer). |
| **Laptop / Desktop** | `1024px–1535px` | Full multi-panel workspace: `240px` sidebar + main panel + optional `RE Mode` bottom/side split. |
| **Ultrawide** | `1536px–2560px` | Landing content capped at `1200px–1360px`; Workspace allows simultaneous Side-by-Side `Metadata` + `Hex Inspector` + `RE Console`. |
| **4K / Large TV** | `2561px–3840px` | Scaled base typography (`18px` root at `>= 2560px`), generous max-width container (`1440px` landing / `2200px` workspace) so lines never stretch edge-to-edge. |

---

## 7. Animation & Accessibility Rules (WCAG 2.2 AA)

- **Motion:** Functional transitions only (`120ms–200ms cubic-bezier(0.16, 1, 0.3, 1)`). Strictly honor `@media (prefers-reduced-motion: reduce)` by disabling slide/fade transitions.
- **Zero Ambient Noise:** No floating particle backgrounds, no infinite pulsing glow rings, no auto-scrolling fake logs.
- **Accessibility:**
  - Semantic landmarks (`<header>`, `<nav>`, `<main>`, `<aside>`, `<footer>`).
  - Keyboard-operable dropzone, `Tab`/Arrow key navigation across mode toggles, tree nodes, and hex bytes.
  - `aria-live="polite"` announcements for file identification and analysis completion.
  - Minimum `4.5:1` contrast for all body/UI text (`3:1` for large headings/UI borders).

---

## 8. Landing Page Blueprint (12 Sections, `Crazy Simple` Hierarchy)

1. **Minimal Navigation:** Logo (`TRACE`), centered pill nav (`Formats`, `How It Works`, `Guides`, `Privacy & Security`), right Theme Toggle + `Inspect a File` CTA.
2. **Serene Hero (`Railroad.ai` + `Dispatch` + `Atlas` synthesis):**
   - Status pill: `LOCAL-FIRST ENGINE • WEB WORKER ISOLATED`
   - H1: **Look beyond the file.**
   - Lead: *Inspect hidden metadata, verify binary signatures, trace raw byte offsets, and strip sensitive tags—without uploading your files.*
   - Focal Action Bar: Clean pill dropzone (`Drop a file here or browse...`) + `Inspect a File` primary button + `Explore Engine` secondary link.
   - Calm trust micro-copy: *Processes locally in your browser. Zero accounts. Zero silent uploads.*
3. **Product Statement + Surface-vs-Depth Strip:** Concise editorial strip showing what visible viewers hide vs. what TRACE uncovers beneath (`0x0000` -> `EOF`).
4. **Structured Capability Showcase (5 Pillars):** Signature Verification, Deep Metadata Extraction, Explainable Forensics, Virtualized Hex + `RE Mode`, Format-Specific Sanitization.
5. **Interactive `Analysis Mode` vs. `RE Mode` Preview:** Real-time UI toggle comparing the human-readable summary card against the authentic event-stream + hex offset view (clearly labeled as an interactive specimen).
6. **Supported Format Families & Honesty Matrix:** Clean grid summarizing Images, Audio, Video, PDF/Office, Archives, and Executables with link to `/formats`.
7. **How It Works (3 Steps):** `1. Inspect Locally` -> `2. Investigate & Verify` -> `3. Sanitize or Export` (with optional consented backend step clearly marked).
8. **Privacy-First Architecture Pledge:** Visual trust checklist linking to `/privacy` and `/security`.
9. **Metadata Sanitization Overview:** Before/after verifiable field stripping comparison (e.g., JPEG EXIF GPS removal with integrity status).
10. **Technical Guides Preview:** Links to 3 foundational field guides (`/guides`).
11. **FAQ Accordion:** Honest answers on 5 GB video handling, privacy, PDF sanitization, and forensic limitations.
12. **Structured Footer:** Brand summary + `Product` (`Workspace`, `Formats`, `Changelog`), `Resources` (`Guides`, `Security Architecture`, `Contact / Feedback`), `Legal & Policies` (`Privacy Policy`, `Terms & Disclaimer`, `Open-Source Licenses`), and live local worker status indicator.
