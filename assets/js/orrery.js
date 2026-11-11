/* Home page: a pixel-art orrery of the solar system.
   Planets start at their real (mean) longitudes for today and drift forward
   in time; orbit sizes are compressed so Mercury through Neptune fit.
   The ISS, Perseverance and Voyager 1 are clickable: the camera zooms in
   and an info card opens. Everything is drawn into a small canvas that CSS
   scales up with crisp pixels. */
(() => {
  'use strict';

  const P = window.Pixels;
  const root = document.querySelector('[data-orrery]');
  if (!root || !P) return;

  const C = P.PALETTE;
  const KEY = P.DARK_KEY;
  const stage = root.querySelector('[data-stage]');
  const canvas = stage.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const labelLayer = root.querySelector('[data-labels]');
  const dateEl = root.querySelector('[data-simdate]');
  const panel = root.querySelector('[data-panel]');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const wide = window.matchMedia('(min-width: 721px)');

  /* ---------------- Model ---------------- */

  const TILT = 0.68;                         // ≈ sin(43°): how far the orbital plane is tipped toward us
  const COS_TILT = Math.sqrt(1 - TILT * TILT);
  const DAYS_PER_SECOND = 5;
  const J2000 = Date.UTC(2000, 0, 1, 12);
  const TODAY = (Date.now() - J2000) / 864e5;
  const RAD = Math.PI / 180;

  // a: drawn orbit radius (compressed, not to scale). L0: mean longitude at J2000 (deg). n: deg/day.
  const PLANETS = [
    { id: 'mercury', a: 15, r: 1.8, L0: 252.25, n: 4.09233, ramp: [C.merc0, C.merc1, C.merc2] },
    { id: 'venus', a: 22, r: 2.7, L0: 181.98, n: 1.60213, ramp: [C.venus0, C.venus1, C.venus2] },
    { id: 'earth', a: 30, r: 3.1, L0: 100.46, n: 0.98561 },
    { id: 'mars', a: 39, r: 2.5, L0: 355.45, n: 0.52403 },
    { id: 'jupiter', a: 53, r: 6.2, L0: 34.40, n: 0.083086 },
    { id: 'saturn', a: 67, r: 5.0, L0: 49.95, n: 0.033470, rings: true, ramp: [C.sat0, C.sat1, C.sat2] },
    { id: 'uranus', a: 80, r: 3.4, L0: 313.24, n: 0.011731, ramp: [C.ura0, C.ura1, C.ura2] },
    { id: 'neptune', a: 92, r: 3.3, L0: 304.88, n: 0.005981, ramp: [C.nep0, C.nep1, C.nep2] },
  ];
  const BY_ID = Object.fromEntries(PLANETS.map((p) => [p.id, p]));
  const SUN_R = 8.5;
  const ISS_ORBIT = 4.6;
  // Moon: geocentric mean longitude at J2000 and daily motion; drawn orbit radius is compressed.
  const MOON = { a: 8.4, r: 1.0, L0: 218.316, n: 13.176396 };
  // Gateway's near-rectilinear halo orbit, drawn as a stretched ellipse in units of the Moon's radius:
  // closest over the north pole, farthest over the south.
  const NRHO = { rp: 1.45, ra: 3.1, squash: 0.55, period: 7 };
  const VOYAGER_DIR = (() => { const x = -0.84, y = 0.54, m = Math.hypot(x, y); return [x / m, y / m]; })();

  const INFO = {
    iss: {
      kicker: 'Low Earth orbit',
      title: 'International Space Station',
      facts: [['Altitude', '~400 km'], ['Speed', '~28,000 km/h'], ['Orbits', '~16 a day'], ['Crewed since', 'November 2000']],
      body: [
        'The largest thing humans have ever put in space, about the size of a football field. Someone has been living on board, without a break, for more than 25 years.',
        '<b>Fun fact:</b> I used to work with ISS flight controllers at NASA’s Johnson Space Center in Houston.',
      ],
    },
    gateway: {
      kicker: 'Lunar orbit · planned',
      title: 'Lunar Gateway',
      facts: [['Orbit', 'Near-rectilinear halo'], ['One lap', '~6.5 days'], ['Partners', 'NASA, ESA, JAXA, CSA, UAE']],
      body: [
        'A small space station planned to orbit the Moon as part of Artemis, a stopover for crews heading down to the lunar surface.',
        'Its stretched orbit swings within about 1,600 km of the Moon’s north pole and out to about 70,000 km over the south. Unlike the ISS, crews would only visit for weeks at a time.',
      ],
    },
    perseverance: {
      kicker: 'Jezero Crater, Mars',
      title: 'Perseverance',
      facts: [['Landed', 'Feb 18, 2021'], ['Mass', '1,025 kg'], ['Power', 'Nuclear (MMRTG)']],
      body: [
        'A car-sized rover exploring an ancient lake bed, looking for signs of past microbial life. It seals rock samples in tubes for a possible future mission to bring them back to Earth.',
        'It also carried Ingenuity, the first helicopter to fly on another planet.',
      ],
    },
    voyager: {
      kicker: 'Interstellar space',
      title: 'Voyager 1',
      facts: [['Launched', 'Sep 5, 1977'], ['Distance', '~1 light-day'], ['Status', 'Still sending data']],
      body: [
        'The farthest human-made object from Earth, and the first to reach interstellar space. A radio signal now takes almost a full day to reach it.',
        'Built with 1970s computers and still running almost fifty years later.',
      ],
    },
  };
  const FOCUS_KEEPS = { iss: ['earth'], gateway: ['earth'], perseverance: ['mars'], voyager: [] };
  const TARGETS = [
    { id: 'iss', label: 'ISS' },
    { id: 'gateway', label: 'Lunar Gateway' },
    { id: 'perseverance', label: 'Perseverance' },
    { id: 'voyager', label: 'Voyager 1' },
  ];

  /* ---------------- State ---------------- */

  let W = 0, H = 0, scale = 2, u = 1;
  let simDays = TODAY;
  let timeScale = reduce.matches ? 0 : 1;
  let t = 0;                                  // real seconds of animation; drives spins and the ISS
  let focus = null;
  let lastFocus = null;
  let hover = null;
  const cam = { x: 0, y: 0, z: 1, off: 0 };
  let tween = null;                           // { from, to: () => state, start, dur }
  let stars = [];
  let pos = {};                               // per-frame positions in overview space (sun at 0,0)
  let lastDate = '';
  let running = false, raf = 0, oneOff = 0, last = 0, visible = true;

  /* ---------------- Geometry ---------------- */

  const planetAt = (p) => {
    const L = (p.L0 + p.n * simDays) * RAD;
    const X = Math.cos(L) * p.a * u;
    const Z = Math.sin(L) * p.a * u;
    return { X, Z, x: X, y: -Z * TILT };
  };

  // Unit vector from a body toward the sun, in view space (x right, y up, z toward viewer).
  const sunLight = (X, Z) => {
    const v = [-X, -Z * TILT, Z * COS_TILT];
    const m = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / m, v[1] / m, v[2] / m];
  };

  const toScreen = (x, y) => [W / 2 + cam.off + (x - cam.x) * cam.z, H / 2 + (y - cam.y) * cam.z];

  function computePositions() {
    pos = {};
    PLANETS.forEach((p) => { pos[p.id] = planetAt(p); });
    const e = pos.earth;
    const th = t * (Math.PI * 2 / 6);
    pos.iss = { x: e.x + Math.cos(th) * ISS_ORBIT * u, y: e.y - Math.sin(th) * ISS_ORBIT * u * TILT, behind: Math.sin(th) > 0 };

    const Lm = (MOON.L0 + MOON.n * simDays) * RAD;
    const mX = e.X + Math.cos(Lm) * MOON.a * u, mZ = e.Z + Math.sin(Lm) * MOON.a * u;
    pos.moon = { X: mX, Z: mZ, x: mX, y: -mZ * TILT };

    // Gateway: Kepler's equation so it races through the low point and lingers at the high one
    const R = MOON.r * u;
    const a = ((NRHO.rp + NRHO.ra) / 2) * R;
    const ecc = (NRHO.ra - NRHO.rp) / (NRHO.ra + NRHO.rp);
    const b = a * Math.sqrt(1 - ecc * ecc) * NRHO.squash;
    const M = (t * 2 * Math.PI) / NRHO.period;
    let E = M;
    for (let i = 0; i < 6; i++) E -= (E - ecc * Math.sin(E) - M) / (1 - ecc * Math.cos(E));
    pos.gateway = { x: pos.moon.x + b * Math.sin(E), y: pos.moon.y - a * (Math.cos(E) - ecc), behind: Math.sin(E) < 0, a, b, ecc };
    const m = pos.mars;
    pos.perseverance = { x: m.x, y: m.y - BY_ID.mars.r * u };
    const rv = (W / 2 - 14) / Math.abs(VOYAGER_DIR[0]);
    pos.voyager = { x: VOYAGER_DIR[0] * rv, y: VOYAGER_DIR[1] * rv + Math.sin(t * 0.8) * 0.6, rv };
  }

  /* ---------------- Camera ---------------- */

  const overviewCam = () => ({ x: 0, y: 0, z: 1, off: 0 });
  const focusCam = (id) => () => {
    const m = Math.min(W, H);
    const off = wide.matches ? W * 0.2 : 0;
    if (id === 'iss') return { x: pos.earth.x, y: pos.earth.y, z: (0.16 * m) / (BY_ID.earth.r * u), off };
    if (id === 'perseverance') return { x: pos.mars.x, y: pos.mars.y - BY_ID.mars.r * u * 0.35, z: (0.24 * m) / (BY_ID.mars.r * u), off };
    if (id === 'gateway') {
      const R = MOON.r * u;
      return { x: pos.moon.x, y: pos.moon.y + ((NRHO.ra - NRHO.rp) / 2) * R, z: (0.12 * m) / R, off };
    }
    return { x: pos.voyager.x + 2, y: pos.voyager.y + 2, z: 7, off };
  };

  const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

  function updateCamera(now) {
    if (!tween) return;
    const target = tween.to();
    const k = tween.dur ? Math.min(1, (now - tween.start) / tween.dur) : 1;
    const e = ease(k);
    const f = tween.from;
    cam.x = f.x + (target.x - f.x) * e;
    cam.y = f.y + (target.y - f.y) * e;
    cam.off = f.off + (target.off - f.off) * e;
    cam.z = Math.exp(Math.log(f.z) + (Math.log(target.z) - Math.log(f.z)) * e);
    if (k >= 1 && !focus) tween = null;     // overview is static; a focus keeps tracking its target
  }

  function go(id) {
    if (id === focus) return;
    focus = id;
    hover = null;
    tween = { from: { ...cam }, to: id ? focusCam(id) : overviewCam, start: performance.now(), dur: reduce.matches ? 0 : 1300 };
    root.classList.toggle('is-focused', !!id);
    if (id) showPanel(id); else hidePanel();
    if (id) window.SpaceRadio?.cue(id);
    requestFrame();
  }

  /* ---------------- Panel ---------------- */

  function showPanel(id) {
    const info = INFO[id];
    panel.querySelector('[data-kicker]').textContent = info.kicker;
    panel.querySelector('[data-title]').textContent = info.title;
    const body = panel.querySelector('[data-body]');
    body.innerHTML = info.body.map((html) => `<p${html.startsWith('<b>') ? ' class="fun"' : ''}>${html}</p>`).join('');
    const facts = panel.querySelector('[data-facts]');
    facts.replaceChildren(...info.facts.flatMap(([k, v]) => {
      const dt = document.createElement('dt'); dt.textContent = k;
      const dd = document.createElement('dd'); dd.textContent = v;
      return [dt, dd];
    }));
    panel.hidden = false;
    panel.style.animation = 'none'; void panel.offsetWidth; panel.style.animation = '';
    // On phones the card sits under the scene, so bring it into view.
    if (!wide.matches) panel.scrollIntoView({ behavior: reduce.matches ? 'auto' : 'smooth', block: 'nearest' });
  }

  function hidePanel() {
    if (panel.contains(document.activeElement)) labels.get(lastFocus)?.focus({ preventScroll: true });
    panel.hidden = true;
  }

  /* ---------------- Drawing ---------------- */

  function buildStars() {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const n = Math.round((W * H) / 150);
    const fadeBand = 0.2 * Math.min(W, H);
    stars = [];
    for (let i = 0; i < n; i++) {
      const x = Math.floor(rnd() * W), y = Math.floor(rnd() * H);
      // dissolve toward the edges so the scene floats on the page
      const edge = Math.min(x, W - x, y, H - y) / fadeBand;
      if (P.threshold(x, y) > edge) continue;
      const k = rnd();
      stars.push({ x, y, kind: k < 0.82 ? 0 : k < 0.96 ? 1 : 2, phase: rnd() * 6.28 });
    }
  }

  function drawStars() {
    for (const s of stars) {
      if (s.kind === 2) {
        ctx.fillStyle = C.star1;
        ctx.fillRect(s.x - 1, s.y, 3, 1);
        ctx.fillRect(s.x, s.y - 1, 1, 3);
        ctx.fillStyle = C.star2;
        ctx.fillRect(s.x, s.y, 1, 1);
      } else {
        const twinkle = s.kind === 1 && Math.sin(t * 1.3 + s.phase) > 0.7;
        ctx.fillStyle = s.kind === 1 ? (twinkle ? C.star2 : C.star1) : C.star0;
        ctx.fillRect(s.x, s.y, 1, 1);
      }
    }
  }

  function drawOrbit(a, color, step = 3) {
    const R = a * u * cam.z;
    const n = Math.min(8000, Math.max(24, Math.round((Math.PI * 2 * R) / step)));
    ctx.fillStyle = color;
    for (let i = 0; i < n; i++) {
      const L = (i / n) * Math.PI * 2;
      const [sx, sy] = toScreen(Math.cos(L) * a * u, -Math.sin(L) * a * u * TILT);
      if (sx < -1 || sy < -1 || sx > W || sy > H) continue;
      ctx.fillRect(Math.round(sx), Math.round(sy), 1, 1);
    }
  }

  function drawSun() {
    const [sx, sy] = toScreen(0, 0);
    const r = SUN_R * u * cam.z;
    if (sx + r * 1.4 < 0 || sx - r * 1.4 > W || sy + r * 1.4 < 0 || sy - r * 1.4 > H) return;
    const ri = Math.ceil(r * 1.4);
    const cx = Math.round(sx), cy = Math.round(sy);
    const ramp = [C.sun2, C.sun1, C.sun0];
    for (let dy = -ri; dy <= ri; dy++) {
      for (let dx = -ri; dx <= ri; dx++) {
        const d = Math.hypot(dx, dy) / r;
        const px = cx + dx, py = cy + dy;
        if (d <= 1) {
          ctx.fillStyle = P.dither(ramp, 1 - Math.pow(d, 1.7) * 0.95, px, py);
          ctx.fillRect(px, py, 1, 1);
        } else if (d < 1.38) {
          // flickering corona
          const ang = Math.atan2(dy, dx);
          const glow = 0.5 + 0.5 * Math.sin(ang * 7 + t * 1.6) * Math.sin(ang * 3 - t);
          if (P.threshold(px, py) < (1.38 - d) * 1.3 * glow) {
            ctx.fillStyle = C.sun2;
            ctx.fillRect(px, py, 1, 1);
          }
        }
      }
    }
  }

  // Cheap periodic "continents" (integer longitude frequencies keep it seamless)
  const landNoise = (lon, lat) =>
    Math.sin(2 * lon + 0.6) * Math.cos(1.6 * lat) +
    0.55 * Math.sin(3 * lon - 2.1 * lat + 1.7) +
    0.35 * Math.sin(5 * lon + 2.7 * lat + 0.4);

  function rampFor(id) {
    if (id === 'earth') {
      const spin = t * 0.35;
      return (nx, ny, nz) => {
        const lat = Math.asin(ny);
        if (Math.abs(lat) > 1.18) return [C.ice0, C.ice1, C.ice2];
        const lon = Math.atan2(nx, nz) + spin;
        return landNoise(lon, lat) > 0.55 ? [C.land0, C.land1, C.land2] : [C.sea0, C.sea1, C.sea2];
      };
    }
    if (id === 'mars') {
      const spin = t * 0.25 + 1.3;
      return (nx, ny, nz) => {
        const lat = Math.asin(ny);
        if (lat > 1.22) return [C.ice0, C.ice1, C.ice2];
        const lon = Math.atan2(nx, nz) + spin;
        return landNoise(lon, lat * 1.3 + 0.4) > 0.75 ? [C.marsd0, C.marsd1, C.marsd2] : [C.mars0, C.mars1, C.mars2];
      };
    }
    if (id === 'moon') {
      // tidally locked: always the same face, with dark maria
      return (nx, ny, nz) => {
        const lat = Math.asin(ny);
        const lon = Math.atan2(nx, nz) + 2.2;
        return landNoise(lon * 1, lat * 1.4 - 0.3) > 0.5 ? [C.mare0, C.mare1, C.mare2] : [C.moon0, C.moon1, C.moon2];
      };
    }
    if (id === 'jupiter') {
      return (nx, ny) => {
        const lat = Math.asin(ny);
        return Math.sin(lat * 9 + 0.6) > 0.25 ? [C.jupb0, C.jupb1, C.jupb2] : [C.jup0, C.jup1, C.jup2];
      };
    }
    const ramp = BY_ID[id].ramp;
    return () => ramp;
  }

  // Saturn's rings as a dithered annulus in the orbital plane; `front` picks the near half.
  function drawRings(sx, sy, r, front) {
    const inner = r * 1.35, outer = r * 2.15;
    const ri = Math.ceil(outer) + 1;
    const cx = Math.round(sx), cy = Math.round(sy);
    for (let dy = -Math.ceil(outer * TILT) - 1; dy <= Math.ceil(outer * TILT) + 1; dy++) {
      if ((dy > 0) !== front) continue;
      for (let dx = -ri; dx <= ri; dx++) {
        const ex = dx, ey = dy / TILT;                     // undo the tilt to measure ring radius
        const d = Math.hypot(ex, ey);
        if (d < inner || d > outer) continue;
        const px = cx + dx, py = cy + dy;
        const band = (d - inner) / (outer - inner);
        if (band > 0.58 && band < 0.68) continue;           // Cassini division
        ctx.fillStyle = P.threshold(px, py) < 0.55 + 0.3 * Math.sin(band * 9) ? C.ring1 : C.ring0;
        ctx.fillRect(px, py, 1, 1);
      }
    }
  }

  function drawPlanet(p) {
    const q = pos[p.id];
    const [sx, sy] = toScreen(q.x, q.y);
    const r = Math.max(1.2, p.r * u * cam.z);
    const reach = p.rings ? r * 2.2 : r;
    if (sx + reach < -2 || sx - reach > W + 2 || sy + reach < -2 || sy - reach > H + 2) return;
    if (p.rings) drawRings(sx, sy, r, false);
    P.sphere(ctx, sx, sy, r, sunLight(q.X, q.Z), rampFor(p.id));
    if (p.rings) drawRings(sx, sy, r, true);
  }

  function drawISS() {
    const [sx, sy] = toScreen(pos.iss.x, pos.iss.y);
    if (cam.z < 2.6) {
      ctx.fillStyle = C.hud;
      ctx.fillRect(Math.round(sx), Math.round(sy), 1, 1);
      return;
    }
    const p = Math.max(1, Math.round(cam.z / 4));
    const { w, h } = P.size('iss');
    P.drawSprite(ctx, 'iss', sx - (w * p) / 2, sy - (h * p) / 2, p, KEY);
  }

  function drawISSOrbit() {
    if (cam.z < 2.6) return;
    const e = pos.earth;
    const R = ISS_ORBIT * u;
    const n = Math.max(24, Math.round((Math.PI * 2 * R * cam.z) / 3));
    ctx.fillStyle = C.orbit1;
    for (let i = 0; i < n; i++) {
      const L = (i / n) * Math.PI * 2;
      const [sx, sy] = toScreen(e.x + Math.cos(L) * R, e.y - Math.sin(L) * R * TILT);
      ctx.fillRect(Math.round(sx), Math.round(sy), 1, 1);
    }
  }

  function dottedRing(cx, cy, rx, ry, color) {
    const n = Math.max(24, Math.round((Math.PI * (rx + ry)) / 3));
    ctx.fillStyle = color;
    for (let i = 0; i < n; i++) {
      const L = (i / n) * Math.PI * 2;
      const [sx, sy] = toScreen(cx + Math.cos(L) * rx, cy - Math.sin(L) * ry);
      if (sx < -1 || sy < -1 || sx > W || sy > H) continue;
      ctx.fillRect(Math.round(sx), Math.round(sy), 1, 1);
    }
  }

  function drawMoon() {
    const q = pos.moon;
    const [sx, sy] = toScreen(q.x, q.y);
    const r = Math.max(1, MOON.r * u * cam.z);
    if (sx + r < -2 || sx - r > W + 2 || sy + r < -2 || sy - r > H + 2) return;
    if (r < 1.5) { ctx.fillStyle = C.moon2; ctx.fillRect(Math.round(sx), Math.round(sy), 1, 1); return; }
    P.sphere(ctx, sx, sy, r, sunLight(q.X, q.Z), rampFor('moon'));
  }

  function drawGatewayOrbit() {
    if (cam.z < 6) return;
    const g = pos.gateway;
    const n = Math.max(40, Math.round((Math.PI * (g.a + g.b) * cam.z) / 3));
    ctx.fillStyle = C.orbit1;
    for (let i = 0; i < n; i++) {
      const E = (i / n) * Math.PI * 2;
      const [sx, sy] = toScreen(pos.moon.x + g.b * Math.sin(E), pos.moon.y - g.a * (Math.cos(E) - g.ecc));
      if (sx < -1 || sy < -1 || sx > W || sy > H) continue;
      ctx.fillRect(Math.round(sx), Math.round(sy), 1, 1);
    }
  }

  function drawGateway() {
    if (cam.z < 2.6) return;
    const [sx, sy] = toScreen(pos.gateway.x, pos.gateway.y);
    if (cam.z < 12) { ctx.fillStyle = C.sun1; ctx.fillRect(Math.round(sx), Math.round(sy), 1, 1); return; }
    const p = Math.max(1, Math.round(cam.z / 11));
    const { w, h } = P.size('gateway');
    P.drawSprite(ctx, 'gateway', sx - (w * p) / 2, sy - (h * p) / 2, p, KEY);
  }

  function drawMoonSystem() {
    drawGatewayOrbit();
    if (pos.gateway.behind) { drawGateway(); drawMoon(); }
    else { drawMoon(); drawGateway(); }
  }

  function drawEarthSystem() {
    if (cam.z >= 2) dottedRing(pos.earth.x, pos.earth.y, MOON.a * u, MOON.a * u * TILT, C.orbit0);
    drawISSOrbit();
    // Earth, ISS and Moon in depth order (farther = higher on screen)
    [
      { y: pos.earth.y, fn: () => drawPlanet(BY_ID.earth) },
      { y: pos.iss.y + (pos.iss.behind ? -0.01 : 0.01), fn: drawISS },
      { y: pos.moon.y, fn: drawMoonSystem },
    ].sort((p, q) => p.y - q.y).forEach((b) => b.fn());
  }

  function drawRover() {
    const [sx, sy] = toScreen(pos.perseverance.x, pos.perseverance.y);
    if (cam.z < 3) {
      if (Math.sin(t * 5) > -0.2) { ctx.fillStyle = C.hud; ctx.fillRect(Math.round(sx), Math.round(sy) - 1, 1, 1); }
      return;
    }
    const p = Math.max(2, Math.round(cam.z / 6.5));
    const { w, h } = P.size('rover');
    const x = sx - (w * p) / 2;
    const y = sy - h * p + p * 2;           // wheels sink a little into the regolith
    P.drawSprite(ctx, 'rover', x, y, p, KEY);
    if (Math.sin(t * 3) > 0.6) { ctx.fillStyle = C.sun1; ctx.fillRect(Math.round(x + 12 * p), Math.round(y + p), p, p); }
  }

  function drawVoyager() {
    const v = pos.voyager;
    // dotted escape trajectory from just past Neptune's orbit to beyond the edge
    // (hidden while zoomed into something else, where it would just be a stray line)
    const showPath = cam.z < 2.5 || focus === 'voyager';
    ctx.fillStyle = C.orbit1;
    const r0 = BY_ID.neptune.a * u * 0.88, r1 = v.rv + 80;
    for (let r = r0; showPath && r < r1; r += 4 / Math.max(1, cam.z * 0.6)) {
      if (Math.abs(r - v.rv) < 6) continue;
      const [sx, sy] = toScreen(VOYAGER_DIR[0] * r, VOYAGER_DIR[1] * r);
      if (sx < 0 || sy < 0 || sx > W || sy > H) continue;
      ctx.fillRect(Math.round(sx), Math.round(sy), 1, 1);
    }
    const [sx, sy] = toScreen(v.x, v.y);
    if (cam.z < 2) {
      P.drawSprite(ctx, 'voyMini', sx - 1, sy - 1, 1, KEY);
      if (Math.sin(t * 2.2) > 0.5) { ctx.fillStyle = C.sun1; ctx.fillRect(Math.round(sx), Math.round(sy) - 2, 1, 1); }
      return;
    }
    const p = Math.max(1, Math.round(cam.z / 2.2));
    const { w, h } = P.size('voyager');
    P.drawSprite(ctx, 'voyager', sx - (w * p) / 2, sy - (h * p) / 2, p, KEY);
  }

  // Where each clickable thing is on screen and roughly how big it looks.
  // The ISS is anchored to Earth (its orbit is the clickable area) so the label doesn't jitter.
  function anchorOf(id) {
    if (id === 'iss') {
      const [x, y] = toScreen(pos.earth.x, pos.earth.y);
      return { x, y, r: (ISS_ORBIT * u + 1) * cam.z };
    }
    if (id === 'gateway') {
      const [x, y] = toScreen(pos.moon.x, pos.moon.y);
      return { x, y, r: MOON.r * u * cam.z * 1.6 + 2 };
    }
    if (id === 'perseverance') {
      const [x, y] = toScreen(pos.mars.x, pos.mars.y);
      return { x, y, r: BY_ID.mars.r * u * cam.z + 2 };
    }
    const [x, y] = toScreen(pos.voyager.x, pos.voyager.y);
    return { x, y, r: cam.z < 2 ? 3 : 10 * Math.round(cam.z / 2.2) };
  }

  function drawReticle(id) {
    const { x: sx, y: sy, r: ar } = anchorOf(id);
    const r = Math.round(ar + 3 + (Math.sin(t * 6) > 0 ? 1 : 0));
    const x0 = Math.round(sx) - r, y0 = Math.round(sy) - r, x1 = Math.round(sx) + r, y1 = Math.round(sy) + r;
    ctx.fillStyle = C.hud;
    const L = 3;
    ctx.fillRect(x0, y0, L, 1); ctx.fillRect(x0, y0, 1, L);
    ctx.fillRect(x1 - L + 1, y0, L, 1); ctx.fillRect(x1, y0, 1, L);
    ctx.fillRect(x0, y1, L, 1); ctx.fillRect(x0, y1 - L + 1, 1, L);
    ctx.fillRect(x1 - L + 1, y1, L, 1); ctx.fillRect(x1, y1 - L + 1, 1, L);
  }

  function draw() {
    ctx.fillStyle = C.space;
    ctx.fillRect(0, 0, W, H);
    drawStars();
    const keepOrbits = focus && cam.z > 3 ? FOCUS_KEEPS[focus] : null;
    PLANETS.forEach((p) => {
      if (keepOrbits && !keepOrbits.includes(p.id)) return;
      drawOrbit(p.a, p.id === 'earth' || p.id === 'mars' ? C.orbit1 : C.orbit0);
    });
    drawVoyager();

    // Zoomed in, only draw what belongs in that shot; at this compressed scale
    // neighbouring planets would otherwise loom in as giant blobs.
    const keep = focus && cam.z > 3 ? FOCUS_KEEPS[focus] : null;
    const show = (id) => !keep || keep.includes(id);

    // painter's order: farther (smaller y) first
    const bodies = [{ id: 'sun', y: 0, fn: drawSun }, ...PLANETS.map((p) => ({
      id: p.id,
      y: pos[p.id].y,
      fn: p.id === 'earth' ? drawEarthSystem : p.id === 'mars' ? () => { drawPlanet(p); drawRover(); } : () => drawPlanet(p),
    }))];
    bodies.filter((b) => show(b.id)).sort((a, b) => a.y - b.y).forEach((b) => b.fn());

    if (hover && !focus) drawReticle(hover);
  }

  /* ---------------- Labels (HTML, so they're real buttons) ---------------- */

  const labels = new Map();
  TARGETS.forEach(({ id, label }) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'orrery__label';
    b.textContent = label;
    b.setAttribute('aria-label', `Zoom in on ${INFO[id].title}`);
    b.addEventListener('click', () => { lastFocus = id; go(id); });
    b.addEventListener('mouseenter', () => { hover = id; requestFrame(); });
    b.addEventListener('mouseleave', () => { if (hover === id) hover = null; });
    b.addEventListener('focus', () => { hover = id; requestFrame(); });
    b.addEventListener('blur', () => { if (hover === id) hover = null; });
    labelLayer.appendChild(b);
    labels.set(id, b);
  });

  function placeLabels() {
    if (focus) return;
    const ox = (stage.clientWidth - W * scale) / 2;
    const oy = (stage.clientHeight - H * scale) / 2;
    const placed = [];
    const overlaps = (r) => placed.some((q) => r.x < q.x + q.w + 4 && q.x < r.x + r.w + 4 && r.y < q.y + q.h + 4 && q.y < r.y + r.h + 4);
    labels.forEach((el, id) => {
      const a = anchorOf(id);
      const lift = id === 'iss' ? (ISS_ORBIT * u * TILT + 2) * cam.z : a.r;
      const w = el.offsetWidth, h = el.offsetHeight;
      let x = ox + a.x * scale - w / 2;
      x = Math.max(4, Math.min(stage.clientWidth - w - 4, x));
      // above the object by default; flip below if it would collide with a label already placed
      // try: above the object, stacked one row higher, below it, two rows higher
      const above = oy + (a.y - lift - 3) * scale - h - 6;
      const spots = [
        { y: above, below: false },
        { y: above - h - 6, below: false },
        { y: oy + (a.y + lift + 3) * scale + 6, below: true },
        { y: above - 2 * (h + 6), below: false },
      ];
      const spot = spots.find((s) => !overlaps({ x, y: s.y, w, h })) || spots[0];
      const y = spot.y, below = spot.below;
      el.classList.toggle('is-stacked', spot !== spots[0] && !below);
      placed.push({ x, y, w, h });
      el.classList.toggle('is-below', below);
      el.style.visibility = a.x < -4 || a.x > W + 4 || a.y < -4 || a.y > H + 4 ? 'hidden' : '';
      el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    });
  }

  function updateDate() {
    const d = new Date(J2000 + simDays * 864e5);
    const s = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase();
    if (s !== lastDate) {
      lastDate = s;
      dateEl.textContent = `${Math.abs(simDays - TODAY) < 1 ? 'Today · ' : ''}${s}`;
    }
  }

  /* ---------------- Loop ---------------- */

  function frame(now) {
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;
    if (!reduce.matches) {
      const goal = focus ? 0 : hover ? 0.15 : 1;
      timeScale += (goal - timeScale) * (1 - Math.exp(-dt * 5));
      t += dt;
      simDays += dt * DAYS_PER_SECOND * timeScale;
    }
    computePositions();
    updateCamera(now);
    draw();
    placeLabels();
    updateDate();
    if (running) raf = requestAnimationFrame(frame);
  }

  function start() {
    if (running || reduce.matches || !visible || document.hidden) return;
    running = true;
    last = 0;
    raf = requestAnimationFrame(frame);
  }
  function stop() { running = false; cancelAnimationFrame(raf); }

  // Paint a single frame when the loop isn't running (reduced motion, or off screen).
  function requestFrame() {
    if (running || oneOff) return;
    oneOff = requestAnimationFrame((n) => { oneOff = 0; if (!running) frame(n); });
  }

  /* ---------------- Sizing ---------------- */

  function resize() {
    const sw = stage.clientWidth, sh = stage.clientHeight;
    if (!sw || !sh) return;
    scale = Math.max(2, Math.round(sw / 250));
    W = Math.ceil(sw / scale);
    H = Math.ceil(sh / scale);
    canvas.width = W; canvas.height = H;
    canvas.style.width = `${W * scale}px`;
    canvas.style.height = `${H * scale}px`;
    u = Math.min(W / 208, H / 150);
    buildStars();
    computePositions();
    if (focus) { Object.assign(cam, focusCam(focus)()); tween = { from: { ...cam }, to: focusCam(focus), start: 0, dur: 0 }; }
    // resizing a canvas clears it, so repaint right away rather than waiting for the next frame
    draw();
    placeLabels();
    updateDate();
  }

  /* ---------------- Input ---------------- */

  function hit(e) {
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    const y = ((e.clientY - rect.top) / rect.height) * H;
    let best = null, bestD = Infinity;
    TARGETS.forEach(({ id }) => {
      const a = anchorOf(id);
      const d = Math.hypot(a.x - x, a.y - y);
      if (d < a.r + 6 && d < bestD) { best = id; bestD = d; }
    });
    return best;
  }

  canvas.addEventListener('pointermove', (e) => {
    if (focus || e.pointerType !== 'mouse') return;
    const h = hit(e);
    if (h !== hover) { hover = h; requestFrame(); }
    canvas.style.cursor = h ? 'pointer' : 'default';
  });
  canvas.addEventListener('pointerleave', () => { hover = null; canvas.style.cursor = 'default'; });
  canvas.addEventListener('click', (e) => {
    const h = hit(e);
    if (focus) { if (!h || h !== focus) go(null); return; }
    if (h) { lastFocus = h; go(h); }
  });

  panel.querySelector('[data-back]').addEventListener('click', () => go(null));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && focus) go(null); });

  /* ---------------- Lifecycle ---------------- */

  new ResizeObserver(() => resize()).observe(stage);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; visible ? start() : stop(); }).observe(stage);
  }
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  reduce.addEventListener?.('change', () => { if (reduce.matches) { stop(); timeScale = 0; requestFrame(); } else { timeScale = 1; start(); } });
  wide.addEventListener?.('change', () => { if (focus) tween = { from: { ...cam }, to: focusCam(focus), start: performance.now(), dur: 300 }; });

  resize();
  start();
})();
