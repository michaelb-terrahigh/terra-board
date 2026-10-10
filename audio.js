/* Terra Board — audio. One shared AudioContext for the whole board.
 * Browsers only allow audio after a person taps the page, so unlock() must be
 * called from a click/tap handler. */
(function (root) {
  "use strict";

  let ctx = null;
  const state = { unlocked: false, muted: false };

  function unlock() {
    try {
      const AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return false;
      if (!ctx) ctx = new AC();
      if (ctx.state === "suspended") ctx.resume();
      // Near-silent blip fully unlocks audio on iOS-style browsers.
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      g.gain.value = 0.0001;
      osc.connect(g).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.05);
      state.unlocked = true;
      return true;
    } catch (e) {
      state.unlocked = false;
      return false;
    }
  }

  function ready() {
    if (!ctx || !state.unlocked || state.muted) return false;
    if (ctx.state === "suspended") ctx.resume();
    return true;
  }

  function strike(when, freq, length, peak) {
    const o1 = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    const g = ctx.createGain();
    o1.type = "sine"; o2.type = "sine";
    o1.frequency.setValueAtTime(freq, when);
    o2.frequency.setValueAtTime(freq / 2, when);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(peak, when + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, when + length);
    o1.connect(g); o2.connect(g); g.connect(ctx.destination);
    o1.start(when); o2.start(when);
    o1.stop(when + length + 0.05); o2.stop(when + length + 0.05);
  }

  // Two-tone bell, struck twice.
  function chime() {
    if (!ready()) return;
    const t = ctx.currentTime;
    strike(t, 1046.5, 0.5, 0.5);
    strike(t + 0.55, 1046.5, 0.5, 0.5);
  }

  // Timer alarm: three short, higher beeps so it never gets mistaken for the bell.
  function alarm() {
    if (!ready()) return;
    const t = ctx.currentTime;
    strike(t, 1568, 0.22, 0.4);
    strike(t + 0.3, 1568, 0.22, 0.4);
    strike(t + 0.6, 1568, 0.22, 0.4);
  }

  root.TBAudio = {
    unlock: unlock,
    chime: chime,
    alarm: alarm,
    isUnlocked: function () { return state.unlocked; },
    isMuted: function () { return state.muted; },
    setMuted: function (m) { state.muted = !!m; }
  };
})(window);
