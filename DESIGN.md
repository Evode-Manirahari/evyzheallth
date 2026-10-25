# EVYZ design system

Mode: **Operate** (a clinical review workspace). The visual world is a calm clinical record: warm paper, dark ink, restrained teal, with amber meaning "awaiting review".

## Tokens (`frontend/src/index.css`)

### Surfaces and text

| Role | Value |
|---|---|
| Paper (page) | `hsl(42 30% 95%)` |
| Surface (panels) | `hsl(40 60% 99%)` |
| Ink (text) | `hsl(156 14% 12%)` |
| Ink-2 (secondary text) | `hsl(150 6% 33%)`, at least 6:1 on paper |
| Line | `hsl(38 20% 85%)` |

### Accents and states

| Role | Value |
|---|---|
| Teal (primary actions, current selection, "Reviewed", "Improved") | `#0e6b62`, on soft `#dcebe7` |
| Amber (change awaiting review) | `#8a4a00` text, on `#fbedd0` fill with `#e9b65c` hairline |
| Regression or error | `#9b2f1f`, on `#f8e2dc` |

### Depth

- Shadow 1: hairline ring plus a 1 px soft shadow.
- Shadow 2 (hover and focus lift): a 6/18 px soft shadow.
- No heavy borders and no nested cards.

## Type
- **UI:** Public Sans, with tabular and lining figures everywhere so numbers align.
- **Display:** Newsreader 600, only for page titles (H1) and the EVYZ wordmark.
- **Code and IDs:** IBM Plex Mono, only for `<code>` (measurement IDs, fingerprints, file names).
- **Scale:** H1 at 2.25–3rem, section H2 at 1.125–1.5rem, body 0.875–0.95rem, labels 0.72rem.
- **No kicker labels above headings.**

## Components
- `.panel`: the single container level.
- `.pill` with a state class:
  - `.tag-change`: amber with an AlertCircle icon.
  - `.tag-ok`: teal with a CheckCircle or TrendingUp icon.
  - `.tag-regress`: with a TrendingDown or AlertTriangle icon.
- `.step-num` with `data-state="todo|active|done"`: numbered steps for the Lab's three-step flow, where the order itself is information.
- Buttons are shadcn. The focus ring is 2 px teal with a 2 px offset, and buttons press down 1 px when active.

## Charts
Chart colours are unchanged, so their meaning is preserved:

| Element | Colour |
|---|---|
| Glucose line | ink navy `#162a4a` |
| Baseline band and median | teal `#0f766e` |
| Readings outside the band | amber dots `#d97706` |
| Change windows | amber `#f59e0b` |
| Gaps | slate |
| Heart rate | violet |
| Skin temperature | orange |

## Motion
- `.enter`: 220 ms, ease-out, translateY 4 px to 0, for state reveals (results, evidence panel).
- `.lift`: 180 ms shadow transition on hover.
- `prefers-reduced-motion` turns all of these off.
- No page-load choreography.
