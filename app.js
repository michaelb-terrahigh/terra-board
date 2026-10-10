/* Terra Board — app shell. */
(function () {
  "use strict";

  const COLS = 24, ROWS = 14;
  const KEY = "terraBoard.v1";
  const THEMES = [["forest", "Forest"], ["slate", "Slate"], ["dusk", "Dusk"], ["paper", "Paper"], ["ink", "Black"]];

  const DEFAULT_LAYOUT = [
    { type: "bell",    x: 0,  y: 0,  w: 12, h: 10 },
    { type: "clock",   x: 12, y: 0,  w: 7,  h: 4 },
    { type: "date",    x: 19, y: 0,  w: 5,  h: 4 },
    { type: "timer",   x: 12, y: 4,  w: 7,  h: 6 },
    { type: "traffic", x: 19, y: 4,  w: 5,  h: 6 },
    { type: "notepad", x: 0,  y: 10, w: 12, h: 4 },
    { type: "symbols", x: 12, y: 10, w: 12, h: 4 }
  ];

  const $ = function (s) { return document.querySelector(s); };
  function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function uid() { return "w" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  const board = $("#board");
  const state = { widgets: [], theme: "forest", editing: false, zTop: 1, started: false };
  const runtime = {}; // id -> { inst, wrap, body, impl }

  const engine = TBBell.createEngine({ url: "schedule.json" });
  engine.setChimeHandler(function () { TBAudio.chime(); });

  /* ───────── storage ───────── */
  function loadLayout() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const d = JSON.parse(raw);
      if (d && Array.isArray(d.widgets)) return d;
    } catch (e) { /* fall through to defaults */ }
    return null;
  }
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({
        v: 1, theme: state.theme,
        widgets: state.widgets.map(function (w) { return { id: w.id, type: w.type, x: w.x, y: w.y, w: w.w, h: w.h, z: w.z, settings: w.settings }; })
      }));
    } catch (e) { /* storage full or blocked: the board still works, it just won't remember */ }
  }
  function sanitize(raw) {
    const def = TBWidgets.get(raw.type);
    if (!def) return null;
    const w = clamp(Math.round(Number(raw.w) || def.size.w), def.min.w, COLS);
    const h = clamp(Math.round(Number(raw.h) || def.size.h), def.min.h, ROWS);
    return {
      id: raw.id || uid(), type: raw.type,
      x: clamp(Math.round(Number(raw.x) || 0), 0, COLS - w),
      y: clamp(Math.round(Number(raw.y) || 0), 0, ROWS - h),
      w: w, h: h, z: Number(raw.z) || 1,
      settings: raw.settings && typeof raw.settings === "object" ? raw.settings : {}
    };
  }

  /* ───────── placement ───────── */
  function place(inst, wrap) {
    wrap.style.setProperty("--x", inst.x);
    wrap.style.setProperty("--y", inst.y);
    wrap.style.setProperty("--w", inst.w);
    wrap.style.setProperty("--h", inst.h);
    wrap.style.zIndex = inst.z;
  }
  function sortDom() {
    state.widgets.slice().sort(function (a, b) { return a.y - b.y || a.x - b.x; })
      .forEach(function (i) { if (runtime[i.id]) board.appendChild(runtime[i.id].wrap); });
  }
  function overlaps(a, b) { return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h; }
  // Looks for an empty spot at the widget's normal size, then at its minimum size.
  // If the board is completely full, the widget goes in the middle (on top of others),
  // where it is easy to see and drag away.
  function findFreeSpot(def) {
    const sizes = [def.size, def.min];
    for (let s = 0; s < sizes.length; s++) {
      const w = sizes[s].w, h = sizes[s].h;
      for (let y = 0; y <= ROWS - h; y++) {
        for (let x = 0; x <= COLS - w; x++) {
          const cand = { x: x, y: y, w: w, h: h };
          if (!state.widgets.some(function (o) { return overlaps(cand, o); })) return cand;
        }
      }
    }
    return { x: Math.floor((COLS - def.size.w) / 2), y: Math.floor((ROWS - def.size.h) / 2), w: def.size.w, h: def.size.h };
  }

  /* ───────── widget mounting ───────── */
  const sizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(function (entries) {
    entries.forEach(function (entry) {
      const body = entry.target;
      const r = entry.contentRect;
      body.style.setProperty("--uw", r.width / 100 + "px");
      body.style.setProperty("--uh", r.height / 100 + "px");
      body.style.setProperty("--u", Math.min(r.width, r.height) / 100 + "px");
      const rt = runtime[body.dataset.id];
      if (rt && rt.impl && rt.impl.resize) rt.impl.resize(r.width, r.height);
    });
  }) : null;

  function mount(inst) {
    const def = TBWidgets.get(inst.type);
    if (!def) return;
    TBWidgets.applyDefaults(inst);

    const wrap = el("div", "widget");
    wrap.dataset.id = inst.id; wrap.dataset.type = inst.type;
    const card = el("div", "card");
    const body = el("div", "widget-body");
    body.dataset.id = inst.id;
    card.appendChild(body);
    card.appendChild(buildOverlay(inst, def, wrap));
    wrap.appendChild(card);
    board.appendChild(wrap);
    place(inst, wrap);

    const impl = def.create(body, inst, { engine: engine, audio: TBAudio, save: save }) || {};
    runtime[inst.id] = { inst: inst, wrap: wrap, body: body, impl: impl };
    if (impl.refresh) impl.refresh();
    if (sizeObserver) sizeObserver.observe(body);
  }

  function unmount(id) {
    const rt = runtime[id];
    if (!rt) return;
    if (sizeObserver) sizeObserver.unobserve(rt.body);
    if (rt.impl && rt.impl.destroy) rt.impl.destroy();
    rt.wrap.remove();
    delete runtime[id];
  }

  function buildOverlay(inst, def, wrap) {
    const ov = el("div", "edit-overlay");
    ov.appendChild(el("div", "eo-title", def.title));
    const actions = el("div", "eo-actions");
    if (def.settings && def.settings.length) {
      const gear = el("button", "eo-btn", "Settings");
      gear.type = "button";
      gear.addEventListener("click", function () { openSettings(inst, def); });
      actions.appendChild(gear);
    }
    const del = el("button", "eo-btn danger", "Remove");
    del.type = "button";
    del.addEventListener("click", function () {
      if (!window.confirm("Remove this " + def.title.toLowerCase() + " widget from the board?")) return;
      state.widgets = state.widgets.filter(function (w) { return w.id !== inst.id; });
      unmount(inst.id); save();
    });
    actions.appendChild(del);
    ov.appendChild(actions);
    ov.appendChild(el("div", "resize-handle"));

    ov.addEventListener("pointerdown", function (e) {
      if (e.target.closest("button") || document.body.classList.contains("stacked")) return;
      beginDrag(e, inst, def, wrap, e.target.closest(".resize-handle") ? "resize" : "move", ov);
    });
    return ov;
  }

  function beginDrag(e, inst, def, wrap, mode, target) {
    e.preventDefault();
    const rect = board.getBoundingClientRect();
    const cw = rect.width / COLS, ch = rect.height / ROWS;
    const start = { px: e.clientX, py: e.clientY, x: inst.x, y: inst.y, w: inst.w, h: inst.h };
    inst.z = ++state.zTop;
    wrap.classList.add("dragging");
    try { target.setPointerCapture(e.pointerId); } catch (err) { /* older browsers */ }

    function move(ev) {
      const dx = Math.round((ev.clientX - start.px) / cw);
      const dy = Math.round((ev.clientY - start.py) / ch);
      if (mode === "move") {
        inst.x = clamp(start.x + dx, 0, COLS - inst.w);
        inst.y = clamp(start.y + dy, 0, ROWS - inst.h);
      } else {
        inst.w = clamp(start.w + dx, def.min.w, COLS - inst.x);
        inst.h = clamp(start.h + dy, def.min.h, ROWS - inst.y);
      }
      place(inst, wrap);
    }
    function up() {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      target.removeEventListener("pointercancel", up);
      wrap.classList.remove("dragging");
      save(); sortDom();
    }
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
    target.addEventListener("pointercancel", up);
  }

  /* ───────── modals ───────── */
  function openModal(title, content) {
    closeModal();
    const back = el("div", "modal-back");
    back.id = "modal";
    const panel = el("div", "modal");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", title);
    const head = el("div", "modal-head");
    head.appendChild(el("h2", "", title));
    const close = el("button", "tb-btn", "Close");
    close.type = "button";
    close.addEventListener("click", closeModal);
    head.appendChild(close);
    panel.appendChild(head);
    panel.appendChild(content);
    back.appendChild(panel);
    back.addEventListener("pointerdown", function (e) { if (e.target === back) closeModal(); });
    document.body.appendChild(back);
    close.focus();
  }
  function closeModal() { const m = $("#modal"); if (m) m.remove(); }
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeModal(); });

  function openAddMenu() {
    const list = el("div", "add-list");
    TBWidgets.types().forEach(function (type) {
      const def = TBWidgets.get(type);
      const b = el("button", "add-item", def.title);
      b.type = "button";
      b.addEventListener("click", function () {
        const spot = findFreeSpot(def);
        const inst = sanitize({ type: type, x: spot.x, y: spot.y, w: spot.w, h: spot.h, z: ++state.zTop });
        state.widgets.push(inst);
        mount(inst); sortDom(); save(); closeModal();
      });
      list.appendChild(b);
    });
    openModal("Add a widget", list);
  }

  function openSettings(inst, def) {
    const form = el("div", "settings-form");
    def.settings.forEach(function (f) {
      const row = el("label", "settings-row");
      row.appendChild(el("span", "", f.label));
      let input;
      if (f.type === "bool") {
        input = el("input"); input.type = "checkbox"; input.checked = !!inst.settings[f.key];
        input.addEventListener("change", function () { apply(f.key, input.checked); });
      } else {
        input = el("select");
        f.options.forEach(function (o) {
          const opt = el("option", "", o[1]); opt.value = o[0];
          if (inst.settings[f.key] === o[0]) opt.selected = true;
          input.appendChild(opt);
        });
        input.addEventListener("change", function () { apply(f.key, input.value); });
      }
      row.appendChild(input);
      form.appendChild(row);
    });
    function apply(key, val) {
      inst.settings[key] = val; save();
      const rt = runtime[inst.id];
      if (rt && rt.impl && rt.impl.refresh) rt.impl.refresh();
    }
    openModal(def.title + " settings", form);
  }

  /* ───────── toolbar ───────── */
  const tb = {
    edit: $("#tb-edit"), add: $("#tb-add"), theme: $("#tb-theme"), sound: $("#tb-sound"),
    test: $("#tb-test"), full: $("#tb-full"), reset: $("#tb-reset"), hint: $("#tb-hint"), bar: $("#toolbar")
  };

  function setTheme(id) {
    state.theme = id;
    document.body.dataset.theme = id;
    const name = THEMES.find(function (t) { return t[0] === id; });
    tb.theme.textContent = "Theme: " + (name ? name[1] : id);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", getComputedStyle(document.body).backgroundColor);
  }
  tb.theme.addEventListener("click", function () {
    const i = THEMES.findIndex(function (t) { return t[0] === state.theme; });
    setTheme(THEMES[(i + 1) % THEMES.length][0]); save();
  });

  // While editing, the toolbar stays on screen, so the board shrinks to sit above it.
  // The toolbar's height is measured, not guessed, because it wraps on narrow screens.
  function syncBoardInset() {
    const stacked = document.body.classList.contains("stacked");
    board.style.bottom = state.editing && !stacked ? tb.bar.offsetHeight + 24 + "px" : "";
  }
  function setEditing(on) {
    state.editing = on;
    document.body.classList.toggle("editing", on);
    tb.edit.textContent = on ? "Done editing" : "Edit layout";
    tb.edit.setAttribute("aria-pressed", String(on));
    syncBoardInset();
    showToolbar();
  }
  window.addEventListener("resize", syncBoardInset);
  tb.edit.addEventListener("click", function () { setEditing(!state.editing); });
  tb.add.addEventListener("click", openAddMenu);

  function renderSound() {
    const muted = TBAudio.isMuted() || !TBAudio.isUnlocked();
    tb.sound.textContent = muted ? "Sound: off" : "Sound: on";
    tb.sound.setAttribute("aria-pressed", String(!muted));
  }
  tb.sound.addEventListener("click", function () {
    if (!TBAudio.isUnlocked()) { TBAudio.unlock(); TBAudio.setMuted(false); }
    else TBAudio.setMuted(!TBAudio.isMuted());
    renderSound();
  });
  tb.test.addEventListener("click", function () {
    if (!TBAudio.isUnlocked()) { TBAudio.unlock(); TBAudio.setMuted(false); renderSound(); }
    TBAudio.chime();
  });

  const fsEl = document.documentElement;
  const fsOK = !!(fsEl.requestFullscreen || fsEl.webkitRequestFullscreen);
  if (!fsOK) tb.full.hidden = true;
  tb.full.addEventListener("click", function () {
    const inFs = document.fullscreenElement || document.webkitFullscreenElement;
    if (inFs) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else (fsEl.requestFullscreen || fsEl.webkitRequestFullscreen).call(fsEl);
  });

  tb.reset.addEventListener("click", function () {
    if (!window.confirm("Reset the board to the default layout? Notes and picker names on the board will be cleared.")) return;
    Object.keys(runtime).forEach(unmount);
    state.widgets = DEFAULT_LAYOUT.map(function (d) { return sanitize(Object.assign({ id: uid() }, d)); });
    state.widgets.forEach(mount); sortDom(); save();
  });

  // Toolbar fades out when the board is idle so the room sees only the board.
  let fadeTimer = null;
  function showToolbar() {
    tb.bar.classList.remove("faded");
    clearTimeout(fadeTimer);
    fadeTimer = setTimeout(function () {
      if (!state.editing && !$("#modal")) tb.bar.classList.add("faded");
    }, 4000);
  }
  ["pointermove", "pointerdown", "keydown", "touchstart"].forEach(function (ev) {
    document.addEventListener(ev, showToolbar, { passive: true });
  });

  // A faded toolbar sits invisibly on top of the bottom row of widgets. A tap there
  // should only wake the toolbar — not also press a widget the person can't see is
  // being touched. Taps anywhere else go straight through to the widgets.
  let swallowClick = false;
  function inToolbarArea(e) {
    const r = tb.bar.getBoundingClientRect();
    return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  }
  document.addEventListener("pointerdown", function (e) {
    if (tb.bar.classList.contains("faded") && inToolbarArea(e)) {
      swallowClick = true;
      showToolbar();
      e.preventDefault();
      e.stopPropagation();
      setTimeout(function () { swallowClick = false; }, 600);
    }
  }, true);
  document.addEventListener("click", function (e) {
    if (swallowClick) { swallowClick = false; e.preventDefault(); e.stopPropagation(); }
  }, true);

  /* ───────── responsive: stacked mode on narrow screens ───────── */
  const mq = window.matchMedia("(max-width: 719px)");
  function applyStacked() { document.body.classList.toggle("stacked", mq.matches); syncBoardInset(); }
  applyStacked();
  if (mq.addEventListener) mq.addEventListener("change", applyStacked); else if (mq.addListener) mq.addListener(applyStacked);

  /* ───────── keep the screen awake (best effort) ───────── */
  let wakeLock = null;
  async function keepAwake() {
    try {
      if ("wakeLock" in navigator) {
        wakeLock = await navigator.wakeLock.request("screen");
        wakeLock.addEventListener("release", function () { wakeLock = null; });
      }
    } catch (e) { wakeLock = null; }
  }
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible" && state.started && !wakeLock) keepAwake();
  });

  /* ───────── start-up ───────── */
  function startBoard(withSound) {
    state.started = true;
    if (withSound) { TBAudio.unlock(); TBAudio.setMuted(false); } else { TBAudio.setMuted(true); }
    $("#unlock").hidden = true;
    renderSound();
    keepAwake();
    showToolbar();
  }
  $("#start-sound").addEventListener("click", function () { startBoard(true); });
  $("#start-silent").addEventListener("click", function () { startBoard(false); });

  function tickAll() {
    const now = new Date();
    try { engine.tick(now); } catch (e) { /* keep the board running */ }
    Object.keys(runtime).forEach(function (id) {
      const impl = runtime[id].impl;
      if (impl && impl.tick) { try { impl.tick(now); } catch (e) { /* one widget must not stop the others */ } }
    });
  }

  (async function init() {
    const saved = loadLayout();
    state.theme = saved && THEMES.some(function (t) { return t[0] === saved.theme; }) ? saved.theme : "forest";
    setTheme(state.theme);
    const source = saved ? saved.widgets : DEFAULT_LAYOUT;
    state.widgets = source.map(sanitize).filter(Boolean);
    state.zTop = state.widgets.reduce(function (m, w) { return Math.max(m, w.z); }, 1);
    state.widgets.forEach(mount);
    sortDom();
    renderSound();

    await engine.load();
    tickAll();
    setInterval(tickAll, 250);
    setInterval(function () { engine.load(); }, 5 * 60 * 1000);

    if ("serviceWorker" in navigator) navigator.serviceWorker.register("service-worker.js").catch(function () {});
    window.TerraBoard = { state: state, runtime: runtime, engine: engine, save: save }; // handy for debugging in the console
  })();
})();
