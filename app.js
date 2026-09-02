/* Flow — a local-only focus dashboard. No accounts, no network. */
(() => {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const pad = (n) => String(n).padStart(2, "0");
  const todayKey = () => {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
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
  function deepMerge(base, extra) {
    for (const k of Object.keys(extra || {})) {
      if (extra[k] && typeof extra[k] === "object" && !Array.isArray(extra[k]) && typeof base[k] === "object") {
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
  function applyBackground() {
    const id = state.background;
    const css = id === "auto" ? autoBackground() : (BACKGROUNDS[id] || autoBackground());
    $("#bg").style.background = css;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", "#0f1220");
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

  // ---- Settings drawer ---------------------------------------
  const drawer = $("#settings");
  $("#open-settings").addEventListener("click", () => { drawer.hidden = false; syncSettings(); });
  $("#close-settings").addEventListener("click", () => (drawer.hidden = true));
  drawer.addEventListener("click", (e) => { if (e.target === drawer) drawer.hidden = true; });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") drawer.hidden = true; });

  const setName = $("#set-name");
  const setSeconds = $("#set-seconds");
  const setWork = $("#set-work");
  const setShort = $("#set-short");
  const setLong = $("#set-long");
  const setAutostart = $("#set-autostart");
  const setSound = $("#set-sound");
  const setQuotes = $("#set-quotes");

  function buildBgPicker() {
    const wrap = $("#bg-picker");
    wrap.innerHTML = "";
    for (const id of BG_ORDER) {
      const b = document.createElement("button");
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
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
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

  $("#reset-all").addEventListener("click", () => {
    if (!confirm("Reset everything? Tasks, notes and settings will be erased.")) return;
    localStorage.removeItem(KEY);
    location.reload();
  });

  // ---- Boot -----------------------------------------------------
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
