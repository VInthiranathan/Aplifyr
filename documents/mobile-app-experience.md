# Mobile App Experience

## Purpose and scope

Aplifyr uses one responsive web application for mobile, tablet, and desktop. The mobile layout is designed as an app shell: a fixed top bar, four primary bottom destinations, a contained scrolling content area, and controls that remain inside the viewport.

The rules apply to authenticated pages, job search and details, profile and career editing, generated CV views, cover-letter dialogs, consent dialogs, support, favorites, and authentication pages.

## App shell

- `frontend/components/Layout.tsx` uses the dynamic viewport height (`100dvh`) so browser chrome does not hide content.
- The top bar and bottom navigation include iOS safe-area insets.
- Only the main content region scrolls on authenticated pages. Horizontal viewport overflow is blocked globally.
- Mobile bottom navigation contains Home, Favorites, Jobs, and Profile. Support and privacy settings remain available from the top-right settings drawer.
- Nested job routes keep the Jobs destination active.

## Responsive interaction patterns

- Page content uses `app-page-shell`, which constrains desktop width and provides mobile-first spacing.
- Job cards, profile cards, forms, and empty states use smaller mobile padding and expand at larger breakpoints.
- Job filters stack to a single column on mobile. The region and municipality selector becomes a viewport-contained panel instead of a fixed-width desktop popover.
- Profile tabs form a two-column control on mobile instead of requiring horizontal page movement.
- Profile editing, AI consent, and cover-letter views use bottom-sheet behavior on mobile, with independently scrollable content and safe-area-aware actions.
- Primary paired actions use equal-width mobile grids where practical. Touch targets remain at least approximately 44 pixels high.
- The CV template gallery remains intentionally horizontal and snap-scrollable because it is a visual chooser; each card is capped to the mobile viewport width.

## Adding or changing UI

- Do not add unguarded fixed widths, `100vh`, `w-screen`, or mobile `min-width` values to application surfaces.
- Use `min-w-0`, wrapping, and `[overflow-wrap:anywhere]` for content that can contain external or user-provided text.
- Keep desktop grids behind responsive breakpoints and provide a single-column mobile default.
- Account for both fixed navigation bars and `env(safe-area-inset-*)` when adding sticky or fixed controls.
- Use a contained modal or bottom sheet with `dvh` maximum height; actions must remain reachable without horizontal scrolling.

## Verification

Run:

```bash
cd frontend
npm test
npm run build
```

`frontend/tests/mobile-layout.test.cjs` protects the app-shell safe areas, primary navigation count, mobile filter containment, profile tabs, and mobile dialog behavior. Visual checks should cover narrow mobile, wider mobile, tablet, and desktop viewports in both light and dark themes.
