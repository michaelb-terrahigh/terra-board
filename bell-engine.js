/* Terra Board — bell engine.
 * computeState() is pure (testable without a browser). createEngine() wraps it
 * in a ticker that loads schedule.json and fires the chime callback once per
 * boundary crossing. */
(function (root) {
  "use strict";

  const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const MAX_CHIME_LATENESS_MS = 15000; // never ring a bell that is more than 15 s stale

  function timeToDate(hhmm, base) {
    const parts = hhmm.split(":").map(Number);
    const d = new Date(base);
    d.setHours(parts[0], parts[1], 0, 0);
    return d;
  }

  function blocksForDay(schedule, now) {
    const dayName = DAY_NAMES[now.getDay()];
    const overrides = (schedule.dayOverrides && schedule.dayOverrides[dayName]) || [];
    const blocks = schedule.blocks.slice();
    overrides.forEach(function (ov) {
      const idx = blocks.findIndex(function (b) { return b.label === ov.replaceLabel; });
      if (idx !== -1) blocks.splice.apply(blocks, [idx, 1].concat(ov.with));
    });
    return blocks;
  }

  function buildBlocks(schedule, now) {
    return blocksForDay(schedule, now).map(function (b) {
      return Object.assign({}, b, { startDate: timeToDate(b.start, now), endDate: timeToDate(b.end, now) });
    });
  }

  function fmtClock(d) {
    let h = d.getHours();
    const m = String(d.getMinutes()).padStart(2, "0");
    const ampm = h >= 12 ? "PM" : "AM";
    h = h % 12; if (h === 0) h = 12;
    return h + ":" + m + " " + ampm;
  }

  function fmtCountdown(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    return Math.floor(total / 60) + ":" + String(total % 60).padStart(2, "0");
  }

  /* kinds: weekend | empty | before | prestart | warning | block | gap | after
   * chime=true means entering this state should ring the bell. */
  function computeState(schedule, blocks, now) {
    const day = now.getDay();
    if (day === 0 || day === 6) return { kind: "weekend", key: "weekend", chime: false, label: "No school today" };
    if (!blocks.length) return { kind: "empty", key: "empty", chime: false, label: "No schedule loaded" };

    const cur = blocks.findIndex(function (b) { return now >= b.startDate && now < b.endDate; });
    if (cur !== -1) {
      const b = blocks[cur];
      const total = b.endDate - b.startDate;
      return {
        kind: "block", key: "block::" + cur, chime: true, chimeAt: b.startDate,
        block: b, index: cur, label: b.label, type: b.type,
        remainingMs: b.endDate - now, totalMs: total,
        frac: Math.min(1, Math.max(0, (now - b.startDate) / total)),
        sub: b.type === "transition" ? "until next class" : "remaining",
        next: blocks[cur + 1] || null
      };
    }

    const nextIdx = blocks.findIndex(function (b) { return b.startDate > now; });
    if (nextIdx === -1) {
      return { kind: "after", key: "after", chime: true, chimeAt: blocks[blocks.length - 1].endDate, label: "School day complete" };
    }

    const nextB = blocks[nextIdx];
    if (nextIdx === 0) {
      const preMs = (schedule.preStartMinutes || 0) * 60000;
      const warnMin = schedule.preStartWarningMinutes || 0;
      const warnMs = warnMin * 60000;
      const remaining = nextB.startDate - now;
      if (preMs > 0 && remaining <= preMs) {
        const inWarn = warnMs > 0 && remaining <= warnMs;
        return {
          kind: inWarn ? "warning" : "prestart",
          key: inWarn ? "warning" : "prestart",
          chime: inWarn,
          chimeAt: new Date(nextB.startDate.getTime() - warnMs),
          label: inWarn ? warnMin + "-Minute Warning" : "Before School",
          sub: "until day starts",
          remainingMs: remaining, totalMs: preMs,
          frac: Math.min(1, Math.max(0, (preMs - remaining) / preMs)),
          next: nextB
        };
      }
      return { kind: "before", key: "before", chime: false, label: "Day starts at " + fmtClock(nextB.startDate), next: nextB };
    }

    // A gap between two blocks (only if the schedule has holes in it).
    return { kind: "gap", key: "gap::" + nextIdx, chime: false, label: "Next: " + nextB.label, sub: "until " + fmtClock(nextB.startDate), remainingMs: nextB.startDate - now, next: nextB };
  }

  function createEngine(opts) {
    opts = opts || {};
    const url = opts.url || "schedule.json";
    let schedule = null;
    let blocks = [];
    let dayKey = null;
    let lastKey = null;
    let ticked = false;
    let state = { kind: "empty", label: "Loading schedule…" };
    let loadError = null;
    let onChime = function () {};

    async function load() {
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error("HTTP " + res.status);
        schedule = await res.json();
        dayKey = null; // force rebuild
        loadError = null;
      } catch (e) {
        loadError = e;
        if (!schedule) state = { kind: "empty", label: "Could not load schedule.json" };
      }
    }

    function tick(nowOverride) {
      if (!schedule) return state;
      const now = nowOverride || new Date();
      const dk = now.toDateString();
      if (dk !== dayKey || !blocks.length) { blocks = buildBlocks(schedule, now); dayKey = dk; }
      const st = computeState(schedule, blocks, now);
      st.now = now;
      const fullKey = dk + "::" + st.key;
      if (ticked && st.chime && fullKey !== lastKey && st.chimeAt) {
        const lateness = now - st.chimeAt;
        if (lateness >= 0 && lateness <= MAX_CHIME_LATENESS_MS) onChime(st);
      }
      lastKey = fullKey;
      ticked = true;
      state = st;
      return st;
    }

    return {
      load: load,
      tick: tick,
      getState: function () { return state; },
      getBlocks: function () { return blocks; },
      getSchedule: function () { return schedule; },
      getError: function () { return loadError; },
      setChimeHandler: function (fn) { onChime = fn || function () {}; }
    };
  }

  const api = {
    DAY_NAMES: DAY_NAMES, timeToDate: timeToDate, blocksForDay: blocksForDay, buildBlocks: buildBlocks,
    computeState: computeState, createEngine: createEngine, fmtClock: fmtClock, fmtCountdown: fmtCountdown
  };
  root.TBBell = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
