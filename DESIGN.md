# EVYZ design system

EVYZ is a review workspace for specialist care teams. A sustained change should be easy to find, and the evidence behind it easy to inspect. The interface uses a calm clinical record as its visual reference: clear hierarchy, measured density, precise labels, and space around consequential decisions.

## Product boundaries

- The main workflow is import → participant timeline → sustained-change event → evidence-linked brief → saved human review.
- Glucose change detection compares each participant with their own recent history. Heart rate and skin temperature provide context.
- Events are ordered by recency for review. They are not risk ranked or diagnoses.
- The EEG lab is a separate research demonstration using a public dataset. It does not affect clinic participants or reviews.
- EVYZ is a demonstration prototype, not clinically validated and not a medical device.

## Layout and hierarchy

- A dark navigation rail anchors the desktop workspace. On narrow screens, navigation becomes a scrollable horizontal row.
- A warm paper content surface holds the task, current state, controls, and evidence in that order.
- Dense evidence stays in tables where comparison matters; narrow screens scroll those tables within their own region.
- Page titles have no kicker labels. Status meaning appears in text as well as color.

## Color and type

- Paper: `hsl(42 30% 95%)`; panel: `hsl(40 60% 99%)`; ink: `hsl(156 14% 12%)`.
- Teal `#0e6b62` marks the current location and primary actions. Amber `#8a4a00` marks changes awaiting review. Regression and error use `#9b2f1f`.
- Public Sans carries interface text; Newsreader is used for display headings; IBM Plex Mono marks code and identifiers. Figures use tabular numerals.
- Charts retain the distinct colors for glucose, baseline, flags, gaps, heart rate, and skin temperature.

## Surfaces and motion

- Panels use a subtle hairline and restrained depth. Cards group a real task or evidence set.
- Navigation selection follows the current destination, participant rows respond to filtering, and route changes use a brief transition. The sign-in signal illustrates movement from personal baseline to sustained change.
- Reduced-motion preferences remove spatial animation. Controls retain visible focus and press feedback.
