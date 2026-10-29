# EVYZ design thesis

EVYZ is a review workspace for specialist care teams. Its interface should make a sustained change easy to find, then make the evidence behind that change easy to inspect. The visual language takes its cues from a careful clinical report: clear hierarchy, measured density, precise labels, and quiet space around consequential decisions.

## Product truth

- The main workflow is import → participant timeline → sustained-change event → evidence-linked brief → saved human review.
- Glucose change detection compares each participant with their own recent history. Heart rate and skin temperature are contextual measurements.
- Events are ordered by recency for review. They are not risk ranked or diagnoses.
- The software is a demonstration prototype and is not clinically validated or a medical device.

These points come from the project [README](README.md). Interface copy and visuals must preserve those boundaries.

## Visual system

- **Structure:** a stable dark navigation rail on desktop, compact horizontal navigation on mobile, and a warm light reading surface. The navigation stays quiet while the content carries the task.
- **Hierarchy:** each page opens with the task, followed by current state, controls, then evidence. Numeric values use tabular figures. Dense tables remain tables where comparison matters.
- **Color:** navy is the frame; teal identifies current position and primary action; amber marks items awaiting review. Status meaning must also be written in text.
- **Type:** IBM Plex Sans for interface language, IBM Plex Mono for measurement, identifiers, and timestamps. Short labels are precise; prose remains readable.
- **Surfaces:** subtle borders and restrained depth. Cards group a real task or evidence set, not decoration.

## Motion thesis

Motion explains where attention went. The navigation indicator follows the current destination, the participant list responds to review filtering, and route changes use a brief transition. The sign-in signal draws once to explain the move from personal baseline to sustained change; it is explicitly illustrative. Routine actions stay fast, and reduced-motion preferences remove spatial movement.

## Responsive and accessible behavior

The content column expands on large screens. On narrow screens, the navigation becomes a scrollable horizontal row and dense evidence tables scroll within their own region. Controls retain visible focus, text labels carry status, and all animation has a reduced-motion path.
