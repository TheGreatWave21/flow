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
- **Free layout** — click the ▦ button (bottom-right) to enter *edit mode*, then drag the
  clock or any panel anywhere on screen and resize it with the − / + handles. "Reset to
  default" puts everything back. Layout is saved per browser.
- **Your own background** — pick a preset, let it follow the time of day ("auto"), **upload
  an image**, **upload a video**, or paste a **YouTube URL** to use a video as a live
  background. Plus blur / darken / grayscale sliders.
- **Show/hide widgets** and set your name
- **Works offline** and **installs like a native app** (PWA)

### About video backgrounds

A background video is **always fully muted** — nothing running in a browser can strip out
*just the music* from someone else's video, so the honest, working version is "no audio at
all" (which is what people want for lofi / ambient loops anyway). YouTube backgrounds also
need an internet connection and a video whose owner allows embedding. Uploaded images and
videos are stored only in your browser (IndexedDB) and never leave the device.

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
