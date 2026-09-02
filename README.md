# Flow

A calm, single-page focus dashboard — a **completely free**, local-only alternative to sites like Flocus.

No accounts. No subscriptions. No tracking. No server. Nothing is ever sent anywhere —
every setting, task and note lives only in your own browser.

## Features

- **Clock & greeting** — large time, date, greeting by name (12/24-hour, optional seconds)
- **Quote of the day** — a random quote picked fresh each day; a shuffle button for a new one anytime; add your own quotes in Settings
- **Pomodoro timer** — Focus / short break / long break, configurable durations, auto-cycles to a long break every 4 focus sessions, optional sound + desktop notification, a daily "done" counter, countdown shown in the browser tab
- **Tasks** — quick add, check off, delete, clear completed
- **Notes** — a scratch pad that autosaves as you type
- **Customizable layout** — show/hide any widget, pick a background (or "auto" which follows the time of day), set your name
- **Works offline** and **installs like a native app** (PWA)

## Run it

It's just static files — no build step, no dependencies. Serve the folder with anything:

```bash
python -m http.server 8000
# or
npx serve .
```

Then open `http://localhost:8000`.

Opening `index.html` directly via `file://` mostly works, but offline mode and
"Install app" only activate when it's served over `http://` or `https://`.

## Install as an app

Open it in Chrome or Edge → click the **Install** icon in the address bar
(or menu → *Install Flow* / *Apps → Install this site as an app*). It then opens
in its own window and shows up in your Start menu / taskbar / dock.

## Host it for free

So you can open it from any device (tasks and notes stay per-device — there's no backend):

- **GitHub Pages** — repo **Settings → Pages → Deploy from branch → `main` / root**. Done.
- **Netlify / Cloudflare Pages / Vercel** — drag-and-drop the folder, no configuration.

All of these have free tiers that comfortably cover a static site like this.

## Files

| File | Purpose |
|---|---|
| `index.html` | markup |
| `styles.css` | all styling |
| `app.js` | all behavior |
| `quotes.js` | built-in quote pool (edit freely) |
| `manifest.webmanifest` / `sw.js` | PWA install + offline cache |
| `icons/` | app icons, plus `make_icons.py` which regenerates the PNGs |

After changing any file, bump `VERSION` in `sw.js` so browsers pick up the update.

## License

[MIT](LICENSE) — free to use, modify and share.
