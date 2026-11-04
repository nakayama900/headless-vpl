---
"headless-vpl": patch
---

fix(bindWheelZoom): make behavior configurable and treat deltaY === 0 as no-op by default

## Bug Fix

Previously, `bindWheelZoom` used `e.deltaY > 0 ? 1 - factor : 1 + factor`, which treated `deltaY === 0`
(e.g. pure horizontal scroll events) as zoom-in. This caused unintended zoom when scrolling horizontally.

`deltaY === 0` is now a no-op by default (`ignoreHorizontal: true`).

## New Options (`WheelZoomConfig`)

| Option | Type | Default | Description |
|---|---|---|---|
| `requireModifier` | `'none' \| 'ctrl' \| 'meta' \| 'alt' \| 'shift'` | `'none'` | Modifier key required to trigger zoom |
| `ignoreHorizontal` | `boolean` | `true` | Ignore events where `deltaY === 0` (horizontal scroll) |
| `eps` | `number` | `0` | Ignore events where `Math.abs(deltaY) < eps` |
| `normalizeDeltaMode` | `boolean` | `false` | Normalize `deltaY` by `deltaMode` (line → pixel) |
| `lineHeight` | `number` | `16` | Pixels per line when `normalizeDeltaMode` is `true` |

## Behavior Changes

- `e.preventDefault()` is now called **only when a zoom will occur**, avoiding interference with
  horizontal scrolling or other scroll handlers when zoom is skipped.
- All new options default to values that preserve prior behavior, except for the `deltaY === 0` fix.
