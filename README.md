# 600

A personal meditation training log. 600 hours is the goal.

Built as a client-only Progressive Web App: runs offline on the phone
after a one-time install from a GitHub Pages URL. Dark sage theme,
rotary dial for the countdown, breath-pacer animation, Web Audio bell,
and a 600-hour progress ring on the dashboard.

## Live URL

<https://vincentbeermann.github.io/meditation-600/>

## Install on iPhone (one-time)

Open the live URL in Safari, tap Share, choose Add to Home Screen.
After that the app runs offline. You can close Safari and launch 600
from the home screen icon.

## Local development

```sh
cd Code
./serve.sh
```

Serves `Code/public/` on port 3002 via `python3 -m http.server`. Open
`http://localhost:3002` to see the app. The printed LAN URL can also
be used on the iPhone for a one-off install without pushing to
GitHub.

## Deploy

```sh
./deploy.sh
```

Bumps the service-worker cache version (so installed phones pull the
new files on next launch), pushes `main`, and force-pushes a fresh
`gh-pages` branch via `git subtree split --prefix Code/public`.

The GitHub Pages site is served from the `gh-pages` branch. Set this
once in the repository settings after the first push:

> Settings -> Pages -> Source: `gh-pages` branch, `/ (root)`.

On the iPhone, close 600 fully (swipe up) and reopen it after deploy;
the service worker will then fetch the new files.

## Data

Every session lives in `localStorage` under `meditation-600-v1`. The
app has an Export button on the dashboard that downloads a JSON
backup. Run it occasionally; a phone wipe or localStorage eviction
would otherwise erase the whole log.

## Structure

```
Code/
  serve.sh              Local static server for development
  public/
    index.html          SPA shell
    app.js              Hash router + toast helper
    storage.js          localStorage API + VARIANTS catalog
    style.css           Dark sage theme
    sw.js               Service worker (cache-first)
    manifest.webmanifest
    icon-192.png, icon-512.png
    modules/
      timer.js          Rotary dial + countdown/open + bell + pacer
      log.js            Post-sit log form
      history.js        Session list
      dashboard.js      600h ring + heatmap + variants + data mgmt
deploy.sh               Deploy to GitHub Pages
.gitignore
```

## Credits

Architecture forked from
[sport-tracker](https://github.com/vincentbeermann/sport-tracker):
same localStorage + service-worker + hash-router pattern, same deploy
script shape. Reworked for meditation tracking with new modules, new
theme, and a rotary-dial timer.
