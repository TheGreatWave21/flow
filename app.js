/* Flow — a local-only focus dashboard. No accounts, no network. */
(() => {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const pad = (n) => String(n).padStart(2, "0");
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
  const mb = (bytes) => (bytes / 1048576).toFixed(1) + " MB";
  const todayKey = () => {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  // ---- Media storage (IndexedDB — localStorage is too small for images/video)
  const idb = {
    _db: null,
    open() {
      return new Promise((res, rej) => {
        const r = indexedDB.open("flow", 1);
        r.onupgradeneeded = () => r.result.createObjectStore("media");
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
    },
    async _get() { return (this._db ||= await this.open()); },
    async set(key, blob) {
      const db = await this._get();
      return new Promise((res, rej) => {
        const tx = db.transaction("media", "readwrite");
        tx.objectStore("media").put(blob, key);
        tx.oncomplete = () => res();
        tx.onerror = () => rej(tx.error);
      });
    },
    async get(key) {
      const db = await this._get();
      return new Promise((res, rej) => {
        const rq = db.transaction("media", "readonly").objectStore("media").get(key);
        rq.onsuccess = () => res(rq.result || null);
        rq.onerror = () => rej(rq.error);
      });
    },
    async del(key) {
      const db = await this._get();
      return new Promise((res) => {
        const tx = db.transaction("media", "readwrite");
        tx.objectStore("media").delete(key);
        tx.oncomplete = () => res();
        tx.onerror = () => res();
      });
    },
  };

  // ---- Background presets -------------------------------------------------
  const BACKGROUNDS = {
    aurora: "linear-gradient(160deg, #1b2735 0%, #203a43 40%, #2c5364 70%, #4b6cb7 100%)",
    dusk: "linear-gradient(160deg, #2b1055 0%, #7597de 100%)",
    ember: "linear-gradient(160deg, #0f0c29 0%, #302b63 45%, #b24592 100%)",
    forest: "linear-gradient(160deg, #0b3d2e 0%, #145a32 45%, #1e824c 100%)",
    ocean: "linear-gradient(160deg, #0a2647 0%, #144272 50%, #205295 100%)",
    sakura: "linear-gradient(160deg, #3a1c3d 0%, #833a5a 50%, #d98a9e 100%)",
    mono: "linear-gradient(160deg, #16181d 0%, #23262e 60%, #31353f 100%)",
    dawn: "linear-gradient(160deg, #24243e 0%, #302b63 40%, #f0a67a 100%)",
  };
  const BG_ORDER = ["auto", ...Object.keys(BACKGROUNDS)];

  function autoBackground() {
    const h = new Date().getHours();
    if (h >= 5 && h < 8) return BACKGROUNDS.dawn;
    if (h >= 8 && h < 17) return BACKGROUNDS.ocean;
    if (h >= 17 && h < 20) return BACKGROUNDS.dusk;
    return BACKGROUNDS.aurora;
  }

  // ---- State ------------------------------------------------------------
  const KEY = "focus.state.v1";
  const DEFAULTS = {
    name: "",
    background: "auto",
    bgFx: { blur: 0, dim: 45, grayscale: 0 },
    bgYouTube: "",
    hasBgImage: false,
    hasBgVideo: false,
    layout: { custom: false, blocks: {} },
    clockFormat: "24",
    showSeconds: false,
    widgets: { quote: true, pomodoro: true, tasks: true, notes: true },
    pomodoro: { work: 25, short: 5, long: 15, autostart: false, sound: true },
    tasks: [],
    notes: "",
    customQuotes: [],
    dailyQuote: null, // { date, text, author }
    pomoCompleted: { date: null, count: 0 },
  };

  let state = load();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return structuredClone(DEFAULTS);
      const parsed = JSON.parse(raw);
      return deepMerge(structuredClone(DEFAULTS), parsed);
    } catch {
      return structuredClone(DEFAULTS);
    }
  }
  function isPlainObject(v) {
    return v && typeof v === "object" && !Array.isArray(v);
  }
  function deepMerge(base, extra) {
    for (const k of Object.keys(extra || {})) {
      if (isPlainObject(extra[k]) && isPlainObject(base[k])) {
        deepMerge(base[k], extra[k]);
      } else if (extra[k] !== undefined) {
        base[k] = extra[k];
      }
    }
    return base;
  }
  let saveTimer;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
    }, 150);
  }

  // ---- Clock + greeting ------------------------------------------------
  const elClock = $("#clock");
  const elGreet = $("#greet");
  const elDate = $("#date");

  function tick() {
    const d = new Date();
    let h = d.getHours();
    const m = d.getMinutes();
    const s = d.getSeconds();
    let str;
    if (state.clockFormat === "12") {
      const ampm = h >= 12 ? "PM" : "AM";
      const h12 = h % 12 || 12;
      str = `${h12}:${pad(m)}${state.showSeconds ? ":" + pad(s) : ""} ${ampm}`;
    } else {
      str = `${pad(h)}:${pad(m)}${state.showSeconds ? ":" + pad(s) : ""}`;
    }
    elClock.textContent = str;

    const part = h < 5 ? "night" : h < 12 ? "morning" : h < 18 ? "afternoon" : "evening";
    const name = state.name.trim();
    elGreet.textContent = `Good ${part}${name ? ", " + name : ""}.`;
    elDate.textContent = d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  }

  // ---- Background ----------------------------------------------------
  let bgImageURL = "";
  let bgVideoURL = "";

  function parseYouTubeId(input) {
    const s = (input || "").trim();
    if (/^[\w-]{11}$/.test(s)) return s;
    try {
      const u = new URL(s);
      if (u.hostname.includes("youtu.be")) return u.pathname.slice(1, 12);
      if (u.searchParams.get("v")) return u.searchParams.get("v").slice(0, 11);
      const m = u.pathname.match(/\/(embed|shorts|live)\/([\w-]{11})/);
      if (m) return m[2];
    } catch {}
    return "";
  }

  function applyBgFx() {
    const rootStyle = document.documentElement.style;
    rootStyle.setProperty("--bg-blur", (state.bgFx.blur || 0) + "px");
    rootStyle.setProperty("--bg-gray", (state.bgFx.grayscale || 0) / 100);
    rootStyle.setProperty("--bg-dim", (state.bgFx.dim ?? 45) / 100);
  }

  async function applyBackground() {
    const id = state.background;
    const bg = $("#bg");
    const media = $("#bg-media");
    applyBgFx();

    media.innerHTML = "";
    bg.classList.remove("has-image");
    bg.style.backgroundImage = "";

    if (id === "image") {
      const blob = await idb.get("bg-image");
      if (blob) {
        if (bgImageURL) URL.revokeObjectURL(bgImageURL);
        bgImageURL = URL.createObjectURL(blob);
        bg.style.background = "#0f1220";
        bg.style.backgroundImage = `url("${bgImageURL}")`;
        bg.classList.add("has-image");
        return;
      }
    } else if (id === "video") {
      const blob = await idb.get("bg-video");
      if (blob) {
        if (bgVideoURL) URL.revokeObjectURL(bgVideoURL);
        bgVideoURL = URL.createObjectURL(blob);
        const v = document.createElement("video");
        v.src = bgVideoURL;
        v.autoplay = true;
        v.loop = true;
        v.muted = true;
        v.defaultMuted = true;
        v.setAttribute("muted", "");
        v.setAttribute("playsinline", "");
        v.playsInline = true;
        media.appendChild(v);
        v.play().catch(() => {});
        bg.style.background = "#0f1220";
        return;
      }
    } else if (id === "youtube") {
      const yt = state.bgYouTube;
      if (yt) {
        const p = new URLSearchParams({
          autoplay: "1", mute: "1", controls: "0", loop: "1", playlist: yt,
          playsinline: "1", modestbranding: "1", disablekb: "1", rel: "0",
          iv_load_policy: "3", fs: "0",
        });
        const f = document.createElement("iframe");
        f.src = `https://www.youtube-nocookie.com/embed/${yt}?${p}`;
        f.allow = "autoplay; encrypted-media; picture-in-picture";
        f.setAttribute("frameborder", "0");
        f.setAttribute("tabindex", "-1");
        media.appendChild(f);
        bg.style.background = "#0f1220";
        return;
      }
    }

    // fallback: preset / auto gradient
    const css = id === "auto" ? autoBackground() : (BACKGROUNDS[id] || autoBackground());
    bg.style.background = css;
  }

  // ---- Quote --------------------------------------------------------
  const elQuoteText = $("#quote-text");
  const elQuoteAuthor = $("#quote-author");

  function quotePool() {
    const custom = (state.customQuotes || []).filter((q) => q && q.text);
    return [...(window.QUOTES || []), ...custom];
  }
  function randomQuote(avoid) {
    const pool = quotePool();
    if (!pool.length) return { text: "Begin.", author: "" };
    if (pool.length === 1) return pool[0];
    let q;
    do { q = pool[Math.floor(Math.random() * pool.length)]; }
    while (avoid && q.text === avoid);
    return q;
  }
  function renderQuote(q) {
    elQuoteText.textContent = `“${q.text}”`;
    elQuoteAuthor.textContent = q.author ? `— ${q.author}` : "";
  }
  function ensureDailyQuote() {
    const dq = state.dailyQuote;
    if (!dq || dq.date !== todayKey()) {
      const q = randomQuote();
      state.dailyQuote = { date: todayKey(), text: q.text, author: q.author };
      save();
    }
    renderQuote(state.dailyQuote);
  }
  $("#quote-shuffle").addEventListener("click", () => {
    const q = randomQuote(state.dailyQuote && state.dailyQuote.text);
    state.dailyQuote = { date: todayKey(), text: q.text, author: q.author };
    save();
    renderQuote(q);
  });

  // ---- Pomodoro ----------------------------------------------------
  const PH = { work: "Focus", short: "Short break", long: "Long break" };
  const elPhase = $("#pomo-phase");
  const elTime = $("#pomo-time");
  const elStart = $("#pomo-start");
  const elCount = $("#pomo-count");

  let phase = "work";
  let remaining = state.pomodoro.work * 60;
  let running = false;
  let endAt = 0;
  let rafId = 0;
  const baseTitle = "Flow";

  function phaseSeconds(p) { return Math.max(1, state.pomodoro[p]) * 60; }

  function resetPomoCount() {
    if (state.pomoCompleted.date !== todayKey()) {
      state.pomoCompleted = { date: todayKey(), count: 0 };
    }
  }
  function renderCount() {
    resetPomoCount();
    elCount.textContent = `${state.pomoCompleted.count} done`;
  }

  function renderPomo() {
    const mm = Math.floor(remaining / 60);
    const ss = Math.floor(remaining % 60);
    const label = `${pad(mm)}:${pad(ss)}`;
    elTime.textContent = label;
    elPhase.textContent = PH[phase];
    elStart.textContent = running ? "Pause" : "Start";
    document.title = running ? `${label} · ${PH[phase]}` : baseTitle;
    $$(".chip").forEach((c) => c.classList.toggle("active", c.dataset.phase === phase));
  }

  function loop() {
    if (!running) return;
    remaining = Math.max(0, (endAt - Date.now()) / 1000);
    renderPomo();
    if (remaining <= 0) {
      running = false;
      onPhaseEnd();
      return;
    }
    rafId = requestAnimationFrame(loop);
  }

  function startPomo() {
    if (running) { pausePomo(); return; }
    running = true;
    endAt = Date.now() + remaining * 1000;
    renderPomo();
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);
  }
  function pausePomo() {
    running = false;
    cancelAnimationFrame(rafId);
    renderPomo();
  }
  function setPhase(p, autostart) {
    phase = p;
    running = false;
    cancelAnimationFrame(rafId);
    remaining = phaseSeconds(p);
    renderPomo();
    if (autostart) startPomo();
  }
  function onPhaseEnd() {
    beep();
    notify(`${PH[phase]} finished`);
    if (phase === "work") {
      resetPomoCount();
      state.pomoCompleted.count += 1;
      save();
      renderCount();
      const next = state.pomoCompleted.count % 4 === 0 ? "long" : "short";
      setPhase(next, state.pomodoro.autostart);
    } else {
      setPhase("work", state.pomodoro.autostart);
    }
  }

  elStart.addEventListener("click", startPomo);
  $("#pomo-reset").addEventListener("click", () => setPhase(phase, false));
  $("#pomo-skip").addEventListener("click", () => {
    if (phase === "work") onPhaseEnd();
    else setPhase("work", false);
  });
  $$(".chip").forEach((c) => c.addEventListener("click", () => setPhase(c.dataset.phase, false)));

  let audioCtx;
  function beep() {
    if (!state.pomodoro.sound) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const now = audioCtx.currentTime;
      [0, 0.18, 0.36].forEach((t) => {
        const osc = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(660, now + t);
        g.gain.setValueAtTime(0.0001, now + t);
        g.gain.exponentialRampToValueAtTime(0.3, now + t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.16);
        osc.connect(g).connect(audioCtx.destination);
        osc.start(now + t);
        osc.stop(now + t + 0.18);
      });
    } catch {}
  }
  function notify(msg) {
    if (!("Notification" in window)) return;
    if (Notification.permission === "granted") {
      try { new Notification("Flow", { body: msg, silent: true }); } catch {}
    }
  }

  // ---- Tasks ------------------------------------------------------
  const elTaskList = $("#task-list");
  const elTaskInput = $("#task-input");
  const elTaskCount = $("#task-count");
  const elTaskClear = $("#task-clear");

  function renderTasks() {
    elTaskList.innerHTML = "";
    if (!state.tasks.length) {
      const li = document.createElement("li");
      li.className = "empty";
      li.textContent = "Nothing yet. Add your first task.";
      elTaskList.appendChild(li);
    }
    for (const t of state.tasks) {
      const li = document.createElement("li");
      li.className = t.done ? "done" : "";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = t.done;
      cb.addEventListener("change", () => { t.done = cb.checked; save(); renderTasks(); });
      const span = document.createElement("span");
      span.className = "txt";
      span.textContent = t.text;
      const del = document.createElement("button");
      del.className = "del";
      del.setAttribute("aria-label", "Delete task");
      del.textContent = "✕";
      del.addEventListener("click", () => {
        state.tasks = state.tasks.filter((x) => x.id !== t.id);
        save(); renderTasks();
      });
      li.append(cb, span, del);
      elTaskList.appendChild(li);
    }
    const left = state.tasks.filter((t) => !t.done).length;
    elTaskCount.textContent = `${left} left`;
    elTaskClear.hidden = !state.tasks.some((t) => t.done);
  }
  $("#task-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const text = elTaskInput.value.trim();
    if (!text) return;
    state.tasks.push({ id: Date.now() + Math.random().toString(36).slice(2, 6), text, done: false });
    elTaskInput.value = "";
    save(); renderTasks();
  });
  elTaskClear.addEventListener("click", () => {
    state.tasks = state.tasks.filter((t) => !t.done);
    save(); renderTasks();
  });

  // ---- Notes ----------------------------------------------------
  const elNotes = $("#notes");
  const elNoteSaved = $("#note-saved");
  elNotes.value = state.notes;
  let noteFlash;
  elNotes.addEventListener("input", () => {
    state.notes = elNotes.value;
    save();
    elNoteSaved.textContent = "saving…";
    clearTimeout(noteFlash);
    noteFlash = setTimeout(() => (elNoteSaved.textContent = "saved"), 500);
  });

  // ---- Widget visibility --------------------------------------
  function applyWidgets() {
    for (const [id, on] of Object.entries(state.widgets)) {
      const el = $("#w-" + id);
      if (el) el.hidden = !on;
    }
  }

  // ---- Layout: free positioning + resize ---------------------
  let editing = false;
  const editBar = $("#edit-bar");

  function applyLayout() {
    const cust = !!state.layout.custom;
    if (cust) {
      // Fill in any block that has no saved position yet (measure it in flow first).
      for (const el of $$("[data-drag]")) {
        if (!state.layout.blocks[el.id]) {
          const r = el.getBoundingClientRect();
          state.layout.blocks[el.id] = {
            x: +(r.left / innerWidth * 100).toFixed(2),
            y: +(r.top / innerHeight * 100).toFixed(2),
            scale: 1,
          };
        }
      }
    }
    document.body.classList.toggle("lay-custom", cust);
    for (const el of $$("[data-drag]")) {
      const b = cust && state.layout.blocks[el.id];
      if (b) {
        el.style.left = b.x + "%";
        el.style.top = b.y + "%";
        el.style.transform = `scale(${b.scale || 1})`;
      } else {
        el.style.left = el.style.top = el.style.transform = "";
      }
    }
  }

  function setEdit(on) {
    editing = on;
    if (on && !state.layout.custom) state.layout.custom = true;
    applyLayout();
    document.body.classList.toggle("editing", on);
    editBar.hidden = !on;
    if (on) addTools(); else removeTools();
    save();
  }

  function resetLayout() {
    state.layout = { custom: false, blocks: {} };
    editing = false;
    document.body.classList.remove("editing");
    editBar.hidden = true;
    removeTools();
    applyLayout();
    save();
  }

  function addTools() {
    removeTools();
    for (const el of $$("[data-drag]")) {
      const t = document.createElement("div");
      t.className = "lay-tools";
      t.innerHTML =
        '<button type="button" data-act="move" title="Drag">✥</button>' +
        '<button type="button" data-act="down" title="Smaller">−</button>' +
        '<button type="button" data-act="up" title="Bigger">+</button>';
      el.appendChild(t);
      t.querySelector('[data-act="move"]').addEventListener("pointerdown", (e) => startDrag(e, el));
      t.querySelector('[data-act="down"]').addEventListener("click", () => scaleBlock(el, -0.1));
      t.querySelector('[data-act="up"]').addEventListener("click", () => scaleBlock(el, 0.1));
    }
  }
  function removeTools() { $$(".lay-tools").forEach((n) => n.remove()); }

  function scaleBlock(el, d) {
    const b = state.layout.blocks[el.id];
    if (!b) return;
    b.scale = clamp(+(((b.scale || 1) + d).toFixed(2)), 0.5, 2);
    el.style.transform = `scale(${b.scale})`;
    save();
  }

  function startDrag(ev, el) {
    ev.preventDefault();
    const b = state.layout.blocks[el.id];
    if (!b) return;
    const sx = ev.clientX, sy = ev.clientY, ox = b.x, oy = b.y;
    const vw = innerWidth, vh = innerHeight;
    document.body.classList.add("dragging");
    const move = (e) => {
      b.x = clamp(ox + (e.clientX - sx) / vw * 100, -8, 96);
      b.y = clamp(oy + (e.clientY - sy) / vh * 100, -3, 96);
      el.style.left = b.x + "%";
      el.style.top = b.y + "%";
    };
    const up = () => {
      document.body.classList.remove("dragging");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      save();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  // grab a panel anywhere (not on its controls) while editing
  for (const el of $$("[data-drag]")) {
    el.addEventListener("pointerdown", (e) => {
      if (!editing) return;
      if (e.target.closest("button, input, textarea, select, a")) return;
      startDrag(e, el);
    });
  }

  $("#edit-layout").addEventListener("click", () => setEdit(!editing));
  $("#edit-done").addEventListener("click", () => setEdit(false));
  $("#edit-reset").addEventListener("click", resetLayout);

  // ---- Settings drawer ---------------------------------------
  const drawer = $("#settings");
  $("#open-settings").addEventListener("click", () => { drawer.hidden = false; syncSettings(); });
  $("#close-settings").addEventListener("click", () => (drawer.hidden = true));
  drawer.addEventListener("click", (e) => { if (e.target === drawer) drawer.hidden = true; });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (editing) setEdit(false);
    else drawer.hidden = true;
  });

  const setName = $("#set-name");
  const setSeconds = $("#set-seconds");
  const setWork = $("#set-work");
  const setShort = $("#set-short");
  const setLong = $("#set-long");
  const setAutostart = $("#set-autostart");
  const setSound = $("#set-sound");
  const setQuotes = $("#set-quotes");
  const setBgBlur = $("#set-bg-blur");
  const setBgDim = $("#set-bg-dim");
  const setBgGray = $("#set-bg-gray");
  const setBgYt = $("#set-bg-yt");

  const SPECIAL_BG = [
    { id: "image", label: "🖼", when: () => state.hasBgImage },
    { id: "video", label: "🎬", when: () => state.hasBgVideo },
    { id: "youtube", label: "▶", when: () => !!state.bgYouTube },
  ];

  function buildBgPicker() {
    const wrap = $("#bg-picker");
    wrap.innerHTML = "";
    for (const id of BG_ORDER) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "bg-swatch" + (state.background === id ? " active" : "");
      b.title = id;
      b.style.background = id === "auto"
        ? "conic-gradient(from 180deg, #f0a67a, #205295, #2c5364, #f0a67a)"
        : BACKGROUNDS[id];
      b.addEventListener("click", () => {
        state.background = id;
        save();
        applyBackground();
        buildBgPicker();
      });
      wrap.appendChild(b);
    }
    for (const sp of SPECIAL_BG) {
      if (!sp.when()) continue;
      const b = document.createElement("button");
      b.type = "button";
      b.className = "bg-swatch special" + (state.background === sp.id ? " active" : "");
      b.title = sp.id;
      b.textContent = sp.label;
      b.addEventListener("click", () => {
        state.background = sp.id;
        save();
        applyBackground();
        buildBgPicker();
      });
      wrap.appendChild(b);
    }
  }

  function syncSettings() {
    setName.value = state.name;
    $$('input[name="clockfmt"]').forEach((r) => (r.checked = r.value === state.clockFormat));
    setSeconds.checked = state.showSeconds;
    $$('input[data-widget]').forEach((c) => (c.checked = !!state.widgets[c.dataset.widget]));
    setWork.value = state.pomodoro.work;
    setShort.value = state.pomodoro.short;
    setLong.value = state.pomodoro.long;
    setAutostart.checked = state.pomodoro.autostart;
    setSound.checked = state.pomodoro.sound;
    setQuotes.value = (state.customQuotes || []).map((q) => q.author ? `${q.text} — ${q.author}` : q.text).join("\n");
    setBgBlur.value = state.bgFx.blur || 0;
    setBgDim.value = state.bgFx.dim ?? 45;
    setBgGray.value = state.bgFx.grayscale || 0;
    $("#bg-blur-v").textContent = setBgBlur.value;
    $("#bg-dim-v").textContent = setBgDim.value;
    $("#bg-gray-v").textContent = setBgGray.value;
    setBgYt.value = state.bgYouTube || "";
    buildBgPicker();
  }

  setName.addEventListener("input", () => { state.name = setName.value; save(); tick(); });
  $$('input[name="clockfmt"]').forEach((r) =>
    r.addEventListener("change", () => { if (r.checked) { state.clockFormat = r.value; save(); tick(); } }));
  setSeconds.addEventListener("change", () => { state.showSeconds = setSeconds.checked; save(); tick(); });
  $$('input[data-widget]').forEach((c) =>
    c.addEventListener("change", () => { state.widgets[c.dataset.widget] = c.checked; save(); applyWidgets(); }));

  function readDurations() {
    state.pomodoro.work = clamp(+setWork.value || 25, 1, 120);
    state.pomodoro.short = clamp(+setShort.value || 5, 1, 60);
    state.pomodoro.long = clamp(+setLong.value || 15, 1, 90);
    save();
    if (!running) { remaining = phaseSeconds(phase); renderPomo(); }
  }
  [setWork, setShort, setLong].forEach((el) => el.addEventListener("change", readDurations));
  setAutostart.addEventListener("change", () => { state.pomodoro.autostart = setAutostart.checked; save(); });
  setSound.addEventListener("change", () => {
    state.pomodoro.sound = setSound.checked;
    save();
    if (setSound.checked && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  });

  setQuotes.addEventListener("change", () => {
    state.customQuotes = setQuotes.value
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const m = line.split(/\s+[—-]\s+/);
        if (m.length > 1) return { text: m.slice(0, -1).join(" - ").trim(), author: m[m.length - 1].trim() };
        return { text: line, author: "" };
      });
    save();
  });

  // ---- Settings: background media + effects ------------------
  function bindBgSlider(el, valEl, key) {
    el.addEventListener("input", () => {
      state.bgFx[key] = +el.value;
      if (valEl) valEl.textContent = el.value;
      save();
      applyBgFx();
    });
  }
  bindBgSlider(setBgBlur, $("#bg-blur-v"), "blur");
  bindBgSlider(setBgDim, $("#bg-dim-v"), "dim");
  bindBgSlider(setBgGray, $("#bg-gray-v"), "grayscale");

  $("#set-bg-image").addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 20 * 1048576 && !confirm(`That image is large (${mb(file.size)}). Store it in this browser anyway?`)) return;
    try {
      await idb.set("bg-image", file);
      state.hasBgImage = true;
      state.background = "image";
      save();
      applyBackground();
      buildBgPicker();
    } catch {
      alert("Couldn't store that image — your browser may be out of storage space.");
    }
  });

  $("#set-bg-video").addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 100 * 1048576 && !confirm(`That video is large (${mb(file.size)}). Store it in this browser anyway?`)) return;
    try {
      await idb.set("bg-video", file);
      state.hasBgVideo = true;
      state.background = "video";
      save();
      applyBackground();
      buildBgPicker();
    } catch {
      alert("Couldn't store that video — your browser may be out of storage space.");
    }
  });

  $("#set-bg-yt-go").addEventListener("click", () => {
    const yid = parseYouTubeId(setBgYt.value);
    if (!yid) { alert("Couldn't find a YouTube video ID in that link."); return; }
    state.bgYouTube = yid;
    state.background = "youtube";
    save();
    applyBackground();
    buildBgPicker();
  });
  setBgYt.addEventListener("keydown", (e) => { if (e.key === "Enter") $("#set-bg-yt-go").click(); });

  $("#set-bg-clear").addEventListener("click", async () => {
    await idb.del("bg-image");
    await idb.del("bg-video");
    state.hasBgImage = false;
    state.hasBgVideo = false;
    if (state.background === "image" || state.background === "video") state.background = "auto";
    save();
    applyBackground();
    buildBgPicker();
  });

  $("#set-edit-layout").addEventListener("click", () => { drawer.hidden = true; setEdit(true); });
  $("#set-reset-layout").addEventListener("click", resetLayout);

  $("#reset-all").addEventListener("click", async () => {
    if (!confirm("Reset everything? Tasks, notes, layout and settings will be erased.")) return;
    try { await idb.del("bg-image"); await idb.del("bg-video"); } catch {}
    localStorage.removeItem(KEY);
    location.reload();
  });

  // ---- Boot -----------------------------------------------------
  applyLayout();
  applyBackground();
  applyWidgets();
  ensureDailyQuote();
  renderTasks();
  renderCount();
  setPhase("work", false);
  tick();
  setInterval(tick, 1000);
  // refresh auto background + daily quote roll-over every 5 min
  setInterval(() => {
    if (state.background === "auto") applyBackground();
    ensureDailyQuote();
  }, 300000);

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
})();
