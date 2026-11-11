/* Radio: an overheard space channel, synthesized live with the Web Audio
   API (no audio files). Off until the visitor presses the button; nothing is
   created before that.

   - Static: band-passed noise that drifts and fades like a distant station,
     crackles from lightning ("sferics"), and the occasional falling whistler.
   - Telemetry: beacon bip-bips and short data bursts.
   Zooming into something in the solar system cues a matching sound, starting
   with a Quindar tone (the beep Apollo-era Mission Control used). */
(() => {
  'use strict';

  const btn = document.querySelector('[data-radio]');
  if (!btn) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) { btn.hidden = true; return; }

  const bars = Array.from(btn.querySelectorAll('.radio__bars i'));
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  let ac = null;
  let master, analyser, band, staticGain, radioIn, pinkBuf, whiteBuf, clickBuf;
  let on = false;
  let timers = [];
  let live = new Set();            // scheduled sources, so stopping the radio silences them
  let meterRaf = 0;
  let suspendTimer = 0;

  /* ---------------- Building blocks ---------------- */

  function noise(seconds, pink) {
    const len = Math.floor(ac.sampleRate * seconds);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (!pink) { d[i] = w; continue; }
      // Paul Kellet's pink-noise filter
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
    return buf;
  }

  function filter(type, freq, q = 0.7) {
    const f = ac.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    return f;
  }
  function gain(v) { const g = ac.createGain(); g.gain.value = v; return g; }

  // Start a source now or later, remember it, and forget it when it ends.
  function play(src, at, until, offset) {
    if (offset != null) src.start(at, offset); else src.start(at);
    if (until != null) src.stop(until);
    live.add(src);
    src.onended = () => live.delete(src);
    return src;
  }

  // Looping noise, starting somewhere random in the buffer so it never sounds identical.
  // `bed` sources are the always-on static and are never stopped.
  function looped(buf, at, until, bed = false) {
    const s = ac.createBufferSource();
    s.buffer = buf; s.loop = true;
    const offset = Math.random() * (buf.duration - 0.1);
    if (bed) { s.start(at, offset); return s; }
    return play(s, at, until, offset);
  }

  function build() {
    ac = new AC();
    const comp = ac.createDynamicsCompressor();
    master = gain(0);
    analyser = ac.createAnalyser();
    analyser.fftSize = 64;
    master.connect(filter('lowpass', 7000)).connect(comp).connect(ac.destination);
    comp.connect(analyser);

    pinkBuf = noise(6, true);
    whiteBuf = noise(3, false);

    // background static
    band = filter('bandpass', 1200, 0.6);
    staticGain = gain(0.32);
    looped(pinkBuf, 0, null, true).connect(band).connect(staticGain).connect(master);
    looped(whiteBuf, 0, null, true).connect(filter('highpass', 4500)).connect(gain(0.022)).connect(master);
    looped(pinkBuf, 0, null, true).connect(filter('lowpass', 220)).connect(gain(0.12)).connect(master);

    // the "radio": every beep goes through a narrow, slightly overdriven
    // voice band, like an old comms loop
    const shaper = ac.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) { const x = (i / 511.5) - 1; curve[i] = Math.tanh(x * 2.2) / Math.tanh(2.2); }
    shaper.curve = curve;
    radioIn = gain(1);
    radioIn.connect(filter('highpass', 320)).connect(filter('lowpass', 2900)).connect(shaper).connect(gain(0.55)).connect(master);

    // short, sharply decaying burst used for every crackle
    const len = Math.floor(ac.sampleRate * 0.03);
    clickBuf = ac.createBuffer(1, len, ac.sampleRate);
    const d = clickBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ac.sampleRate * 0.004));
  }

  const later = (fn, ms) => { timers.push(setTimeout(fn, ms)); };

  /* ---------------- Static ---------------- */

  function drift() {
    if (!on) return;
    const now = ac.currentTime;
    band.frequency.setTargetAtTime(rand(700, 2100), now, 0.5);
    staticGain.gain.setTargetAtTime(Math.random() < 0.12 ? rand(0.06, 0.1) : rand(0.2, 0.4), now, 0.35);
    later(drift, rand(350, 1200));
  }

  function crackle(level, at = ac.currentTime) {
    const s = ac.createBufferSource();
    s.buffer = clickBuf;
    s.playbackRate.value = rand(0.5, 1.7);
    s.connect(filter('highpass', rand(800, 2000))).connect(gain(level)).connect(master);
    play(s, at);
  }

  function sferics() {
    if (!on) return;
    if (Math.random() < 0.2) {
      const n = 3 + Math.floor(Math.random() * 5);
      let at = ac.currentTime;
      for (let i = 0; i < n; i++) { crackle(rand(0.06, 0.24), at); at += rand(0.015, 0.06); }
    } else {
      crackle(rand(0.04, 0.26));
    }
    later(sferics, rand(60, 800));
  }

  // Whistlers: lightning energy bent along Earth's magnetic field, heard as a falling tone.
  function whistler() {
    if (!on) return;
    const now = ac.currentTime;
    const osc = ac.createOscillator();
    const g = gain(0);
    osc.frequency.setValueAtTime(rand(5000, 7000), now);
    osc.frequency.exponentialRampToValueAtTime(rand(600, 900), now + 2.2);
    g.gain.linearRampToValueAtTime(0.025, now + 0.06);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 2.3);
    osc.connect(g).connect(master);
    play(osc, now, now + 2.4);
    later(whistler, rand(9000, 22000));
  }

  /* ---------------- Beeps and telemetry ---------------- */

  function tone(freq, at, dur, level, dest = radioIn, type = 'sine') {
    const osc = ac.createOscillator();
    const g = gain(0);
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(level, at + 0.008);
    g.gain.setValueAtTime(level, at + dur - 0.015);
    g.gain.linearRampToValueAtTime(0, at + dur);
    osc.connect(g).connect(dest);
    play(osc, at, at + dur + 0.05);
  }

  // Quindar tone: 2525 Hz, what Mission Control used to open a transmission.
  const quindarIn = (at) => tone(2525, at, 0.25, 0.22);

  // Beacon: bip-bip-bip
  function bips(at, { n = 2 + Math.floor(Math.random() * 3), freq = rand(900, 1700), level = 0.2, gap = rand(0.12, 0.2) } = {}) {
    for (let i = 0; i < n; i++) tone(freq, at + i * gap, 0.07, level);
    return at + n * gap;
  }

  // Data burst: rapid two-tone keying, like a packet modem
  function dataBurst(at, dur = rand(0.3, 0.8), level = 0.13) {
    const osc = ac.createOscillator();
    const g = gain(0);
    osc.type = 'square';
    const baud = pick([45, 75, 110]);
    const [lo, hi] = pick([[1200, 2200], [1070, 1270], [1600, 2400]]);
    for (let t = 0; t < dur; t += 1 / baud) osc.frequency.setValueAtTime(Math.random() < 0.5 ? lo : hi, at + t);
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(level, at + 0.01);
    g.gain.setValueAtTime(level, at + dur - 0.02);
    g.gain.linearRampToValueAtTime(0, at + dur);
    osc.connect(g).connect(radioIn);
    play(osc, at, at + dur + 0.05);
    return at + dur;
  }

  /* ---------------- Schedulers ---------------- */

  function telemetry() {
    if (!on) return;
    const at = ac.currentTime + 0.05;
    if (Math.random() < 0.7) bips(at, { level: rand(0.1, 0.2) });
    else dataBurst(at, rand(0.3, 0.8), rand(0.07, 0.12));
    later(telemetry, rand(2000, 6000));
  }

  // Engine rumble for the career rocket: low noise that swells, holds, then fades.
  function rumble(at, dur) {
    const s = looped(pinkBuf, at, at + dur);
    const g = gain(0);
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(0.9, at + 0.8);
    g.gain.setValueAtTime(0.9, at + dur * 0.45);
    g.gain.linearRampToValueAtTime(0, at + dur);
    s.connect(filter('lowpass', 180, 0.9)).connect(g).connect(master);
  }

  /* ---------------- Meter ---------------- */

  function meter() {
    if (!on) return;
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);
    const groups = [[1, 3], [3, 6], [6, 11], [11, 20]];
    const full = [250, 235, 215, 190];         // pink noise is heavier in the lows; normalise per bar
    bars.forEach((bar, i) => {
      const [a, b] = groups[i];
      let sum = 0;
      for (let k = a; k < b; k++) sum += data[k];
      const v = Math.max(0, Math.min(1, ((sum / (b - a)) - 90) / (full[i] - 90)));
      bar.style.transform = `scaleY(${(0.2 + v * 0.8).toFixed(2)})`;
    });
    meterRaf = requestAnimationFrame(meter);
  }

  /* ---------------- On / off ---------------- */

  function start() {
    if (!ac) build();
    clearTimeout(suspendTimer);
    ac.resume();
    on = true;
    master.gain.cancelScheduledValues(ac.currentTime);
    master.gain.setTargetAtTime(0.42, ac.currentTime, 0.25);
    drift(); sferics(); telemetry();
    later(whistler, rand(4000, 9000));
    if (!reduce.matches) meter();
    render();
  }

  function stop() {
    on = false;
    timers.forEach(clearTimeout);
    timers = [];
    cancelAnimationFrame(meterRaf);
    bars.forEach((b) => { b.style.transform = ''; });
    if (ac) {
      const now = ac.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setTargetAtTime(0, now, 0.1);
      // cut anything queued up (voices, beeps) once the fade is done
      const queued = Array.from(live);
      suspendTimer = setTimeout(() => {
        queued.forEach((s) => { try { s.stop(); } catch (e) { /* already stopped */ } });
        if (!on) ac.suspend();
      }, 600);
    }
    render();
  }

  function render() {
    btn.setAttribute('aria-pressed', String(on));
    btn.title = on ? 'Stop the radio' : 'Play the radio';
  }

  btn.addEventListener('click', () => (on ? stop() : start()));
  render();

  window.SpaceRadio = {
    get on() { return on; },
    // Called by the solar system when the camera locks onto something.
    cue(id) {
      if (!on) return;
      const at = ac.currentTime + 0.05;
      if (id === 'launch') {
        bips(at, { n: 3, freq: 880, level: 0.16, gap: 1 });   // T-3, T-2, T-1
        tone(1320, at + 3, 0.35, 0.16);
        rumble(at + 3, 8);
      } else if (id === 'catch' || id === 'landed') {
        quindarIn(at);
        bips(at + 0.5, { n: id === 'catch' ? 2 : 3, freq: 1500, level: 0.16 });
      } else if (id === 'iss') {
        quindarIn(at);
        bips(at + 0.6, { n: 2, freq: 1300, level: 0.16 });
      } else if (id === 'gateway') {
        quindarIn(at);
        bips(at + 0.6, { n: 3, freq: 1400, level: 0.16 });
        dataBurst(at + 1.4, 0.5, 0.1);
      } else if (id === 'perseverance') {
        quindarIn(at);
        dataBurst(at + 0.4, 0.9, 0.12);
        bips(at + 1.5, { n: 2, freq: 1100, level: 0.15 });
      } else if (id === 'voyager') {
        // faint, slow and far away
        bips(at, { n: 4, freq: 660, level: 0.08, gap: 0.7 });
      }
    },
  };
})();
