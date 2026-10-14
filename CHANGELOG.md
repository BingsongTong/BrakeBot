# Changelog

## 1.1.0 — Tampermonkey auto-injection

- Added `brake-bot.user.js` with early page-context injection for Edge / Tampermonkey.
- Auto-starts one round after game initialization without opening DevTools.
- Added a compact in-page panel: start/retry, stop, auto-start toggle, frame-rate/score display, and editable braking distance (295–360 m).
- Uses the same three-frame predictive braking logic as the original `brake-bot.js`; the console version remains available.
- Added userscript metadata for GitHub-hosted updates and bilingual installation instructions.
- No automatic leaderboard submissions, backend modification, or score manipulation.

# Changelog

## Initial public release

- Predictive browser-console braking controller for the Extreme Braking Challenge game.
- Automatic round start and speed/distance-based braking activation.
- Three-render-frame search over hold/tap/release control actions.
- Pedal-force estimation with mismatch safeguard, manual stop command, and live status API.
- Includes a screenshot from an observed successful **9,107-point** run on Microsoft Edge around 55–60 FPS.

**Limitations:** frame timing and game changes can affect the result; scores are not guaranteed. BrakeBot does not directly modify the game's score or automatically submit leaderboard entries.
