# Changelog

## 2026-10-15 — New demonstrated high score: 9,117

- Updated the bilingual README with the latest successful in-game run: **9,117 points**, **259.3 km/h**, **7.375 s**, **295.6 m** braking distance, and **1,612 N** maximum displayed pedal force.
- Added `assets/high-score-9117.webp` (a readability-focused crop of the actual screenshot); retained `assets/high-score-9107.png` as a previous record.
- No changes to the controller or automatic score submission behavior.

## 1.1.0 — Tampermonkey auto-injection

- Added `brake-bot.user.js` with early page-context injection for Edge / Tampermonkey.
- Auto-starts one round after game initialization without opening DevTools.
- Added a compact in-page panel: start/retry, stop, auto-start toggle, frame-rate/score display, and editable braking distance (295–360 m).
- Uses the same three-frame predictive braking logic as the original `brake-bot.js`; the console version remains available.
- Added userscript metadata for GitHub-hosted updates and bilingual installation instructions.
- No automatic leaderboard submissions, backend modification, or score manipulation.

## Initial public release

- Predictive browser-console braking controller for the Extreme Braking Challenge game.
- Automatic round start and speed/distance-based braking activation.
- Three-render-frame search over hold/tap/release control actions.
- Pedal-force estimation with mismatch safeguard, manual stop command, and live status API.
- Includes a screenshot from an observed successful **9,107-point** run on Microsoft Edge around 55–60 FPS.

**Limitations:** frame timing and game changes can affect the result; scores are not guaranteed. BrakeBot does not directly modify the game's score or automatically submit leaderboard entries.
