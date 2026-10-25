# EVYZ experimental redesign: references and design decisions (2026-10-25)

Branch: `experiment/evyz-redesign`, created from `main` at `e62a652` and tagged `demo-stable-2026-10-25`. To revert, check out `main` (or the tag), or use the platform rollback.

## Status of each reference

| Reference | Official source | Status | How it was used |
|---|---|---|---|
| Impeccable | github.com/pbakaus/impeccable | Installed (project, earlier) | `context` and `detect` were run; PRODUCT.md and DESIGN.md kept; Operate-mode rules applied (one container level, no nested cards, status never shown by colour alone). |
| Emil Kowalski | github.com/emilkowalski/skills | Installed by copy: `.claude/skills/emil-review-animations` | Motion rules applied: ease-out curve `cubic-bezier(.23,1,.32,1)`, UI motion ≤ 280 ms, transform and opacity only, no animation on frequent list rows, hover effects only on devices with a pointer that can hover, reduced motion respected. |
| TasteSkill | github.com/Leonxlnx/taste-skill | Installed by copy: `.claude/skills/taste-skill` | App-screen rules applied: colour on data rather than chrome, key numbers shown as type rather than tiles, flat 1 px panels, a product mark, and one element only this product has (the Lab signal path and the per-participant change strip). Its `draw.mjs` and `inspect.mjs` scripts were not run (they need Node 22+). |
| Ponytail | github.com/DietrichGebert/ponytail | Installed by copy: `.claude/skills/ponytail` | Chose the already-installed framer-motion over adding GSAP. Smallest workable diffs; backend untouched. |
| GSAP skill | github.com/greensock/gsap-skills | Reference studied | The gsap-react guidance was read, but GSAP was not added: framer-motion was already installed (Ponytail rule 4, Genjutsu iron rule 8). |
| Motion Design skill | github.com/lottiefiles/motion-design-skill | Reference studied | State-feedback patterns used: success check stroke-draw (~220 ms), indeterminate loading bar, warning amber. |
| Genjutsu | github.com/AThevon/genjutsu | Reference studied | "Cast" iron rules followed: one interaction thesis, respect the existing animation library, no unrequested dependencies. Its pipelines were not run (plugin system unavailable here). |
| Gstack | github.com/garrytan/gstack | Reference studied | The /design-review 80-item checklist was used as the audit list (typography, contrast, interaction states, motion, no colour-only encoding). Its binaries and browser need Claude Code, so they were not run; QA was done by the testing agent instead. |
| ECC (Everything Claude Code) | github.com/affaan-m/everything-claude-code | Reference studied | The frontend-a11y checklist was used: aria-live for the signal path and save status, aria-pressed selection, labelled icon-only controls. |
| Caveman | github.com/JuliusBrussee/caveman | Reference studied, not applied | A terse-reply style for agents. It does not apply to UI design, and it conflicts with the clear clinical microcopy this app needs. |
| Josh Puckett | interfacecraft.dev / joshpuckett.me (person) | Public site reviewed only | The library is paid; no paid content was accessed. The principle of interface craft and micro-interaction detail informed the selection and save feedback. |
| Raphael Salaja | raphaelsalaja.com (person, design engineer) | Public profile only | "Last-mile" refinement idea: interruptible shared-element selection (framer `layoutId`) for participants, events and folds. |
| Gavin Nelson | nelson.co (person, icon designer) | Public portfolio only | Informed the hand-drawn EVYZ mark: a pixel-aligned 28 px SVG with a baseline band and a trace leaving it. No assets were copied. |
| Micrographics (Figma) | figma.com/community files by Zachary Winterton and others | Concept only; Figma files not opened | Micrographic language rebuilt in CSS: indexed section rules with tick rulers, corner registration marks on the evidence panel, hatched regression bars. |
| K S | — | Unresolved | The name is ambiguous; no verifiable source was identified, so nothing was used. |

## How conflicting guidance was resolved
- **Panel shadows:** Impeccable allows soft shadows, while TasteSkill prefers flat panels. Resolved with flat 1 px line panels and a small hover lift only.
- **Animation library:** the GSAP skill recommends GSAP, while Ponytail and Genjutsu say to keep the installed library. Kept framer-motion.
- **Hover scale:** the Motion Design skill suggests hover scale, while Emil Kowalski says not to animate frequent elements. No hover scale on table rows; colour or shadow only.
