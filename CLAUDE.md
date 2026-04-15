# side-meditation-600

## Overview
Personal meditation tracker named "600" -- Vincent's training goal is 600
hours of seated meditation. Client-only PWA, runs offline on the phone.

## Status
- **Phase:** v1 built (2026-04-15). Syntax and asset smoke tests pass.
  Visual verification in a real browser still pending -- Vincent will
  do the install + first use.
- **Priority:** low (side project, no deadline)
- **Users:** Vincent, one device

## Architecture
Direct fork of [side-sport-webapp](../side-sport-webapp/), same pattern:

- Vanilla HTML/CSS/JS, no framework
- `localStorage` persistence under key `meditation-600-v1`
- Hash-based router (`#dashboard`, `#timer`, `#log`, `#history`)
- Three-tab bottom bar: Path (dashboard), Sit (timer), Log (history)
- Service worker for offline, webmanifest for "Add to Home Screen"
- Dark theme with soft sage accent (`#c7f2d5`), Cormorant Garamond for
  display text, Inter for UI

## Differences from sport-webapp

What was kept:
- Storage abstraction pattern (`window.api.createSession` etc.)
- ISO-week streak calculation
- 90-day heatmap grid
- Export / import / wipe in the dashboard
- Service worker cache-first + network-first-navigation strategy

What is new:
- **600h progress ring.** Central SVG circle on the dashboard, thin
  track + sage fill, hours rendered large in the middle. Milestone chips
  (10, 50, 100, 300, 600) highlight when reached.
- **Rotary dial** for countdown duration (1-120 min, SVG, touch + mouse
  drag). Replaces the sport app's variant picker.
- **Two timer modes:** countdown (dial sets length) and open (counter
  runs up).
- **Breath pacer** -- subtle pulsating circle behind the timer display,
  10-second cycle, not tied to a variant.
- **Pre-session intention field** (one line, optional, saved with the sit)
- **Post-sit log screen** with variant picker (6 styles), note textarea,
  and two 1-5 ratings for calm and focus.
- **Web-Audio bell** generated via OscillatorNode (attack + exponential
  decay envelope). No audio assets in the cache.

## File layout

```
Code/
  serve.sh                  # Static server for first-time install (port 3002)
  public/
    index.html              # SPA shell
    app.js                  # Router + toast helper
    storage.js              # localStorage-backed window.api + VARIANTS catalog
    style.css               # Dark sage theme
    sw.js                   # Service worker (cache: meditation-600-v1)
    manifest.webmanifest    # PWA manifest
    modules/
      timer.js              # Rotary dial + countdown/open + bell + pacer
      log.js                # Post-sit log form
      history.js            # Reverse-chronological session list
      dashboard.js          # 600h ring, streak, heatmap, variants, data mgmt
```

Icons (`icon-192.png`, `icon-512.png`) are NOT yet present. The PWA will
fall back to no icon until they are added. Simple PIL-generated icons
are sufficient; Vincent can regenerate them with a short script or a
graphics tool.

## Session data shape

```js
{
  id:           'uuid',
  date:         'YYYY-MM-DD',
  duration_min: 20,
  variant:      'breathing' | 'body-scan' | 'open-awareness'
              | 'loving-kindness' | 'mantra' | 'silent' | null,
  intention:    'one line, optional',
  note:         'free-form post-sit note',
  rating_calm:  1..5 | null,
  rating_focus: 1..5 | null,
}
```

The 600h goal is a constant in `storage.js` (`GOAL_HOURS = 600`).
Progress is computed from the sum of `duration_min` across all sessions.

## Install flow (same as sport-webapp)

```bash
cd ~/Documents/passive/side-meditation-600/Code
./serve.sh
```

Prints a localhost URL and a LAN URL. Open the LAN URL on the iPhone in
Safari -> Share -> Add to Home Screen. After that, the app runs offline;
the Mac server can be stopped.

The sport-webapp runs on port 3001, this one on port 3002, so both can
be served at the same time during installation.

## Smoke tests done

- `node --check` passes on all six JS files (storage, app, sw, and the
  four modules).
- `python3 -m http.server` serves every asset with HTTP 200 (index.html,
  style.css, app.js, storage.js, sw.js, manifest, four module files).
- `index.html` contains the correct title, three tab routes
  (`#dashboard`, `#timer`, `#history`), and all script includes.

## Not yet tested

- **Actual install on iPhone.** Service worker behavior on non-https LAN
  IP may still fail on iOS Safari (same risk as the sport-webapp); if
  so, fallback to GitHub Pages.
- **Visual check of the rotary dial and progress ring** in a real
  browser. The SVG arc math for the dial was copy-written, not
  interactively verified.
- **Bell audio on first interaction.** `AudioContext` must be created
  after a user gesture on Safari; this is handled by creating it lazily
  in `beep()`, but needs a live check.
- **Halftime chime** only fires for sits >= 5 min; confirm during use.
- **Long sits** (60+ min) -- the display uses h:mm:ss format for
  anything >= 60 min. Needs a real sit to confirm.
- **Icons are missing.** `manifest.webmanifest` references
  `icon-192.png` and `icon-512.png` but those files are not present.
  The PWA install should still work but without a home-screen icon.
  Next step: generate both with a simple PIL script or from a designed
  SVG.

## Log

### 2026-04-15
- Forked `side-sport-webapp/Code/public/` into this project.
- Removed sport modules (gym, run, yoga, kb, dashboard, exercises).
- Rewrote `storage.js` with meditation-specific session shape and
  `computeStats` that returns progress + milestones + variant breakdown.
- Built four new modules: timer (with SVG rotary dial and Web Audio
  bell), log (variant picker + ratings), history (reverse list),
  dashboard (600h progress ring + heatmap + variants + data mgmt).
- New dark theme with sage accent (`#c7f2d5`), Cormorant Garamond +
  Inter. Dropped the sport-webapp's yellow-green accent and Barlow.
- `serve.sh` uses port 3002 so it can run alongside the sport-webapp.
- JS syntax and HTTP asset smoke tests pass. Browser test pending.
