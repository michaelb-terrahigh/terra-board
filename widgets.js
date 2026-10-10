/* Terra Board — widgets.
 * Each widget: { title, size:{w,h}, min:{w,h}, settings:[...], create(host, inst, api) }
 * create() returns { tick(now), refresh(), resize(wPx,hPx), destroy() } (all optional).
 * api = { engine, audio, save() }.  inst.settings already has defaults applied. */
(function (root) {
  "use strict";

  const registry = {};
  function register(type, def) { registry[type] = def; }

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function pad2(n) { return String(n).padStart(2, "0"); }
  function fmtMS(ms, showHours) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (showHours && h > 0) return h + ":" + pad2(m) + ":" + pad2(s);
    return Math.floor(total / 60) + ":" + pad2(s);
  }
  function randomInt(n) {
    if (root.crypto && root.crypto.getRandomValues) {
      const a = new Uint32Array(1);
      root.crypto.getRandomValues(a);
      return a[0] % n;
    }
    return Math.floor(Math.random() * n);
  }

  /* ───────────── Bell schedule ───────────── */
  register("bell", {
    title: "Bell schedule",
    size: { w: 12, h: 10 }, min: { w: 5, h: 5 },
    settings: [],
    create: function (host, inst, api) {
      const R = 135, C = 2 * Math.PI * R;
      host.classList.add("w-bell");
      host.innerHTML =
        '<div class="bell-stage">' +
        '<svg class="bell-ring" viewBox="0 0 300 300" aria-hidden="true">' +
        '<circle class="ring-track" cx="150" cy="150" r="135"></circle>' +
        '<circle class="ring-progress idle" cx="150" cy="150" r="135"></circle></svg>' +
        '<div class="bell-center"><div class="bell-label"></div><div class="bell-count">--:--</div><div class="bell-sub"></div></div>' +
        '</div><div class="bell-next"></div>' +
        '<div class="bell-list" hidden><ol></ol></div>';

      const ring = host.querySelector(".ring-progress");
      const label = host.querySelector(".bell-label");
      const count = host.querySelector(".bell-count");
      const sub = host.querySelector(".bell-sub");
      const next = host.querySelector(".bell-next");
      const listWrap = host.querySelector(".bell-list");
      const listOl = listWrap.querySelector("ol");
      ring.style.strokeDasharray = String(C);
      let listOpen = false;

      host.setAttribute("title", "Tap to show or hide the full schedule");
      host.addEventListener("click", function () {
        if (host.closest(".editing")) return;
        listOpen = !listOpen;
        listWrap.hidden = !listOpen;
        host.classList.toggle("showing-list", listOpen);
        if (listOpen) renderList(new Date());
      });

      function renderList(now) {
        const st = api.engine.getState();
        const blocks = api.engine.getBlocks();
        listOl.textContent = "";
        blocks.forEach(function (b, i) {
          const li = el("li", st.kind === "block" && st.index === i ? "current" : "");
          li.appendChild(el("span", "", b.label));
          li.appendChild(el("span", "", TBBell.fmtClock(b.startDate) + " – " + TBBell.fmtClock(b.endDate)));
          listOl.appendChild(li);
        });
      }

      function setNext(prefix, b) {
        next.textContent = "";
        if (!b) { next.textContent = prefix; return; }
        next.appendChild(document.createTextNode(prefix + " "));
        next.appendChild(el("b", "", b.label));
        next.appendChild(document.createTextNode(" at " + TBBell.fmtClock(b.startDate)));
      }

      return {
        tick: function (now) {
          const st = api.engine.getState();
          let ringClass = "idle", frac = 0;
          label.textContent = st.label || "";
          next.textContent = "";
          switch (st.kind) {
            case "block":
              count.textContent = TBBell.fmtCountdown(st.remainingMs);
              sub.textContent = st.sub;
              ringClass = st.type === "transition" ? "transition" : st.type === "lunch" ? "lunch" : "";
              frac = st.frac;
              if (st.next) setNext("Next:", st.next); else next.textContent = "Last block of the day";
              break;
            case "prestart":
            case "warning":
              count.textContent = TBBell.fmtCountdown(st.remainingMs);
              sub.textContent = st.sub;
              ringClass = st.kind === "warning" ? "transition" : "prestart";
              frac = st.frac;
              setNext("Next:", st.next);
              break;
            case "gap":
              count.textContent = TBBell.fmtCountdown(st.remainingMs);
              sub.textContent = st.sub;
              ringClass = "transition";
              break;
            default:
              count.textContent = "--:--";
              sub.textContent = "";
          }
          ring.setAttribute("class", "ring-progress " + ringClass);
          ring.style.strokeDashoffset = String(C * (1 - frac));
          if (listOpen) renderList(now);
        }
      };
    }
  });

  /* ───────────── Clock ───────────── */
  register("clock", {
    title: "Clock",
    size: { w: 7, h: 4 }, min: { w: 3, h: 2 },
    settings: [
      { key: "hour12", label: "12-hour time", type: "bool", def: true },
      { key: "seconds", label: "Show seconds", type: "bool", def: false }
    ],
    create: function (host, inst) {
      host.classList.add("w-clock");
      const wrap = el("div", "clock-time");
      const t = el("span", "clock-digits");
      const ap = el("span", "clock-ampm");
      wrap.appendChild(t); wrap.appendChild(ap);
      host.appendChild(wrap);
      let last = "";
      function draw(now) {
        const s = inst.settings;
        wrap.classList.toggle("sec", !!s.seconds);
        let h = now.getHours();
        let suffix = "";
        if (s.hour12) { suffix = h >= 12 ? "PM" : "AM"; h = h % 12; if (h === 0) h = 12; }
        const txt = (s.hour12 ? String(h) : pad2(h)) + ":" + pad2(now.getMinutes()) + (s.seconds ? ":" + pad2(now.getSeconds()) : "");
        const key = txt + suffix;
        if (key === last) return;
        last = key;
        t.textContent = txt; ap.textContent = suffix;
      }
      return { tick: draw, refresh: function () { last = ""; draw(new Date()); } };
    }
  });

  /* ───────────── Date ───────────── */
  register("date", {
    title: "Date",
    size: { w: 5, h: 4 }, min: { w: 3, h: 2 },
    settings: [],
    create: function (host) {
      host.classList.add("w-date");
      const dow = el("div", "date-dow");
      const md = el("div", "date-md");
      host.appendChild(dow); host.appendChild(md);
      let last = "";
      return {
        tick: function (now) {
          const key = now.toDateString();
          if (key === last) return;
          last = key;
          dow.textContent = now.toLocaleDateString(undefined, { weekday: "long" });
          md.textContent = now.toLocaleDateString(undefined, { month: "long", day: "numeric" });
        }
      };
    }
  });

  /* ───────────── Timer ───────────── */
  register("timer", {
    title: "Timer",
    size: { w: 7, h: 6 }, min: { w: 4, h: 4 },
    settings: [],
    defaults: { seconds: 300 },
    create: function (host, inst, api) {
      host.classList.add("w-timer");
      host.innerHTML =
        '<div class="timer-bar"><div class="timer-fill"></div></div>' +
        '<div class="timer-digits">5:00</div>' +
        '<div class="timer-adjust">' +
        '<button type="button" data-d="-60">\u22121 min</button><button type="button" data-d="-10">\u221210 s</button>' +
        '<button type="button" data-d="10">+10 s</button><button type="button" data-d="60">+1 min</button></div>' +
        '<div class="timer-actions"><button type="button" class="primary t-start">Start</button><button type="button" class="t-reset">Reset</button></div>';
      const digits = host.querySelector(".timer-digits");
      const fill = host.querySelector(".timer-fill");
      const startBtn = host.querySelector(".t-start");
      const resetBtn = host.querySelector(".t-reset");
      const adjust = host.querySelector(".timer-adjust");
      const s = inst.settings;
      let remaining = s.seconds * 1000, running = false, endAt = 0, done = false, alarmTimers = [];

      function clearAlarm() { alarmTimers.forEach(clearTimeout); alarmTimers = []; }
      function render() {
        digits.textContent = fmtMS(remaining, true);
        fill.style.width = (s.seconds ? Math.max(0, Math.min(100, remaining / (s.seconds * 10))) : 0) + "%";
        startBtn.textContent = running ? "Pause" : (done ? "Restart" : "Start");
        host.classList.toggle("done", done);
        host.classList.toggle("running", running);
        adjust.querySelectorAll("button").forEach(function (b) { b.disabled = running; });
      }
      function reset() { clearAlarm(); running = false; done = false; remaining = s.seconds * 1000; render(); }

      adjust.addEventListener("click", function (e) {
        const b = e.target.closest("button"); if (!b || running) return;
        s.seconds = Math.max(10, Math.min(99 * 60, s.seconds + Number(b.dataset.d)));
        done = false; clearAlarm();
        remaining = s.seconds * 1000;
        api.save(); render();
      });
      startBtn.addEventListener("click", function () {
        if (running) { remaining = Math.max(0, endAt - Date.now()); running = false; }
        else {
          if (done) reset();
          if (remaining <= 0) remaining = s.seconds * 1000;
          endAt = Date.now() + remaining; running = true;
        }
        render();
      });
      resetBtn.addEventListener("click", reset);
      render();

      return {
        tick: function () {
          if (!running) return;
          remaining = Math.max(0, endAt - Date.now());
          if (remaining <= 0) {
            running = false; done = true;
            api.audio.alarm();
            alarmTimers.push(setTimeout(api.audio.alarm, 3500), setTimeout(api.audio.alarm, 7000));
          }
          render();
        },
        destroy: clearAlarm
      };
    }
  });

  /* ───────────── Stopwatch ───────────── */
  register("stopwatch", {
    title: "Stopwatch",
    size: { w: 6, h: 5 }, min: { w: 4, h: 3 },
    settings: [],
    create: function (host) {
      host.classList.add("w-stopwatch");
      host.innerHTML =
        '<div class="sw-digits">0:00</div>' +
        '<div class="timer-actions"><button type="button" class="primary sw-start">Start</button><button type="button" class="sw-reset">Reset</button></div>';
      const digits = host.querySelector(".sw-digits");
      const startBtn = host.querySelector(".sw-start");
      const resetBtn = host.querySelector(".sw-reset");
      let elapsed = 0, running = false, startedAt = 0;
      function current() { return running ? elapsed + (Date.now() - startedAt) : elapsed; }
      function render() {
        digits.textContent = fmtMS(Math.floor(current() / 1000) * 1000, true);
        startBtn.textContent = running ? "Stop" : (elapsed > 0 ? "Resume" : "Start");
        host.classList.toggle("running", running);
      }
      startBtn.addEventListener("click", function () {
        if (running) { elapsed += Date.now() - startedAt; running = false; }
        else { startedAt = Date.now(); running = true; }
        render();
      });
      resetBtn.addEventListener("click", function () { elapsed = 0; running = false; render(); });
      render();
      return { tick: function () { if (running) render(); } };
    }
  });

  /* ───────────── Notepad ───────────── */
  register("notepad", {
    title: "Notepad",
    size: { w: 12, h: 4 }, min: { w: 3, h: 2 },
    settings: [
      { key: "scale", label: "Text size", type: "select", def: "M",
        options: [["S", "Small"], ["M", "Medium"], ["L", "Large"], ["XL", "Extra large"]] }
    ],
    defaults: { text: "" },
    create: function (host, inst, api) {
      host.classList.add("w-notepad");
      const ta = el("textarea", "np-text");
      ta.placeholder = "Write on the board\u2026";
      ta.value = inst.settings.text || "";
      ta.setAttribute("aria-label", "Notepad");
      host.appendChild(ta);
      let timer = null;
      ta.addEventListener("input", function () {
        clearTimeout(timer);
        timer = setTimeout(function () { inst.settings.text = ta.value; api.save(); }, 300);
      });
      ta.addEventListener("blur", function () { clearTimeout(timer); inst.settings.text = ta.value; api.save(); });
      function refresh() { host.dataset.scale = inst.settings.scale; }
      refresh();
      return { refresh: refresh, destroy: function () { clearTimeout(timer); } };
    }
  });

  /* ───────────── Traffic light ───────────── */
  register("traffic", {
    title: "Traffic light",
    size: { w: 5, h: 6 }, min: { w: 2, h: 3 },
    settings: [],
    defaults: { on: "" },
    create: function (host, inst, api) {
      host.classList.add("w-traffic");
      const lamps = [["red", "Red: stop"], ["yellow", "Yellow: get ready"], ["green", "Green: go"]];
      const box = el("div", "tl");
      const buttons = lamps.map(function (l) {
        const b = el("button", "lamp " + l[0]);
        b.type = "button";
        b.setAttribute("aria-label", l[1]);
        b.addEventListener("click", function () {
          inst.settings.on = inst.settings.on === l[0] ? "" : l[0];
          api.save(); render();
        });
        box.appendChild(b);
        return b;
      });
      host.appendChild(box);
      function render() {
        buttons.forEach(function (b, i) {
          const on = inst.settings.on === lamps[i][0];
          b.classList.toggle("lit", on);
          b.setAttribute("aria-pressed", String(on));
        });
        box.classList.toggle("any-lit", !!inst.settings.on);
      }
      render();
      return { resize: function (w, h) { host.classList.toggle("wide", w > h * 1.5); } };
    }
  });

  /* ───────────── Work symbols ───────────── */
  const SYMBOLS = [
    { id: "silent", name: "Silent", hint: "No talking. Work on your own.", color: "#C8574F" },
    { id: "whisper", name: "Whisper", hint: "Quiet voices, only to your partner.", color: "#D4A855" },
    { id: "partner", name: "Partner talk", hint: "Talk with the person next to you.", color: "#6C93A6" },
    { id: "group", name: "Group work", hint: "Talk with your group.", color: "#8FA998" },
    { id: "discuss", name: "Class discussion", hint: "One voice at a time.", color: "#9B86BD" },
    { id: "hand", name: "Hands up", hint: "Raise your hand and wait to be called on.", color: "#E08D3C" }
  ];
  register("symbols", {
    title: "Work symbols",
    size: { w: 12, h: 4 }, min: { w: 4, h: 3 },
    settings: [],
    defaults: { pick: "silent" },
    create: function (host, inst, api) {
      host.classList.add("w-symbols");
      const main = el("div", "ws-main");
      const name = el("div", "ws-name");
      const hint = el("div", "ws-hint");
      main.appendChild(name); main.appendChild(hint);
      const chips = el("div", "ws-chips");
      const btns = SYMBOLS.map(function (sym) {
        const b = el("button", "ws-chip", sym.name);
        b.type = "button";
        const dot = el("i", "ws-dot"); dot.style.background = sym.color;
        b.insertBefore(dot, b.firstChild);
        b.addEventListener("click", function () { inst.settings.pick = sym.id; api.save(); render(); });
        chips.appendChild(b);
        return b;
      });
      host.appendChild(main); host.appendChild(chips);
      function render() {
        const cur = SYMBOLS.find(function (s) { return s.id === inst.settings.pick; }) || SYMBOLS[0];
        name.textContent = cur.name;
        hint.textContent = cur.hint;
        main.style.setProperty("--sym", cur.color);
        btns.forEach(function (b, i) { b.classList.toggle("on", SYMBOLS[i].id === cur.id); b.setAttribute("aria-pressed", String(SYMBOLS[i].id === cur.id)); });
      }
      render();
      return {};
    }
  });

  /* ───────────── Name picker ───────────── */
  register("picker", {
    title: "Name picker",
    size: { w: 8, h: 6 }, min: { w: 4, h: 4 },
    settings: [],
    defaults: { names: "", picked: [], noRepeat: true },
    create: function (host, inst, api) {
      host.classList.add("w-picker");
      host.innerHTML =
        '<div class="np-view"><div class="np-name">Ready</div><div class="np-meta"></div></div>' +
        '<div class="np-edit" hidden><textarea placeholder="One name per line"></textarea>' +
        '<div class="np-privacy">Names are saved only in this browser. They are never uploaded.</div></div>' +
        '<div class="np-actions"><button type="button" class="primary np-pick">Pick</button>' +
        '<button type="button" class="np-toggle">Edit list</button><button type="button" class="np-reset">Reset</button></div>' +
        '<label class="np-opt"><input type="checkbox" class="np-norepeat"> Don\u2019t repeat names</label>';
      const nameEl = host.querySelector(".np-name");
      const meta = host.querySelector(".np-meta");
      const view = host.querySelector(".np-view");
      const edit = host.querySelector(".np-edit");
      const ta = edit.querySelector("textarea");
      const pickBtn = host.querySelector(".np-pick");
      const toggleBtn = host.querySelector(".np-toggle");
      const resetBtn = host.querySelector(".np-reset");
      const norep = host.querySelector(".np-norepeat");
      const s = inst.settings;
      let editing = !s.names.trim();
      let busy = false;

      function list() { return s.names.split("\n").map(function (n) { return n.trim(); }).filter(Boolean); }
      function pool() { const l = list(); return s.noRepeat ? l.filter(function (n) { return s.picked.indexOf(n) === -1; }) : l; }
      function render() {
        view.hidden = editing; edit.hidden = !editing;
        toggleBtn.textContent = editing ? "Done" : "Edit list";
        pickBtn.disabled = editing || busy;
        norep.checked = !!s.noRepeat;
        const total = list().length;
        meta.textContent = s.noRepeat ? pool().length + " of " + total + " left" : total + " names";
        if (editing) ta.value = s.names;
      }
      toggleBtn.addEventListener("click", function () {
        if (editing) { s.names = ta.value; s.picked = []; api.save(); nameEl.textContent = "Ready"; }
        editing = !editing; render();
        if (editing) ta.focus();
      });
      resetBtn.addEventListener("click", function () { s.picked = []; nameEl.textContent = "Ready"; api.save(); render(); });
      norep.addEventListener("change", function () { s.noRepeat = norep.checked; api.save(); render(); });
      pickBtn.addEventListener("click", function () {
        const p = pool();
        if (!p.length) { nameEl.textContent = "Everyone has been picked"; return; }
        busy = true; render();
        const winner = p[randomInt(p.length)];
        let step = 0; const steps = 14;
        (function spin() {
          step++;
          nameEl.textContent = step < steps ? p[randomInt(p.length)] : winner;
          host.classList.toggle("spinning", step < steps);
          if (step < steps) { setTimeout(spin, 60 + step * 8); return; }
          if (s.noRepeat) s.picked.push(winner);
          busy = false; api.save(); render();
        })();
      });
      render();
      return {};
    }
  });

  root.TBWidgets = {
    registry: registry,
    types: function () { return Object.keys(registry); },
    get: function (t) { return registry[t]; },
    applyDefaults: function (inst) {
      const def = registry[inst.type];
      inst.settings = inst.settings || {};
      if (!def) return;
      (def.settings || []).forEach(function (f) { if (inst.settings[f.key] === undefined) inst.settings[f.key] = f.def; });
      Object.keys(def.defaults || {}).forEach(function (k) {
        if (inst.settings[k] === undefined) {
          const v = def.defaults[k];
          inst.settings[k] = Array.isArray(v) ? v.slice() : v;
        }
      });
    }
  };
})(window);
