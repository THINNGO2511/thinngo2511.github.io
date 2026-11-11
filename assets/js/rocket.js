/* Career section: a Starship-style launch and double landing, rendered in 3D
   pixels with Tiny3D. Drag to orbit the camera; "Launch" runs the flight.

   The camera works like a tracking shot: it rides up with the stack until the
   tower is far below, stays with the booster through hot staging, the flip and
   boostback, follows it all the way down to the catch, then settles on the
   pad for the ship's belly flop, flip and landing.
   Vehicle positions are their centers, so flips rotate about the middle. */
(() => {
  'use strict';

  const root = document.querySelector('[data-rocket]');
  const T3 = window.Tiny3D;
  if (!root || !T3) return;
  const { Renderer, chain, T, S, RY, RZ, pt } = T3;

  const stage = root.querySelector('[data-rocket-stage]');
  const canvas = stage.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const r3 = new Renderer(ctx);
  const hudEl = root.querySelector('[data-rocket-hud]');
  const boosterEl = root.querySelector('[data-rocket-booster]');
  const shipEl = root.querySelector('[data-rocket-ship]');
  const launchBtn = root.querySelector('[data-launch]');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

  const COL = {
    space: '#313131', star0: '#454545', star1: '#5f5f5f', star2: '#8c8c8c',
    ground: '#383838', groundB: '#343434', slab: '#2a2a2a',
    concrete: '#76716a', mount: '#4f4b46', towerA: '#5d5953', towerB: '#4b4743', arm: '#8a8378',
    steel: '#cfcabe', skirt: '#57534d', tiles: '#262422', ring: '#3f3c38', padMark: '#ffd700',
    flame0: '#fffbe6', flame1: '#ffe08a', flame2: '#f7a443', flame3: '#d9622f',
    smoke: ['#a7a29a', '#8a857e', '#6c6863'],
  };

  /* ---------------- Vehicles and site (world units) ---------------- */

  const R = 3.4;                             // vehicle radius
  const BH = 32, SHIP_BODY = 17, SH = 26;    // booster height, ship body, ship total height
  const MOUNT_TOP = 6;
  const TOWER = { x: -10.5, z: 0, h: 74 };
  const ARMS_IDLE_Y = 58, ARMS_CATCH_Y = 46, CATCH_PIN = 27;   // pins sit 27 above the booster's base
  const PAD = { x: 26, z: -16 };
  const KM = 0.25;                           // units -> "km" for the readout

  // mission clock (seconds after pressing Launch)
  const TL = { liftoff: 3, stage: 12, flip: 14, boost: 16, upright: 18, catch: 24, shipBack: 24.8, shipFlip: 26, shipLand: 33, done: 34 };

  let W = 0, H = 0, scale = 2;
  const REST = [6, 34, -6];
  const cam = { yaw: 0.78, pitch: 0.26, zoom: 1, base: 1, mul: 1, user: false, target: REST.slice() };
  let stars = [];
  let smoke = [];
  let mission = null;
  let prev = null;
  let t = 0, running = false, raf = 0, last = 0, visible = true;

  const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const lerp = (a, b, k) => a + (b - a) * k;
  // cubic Hermite from p0 (velocity v0) to p1 (velocity v1) over `dur` seconds, u in 0..1
  function hermite(p0, v0, p1, v1, dur, u) {
    const u2 = u * u, u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * p0 + (u3 - 2 * u2 + u) * dur * v0 + (-2 * u3 + 3 * u2) * p1 + (u3 - u2) * dur * v1;
  }

  /* ---------------- Flight ---------------- */

  // ascent, as the booster's base position; L = seconds since liftoff
  const ascentBase = (L) => ({ x: 0.12 * L * L, y: MOUNT_TOP + 3.2 * L * L, tilt: 0.012 * L });
  const ascentVel = (L) => ({ x: 0.24 * L, y: 6.4 * L });
  const centerOf = (base, tilt, half) => ({ x: base.x + Math.sin(tilt) * half, y: base.y + Math.cos(tilt) * half });

  function states(m) {
    const st = {
      booster: { x: 0, y: MOUNT_TOP + BH / 2, tilt: 0, burn: 0, phase: 'On the mount' },
      ship: { x: 0, y: MOUNT_TOP + BH + SH / 2, z: 0, tilt: 0, roll: 0, burn: 0, visible: true, phase: 'On the mount' },
      arms: { open: 1.5, y: ARMS_IDLE_Y },
    };
    const L = m - TL.liftoff;
    if (L < 0) {
      st.booster.burn = m > TL.liftoff - 0.5 ? 0.5 : 0;
      return st;
    }

    const Ls = TL.stage - TL.liftoff;
    if (L < Ls) {
      const b = ascentBase(L);
      const c = centerOf(b, b.tilt, BH / 2);
      const s = centerOf(b, b.tilt, BH + SH / 2);
      Object.assign(st.booster, { x: c.x, y: c.y, tilt: b.tilt, burn: 1, phase: L < 2 ? 'Liftoff' : L > 4.5 && L < 6.5 ? 'Max-Q' : 'Ascent' });
      Object.assign(st.ship, { x: s.x, y: s.y, tilt: b.tilt, burn: L > Ls - 0.4 ? 0.8 : 0, phase: 'Ascent' });
      return st;
    }

    // ---- after hot staging ----
    const b12 = ascentBase(Ls), v12 = ascentVel(Ls);
    const c12 = centerOf(b12, b12.tilt, BH / 2), s12 = centerOf(b12, b12.tilt, BH + SH / 2);
    const tau = m - TL.stage;

    // ship: lights up and pulls away, then (much later) comes back
    if (m < TL.stage + 4) {
      const a = 34;
      Object.assign(st.ship, { x: s12.x + v12.x * tau, y: s12.y + v12.y * tau + 0.5 * a * tau * tau, tilt: b12.tilt, burn: 1, phase: 'Hot staging · burn to orbit' });
    } else if (m < TL.shipBack) {
      Object.assign(st.ship, { visible: false, phase: 'In orbit' });
    } else if (m < TL.shipFlip) {
      // belly flop: falling sideways, dark heat shield turned toward us
      const k = (m - TL.shipBack) / (TL.shipFlip - TL.shipBack);
      Object.assign(st.ship, {
        x: lerp(PAD.x + 9, PAD.x + 4, k), y: lerp(230, 165, k), z: PAD.z,
        tilt: -Math.PI / 2 + Math.sin(m * 2.6) * 0.05, roll: 0.9, burn: 0, phase: 'Belly flop',
      });
    } else if (m < TL.shipLand) {
      const dur = TL.shipLand - TL.shipFlip, u = (m - TL.shipFlip) / dur;
      const k = ease(clamp01(u / 0.25));             // flip done in the first ~2 s, high above the pad
      Object.assign(st.ship, {
        x: hermite(PAD.x + 4, -1.5, PAD.x, 0, dur, u), y: hermite(165, -50, 0.6 + SH / 2, 0, dur, u), z: PAD.z,
        tilt: lerp(-Math.PI / 2, 0, k), roll: lerp(0.9, 0, k), burn: 1, phase: 'Flip and landing burn',
      });
    } else {
      Object.assign(st.ship, { x: PAD.x, y: 0.6 + SH / 2, z: PAD.z, tilt: 0, roll: 0, burn: 0, phase: 'Landed ✓' });
    }

    // booster: coast up to apogee while flipping, boostback, fall, landing burn, catch
    const g = 14, flipT = TL.flip - TL.stage, boostT = TL.boost - TL.stage, upT = TL.upright - TL.stage;
    const back = 3;                                   // boostback deceleration
    const bx = (tt) => c12.x + v12.x * tt - (tt > flipT ? 0.5 * back * (tt - flipT) ** 2 : 0);
    const by = (tt) => c12.y + v12.y * tt - 0.5 * g * tt * tt;
    let x, y, tilt, burn = 0, phase;
    if (tau < boostT) {
      x = bx(tau); y = by(tau);
      tilt = tau < flipT ? lerp(b12.tilt, -1.3, ease(tau / flipT)) : -1.3;
      burn = tau > flipT + 0.15 ? 1 : 0;
      phase = tau < flipT ? 'Flip' : 'Boostback burn';
    } else {
      const xA = bx(boostT), yA = by(boostT);
      const vxA = v12.x - back * (boostT - flipT), vyA = v12.y - g * boostT;
      const dur = TL.catch - TL.boost, u = Math.min(1, (tau - boostT) / dur);
      x = hermite(xA, vxA, 0, 0, dur, u);
      y = hermite(yA, vyA, ARMS_CATCH_Y - CATCH_PIN + BH / 2, 0, dur, u);
      tilt = lerp(-1.3, 0, ease(clamp01((tau - boostT) / (upT - boostT))));
      burn = u > 0.7 && u < 1 ? 1 : 0;
      phase = u >= 1 ? 'Caught by the tower ✓' : u > 0.7 ? 'Landing burn' : 'Falling back';
    }
    Object.assign(st.booster, { x, y, tilt, burn, phase });

    // tower: arms drop to catch height and swing in, then close on the booster
    const ready = clamp01((m - (TL.catch - 5)) / 3);
    st.arms.y = lerp(ARMS_IDLE_Y, ARMS_CATCH_Y, ease(ready));
    st.arms.open = m < TL.catch - 0.6 ? lerp(1.5, 0.55, ease(ready)) : lerp(0.55, 0.06, clamp01((m - (TL.catch - 0.6)) / 0.6));
    return st;
  }

  /* ---------------- Models ---------------- */

  function boosterMatrix(s) { return chain(T(s.x, s.y, s.z || 0), RZ(-s.tilt), T(0, -BH / 2, 0)); }
  function shipMatrix(s) { return chain(T(s.x, s.y, s.z || 0), RZ(-s.tilt), RY(s.roll || 0), T(0, -SH / 2, 0)); }

  function drawBooster(s) {
    const M = boosterMatrix(s);
    r3.cylinder(chain(M, S(R, 2, R)), COL.skirt, { sides: 14 });
    r3.cylinder(chain(M, T(0, 2, 0), S(R, BH - 4, R)), COL.steel, { sides: 14 });
    r3.cylinder(chain(M, T(0, BH - 2, 0), S(R, 2, R)), COL.ring, { sides: 14, colorAt: (i) => (i % 2 ? COL.ring : COL.tiles) });
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([fx, fz]) =>
      r3.box(chain(M, T(fx * (R + 0.9), BH - 4.5, fz * (R + 0.9)), RY(fx ? 0 : Math.PI / 2), S(1.6, 2.4, 0.5)), COL.skirt));
    [1, -1].forEach((z) => r3.box(chain(M, T(0, CATCH_PIN, z * (R + 0.5)), S(1.2, 0.8, 1)), COL.skirt));
    return M;
  }

  function drawShip(s) {
    if (!s.visible) return null;
    const M = shipMatrix(s);
    const belly = (i, n) => (Math.cos(((i + 0.5) / n) * Math.PI * 2) < -0.1 ? COL.tiles : COL.steel);
    r3.cylinder(chain(M, T(0, -0.8, 0), S(1.9, 0.8, 1.9)), COL.skirt, { sides: 10 });
    r3.cylinder(chain(M, S(R, SHIP_BODY, R)), COL.steel, { sides: 14, colorAt: belly });
    r3.cylinder(chain(M, T(0, SHIP_BODY, 0), S(R, 4, R)), COL.steel, { sides: 14, rTop: 0.82, colorAt: belly, caps: false });
    r3.cylinder(chain(M, T(0, SHIP_BODY + 4, 0), S(R * 0.82, 3, R * 0.82)), COL.steel, { sides: 14, rTop: 0.62, colorAt: belly, caps: false });
    r3.cylinder(chain(M, T(0, SHIP_BODY + 7, 0), S(R * 0.51, 2.4, R * 0.51)), COL.steel, { sides: 14, rTop: 0, colorAt: belly, caps: false });
    // flaps: big aft pair and small forward pair, on the sides next to the belly
    [1, -1].forEach((z) => {
      r3.box(chain(M, T(-1.4, 3.2, z * (R + 0.9)), S(3, 5.4, 0.6)), COL.tiles);
      r3.box(chain(M, T(-1.2, SHIP_BODY + 3.4, z * (R * 0.82 + 0.7)), S(2.2, 3.4, 0.55)), COL.tiles);
    });
    return M;
  }

  function drawTower(arms) {
    const { x, z, h } = TOWER;
    for (let y = 0, i = 0; y < h; y += 4, i++) r3.box(chain(T(x, y + 2, z), S(6, 4, 6)), i % 2 ? COL.towerA : COL.towerB);
    r3.box(chain(T(x + 1, h + 1.5, z), S(9, 3, 4)), COL.towerB);                  // crane on top
    r3.box(chain(T(x + 3.6, arms.y, z), S(1.6, 3, 9.6)), COL.arm);                // carriage
    // chopsticks: folded flat along the tower until the catch, then swung in
    [1, -1].forEach((side) => r3.box(chain(T(x + 3.4, arms.y + 0.6, z + side * 4.4), RY(-side * arms.open), T(5.2, 0, 0), S(10.4, 1.4, 1.2)), COL.arm));
  }

  function drawGround() {
    const half = 54, tile = 9;
    r3.box(chain(T(8, -2, -6), S(half * 2, 4, half * 2)), COL.slab, { layer: 0 });
    for (let gx = -half; gx < half; gx += tile) {
      for (let gz = -half; gz < half; gz += tile) {
        const x0 = 8 + gx, z0 = -6 + gz;
        r3.poly([[x0, 0.02, z0 + tile], [x0 + tile, 0.02, z0 + tile], [x0 + tile, 0.02, z0], [x0, 0.02, z0]],
          ((gx + gz) / tile) & 1 ? COL.ground : COL.groundB, { layer: 0, flat: true });
      }
    }
    r3.box(chain(T(0, MOUNT_TOP / 2, 0), S(11, MOUNT_TOP, 11)), COL.mount);
    r3.cylinder(chain(T(PAD.x, 0, PAD.z), S(8, 0.6, 8)), COL.concrete, { sides: 16 });
    r3.disc(PAD.x, 0.65, PAD.z, 5.5, COL.mount, { sides: 16, layer: 1 });
    r3.disc(PAD.x, 0.7, PAD.z, 1.2, COL.padMark, { sides: 8, layer: 1 });
  }

  /* ---------------- Exhaust, smoke, stars ---------------- */

  function flame(M, power, radius) {
    if (power <= 0) return;
    const a = r3.project(pt(M, 0, -0.8, 0)), b = r3.project(pt(M, 0, -10, 0));
    let dx = b[0] - a[0], dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    dx /= len; dy /= len;
    const L = Math.round(power * (17 + Math.random() * 7) * Math.max(1, cam.zoom));
    const w = Math.max(2, radius * cam.zoom * 1.05);
    for (let i = 0; i < L; i++) {
      const k = i / L;
      const half = w * (1 - k * 0.7) * (i < 2 ? 0.8 : 1);
      const cx = a[0] + dx * i, cy = a[1] + dy * i;
      for (let o = -half; o <= half; o += 1) {
        if (Math.random() < k * 0.6) continue;
        const e = Math.abs(o) / half;
        ctx.fillStyle = k < 0.25 && e < 0.55 ? COL.flame0 : k < 0.5 && e < 0.8 ? COL.flame1 : k < 0.78 ? COL.flame2 : COL.flame3;
        ctx.fillRect(Math.round(cx - dy * o), Math.round(cy + dx * o), 1, 1);
      }
    }
  }

  // Dithered smoke puffs, pre-rendered per (radius, density, shade) so hundreds stay cheap.
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
  const puffCache = new Map();
  function puff(r, density, shade) {
    const key = `${r}|${density}|${shade}`;
    let c = puffCache.get(key);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = c.height = r * 2 + 1;
    const p = c.getContext('2d');
    p.fillStyle = COL.smoke[shade];
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) {
        const d = Math.hypot(x, y) / (r + 0.5);
        if (d > 1) continue;
        if (BAYER[((y + 64) & 3) * 4 + ((x + 64) & 3)] < (density / 4) * (1 - d * d * 0.6)) p.fillRect(x + r, y + r, 1, 1);
      }
    }
    puffCache.set(key, c);
    return c;
  }

  function emit(x, y, z, n, { spread = 4, up = 1, size = 2, life = 2 } = {}) {
    for (let i = 0; i < n && smoke.length < 220; i++) {
      const a = Math.random() * Math.PI * 2, sp = spread * (0.4 + Math.random() * 0.6);
      smoke.push({ x, y, z, vx: Math.cos(a) * sp, vy: up * Math.random(), vz: Math.sin(a) * sp, age: 0, life: life * (0.7 + Math.random() * 0.6), size: 0.6, max: size * (0.6 + Math.random() * 0.6) });
    }
  }

  function drawSmoke() {
    const items = smoke.map((p) => ({ p, s: r3.project([p.x, p.y, p.z]) })).sort((a, b) => a.s[2] - b.s[2]);
    for (const { p, s } of items) {
      const k = p.age / p.life;
      const r = Math.max(1, Math.min(9, Math.round(p.size * cam.zoom)));
      const density = Math.max(1, 4 - Math.floor(k * 4));
      const img = puff(r, density, k < 0.3 ? 0 : k < 0.65 ? 1 : 2);
      ctx.drawImage(img, Math.round(s[0] - r), Math.round(s[1] - r));
    }
  }

  function drawStars() {
    const fade = 0.16 * Math.min(W, H);
    const shift = cam.target[1] * cam.zoom * 0.35;
    for (const st of stars) {
      const y = Math.floor((((st.y + shift) % (H * 2)) + H * 2) % (H * 2)) - Math.floor(H / 2);
      if (y < 0 || y >= H) continue;
      const edge = Math.min(st.x, W - st.x, y, H - y) / fade;
      if (st.k * 1.1 > edge + 0.2) continue;
      ctx.fillStyle = st.k > 0.93 ? COL.star2 : st.k > 0.75 ? COL.star1 : COL.star0;
      ctx.fillRect(st.x, y, 1, 1);
    }
  }

  /* ---------------- Frame ---------------- */

  const current = () => states(mission ? mission.t : 0);

  // follow the booster from liftoff to the catch, then the ship on its way down; otherwise frame the site
  function desiredTarget(st) {
    if (!mission) return REST;
    const m = mission.t;
    if (m < TL.liftoff || m >= TL.shipLand) return REST;
    if (m < TL.catch + 0.4) {
      const b = st.booster;
      return [lerp(REST[0], b.x, 0.6), Math.max(REST[1], b.y + (m < TL.stage ? 14 : 0)), REST[2]];
    }
    if (m < TL.shipBack) return REST;
    const s = st.ship;
    return [lerp(REST[0], s.x, 0.5), Math.max(REST[1], s.y - 6), lerp(REST[2], s.z || 0, 0.5)];
  }

  function draw() {
    const st = current();
    ctx.fillStyle = COL.space;
    ctx.fillRect(0, 0, W, H);
    drawStars();
    r3.setView({ W, H, yaw: cam.yaw, pitch: cam.pitch, zoom: cam.zoom, target: cam.target });
    drawGround();
    drawTower(st.arms);
    const bM = drawBooster(st.booster);
    const sM = drawShip(st.ship);
    r3.render();
    drawSmoke();
    flame(bM, st.booster.burn, R);             // flames last, so they glow through the smoke
    if (sM) flame(sM, st.ship.burn, R * 0.7);
  }

  let hudCache = '';
  function updateHud() {
    const st = current();
    let line = 'On the pad';
    if (mission) {
      const s = mission.t - TL.liftoff;
      const clock = `T${s < 0 ? '-' : '+'}00:00:${String(Math.floor(Math.abs(s < 0 ? s - 0.999 : s))).padStart(2, '0')}`;
      line = mission.t >= TL.done ? `${clock} · Double landing ✓` : s < 0 ? `${clock} · Countdown` : clock;
    }
    const alt = (y, half) => `${Math.max(0, Math.round((y - half - MOUNT_TOP) * KM))} km`;
    const flying = mission && mission.t > TL.liftoff;
    const b = `Booster · ${st.booster.phase}${flying && !/✓/.test(st.booster.phase) ? ' · ' + alt(st.booster.y, BH / 2) : ''}`;
    const s = `Ship · ${st.ship.phase}${flying && mission.t > TL.stage && st.ship.visible && !/✓/.test(st.ship.phase) ? ' · ' + alt(st.ship.y, SH / 2) : ''}`;
    const key = line + b + s;
    if (key === hudCache) return;
    hudCache = key;
    hudEl.textContent = line;
    boosterEl.textContent = b;
    shipEl.textContent = s;
    boosterEl.classList.toggle('is-done', /✓/.test(b));
    shipEl.classList.toggle('is-done', /✓/.test(s));
  }

  function update(dt) {
    t += dt;
    if (!cam.user) cam.yaw = 0.78 + Math.sin(t * 0.18) * 0.25;

    smoke = smoke.filter((p) => (p.age += dt) < p.life);
    for (const p of smoke) {
      p.x += p.vx * dt; p.y = Math.max(0.5, p.y + p.vy * dt); p.z += p.vz * dt;
      const drag = Math.exp(-dt * 1.6);
      p.vx *= drag; p.vz *= drag; p.vy *= Math.exp(-dt * 0.8);
      p.size += (p.max - p.size) * (1 - Math.exp(-dt * 1.5));
    }

    if (mission) {
      mission.t += dt;
      const st = current();
      const b = st.booster;
      if (b.burn > 0) {
        const e = pt(boosterMatrix(b), 0, -1.5, 0);
        if (e[1] < 22) emit(e[0], 1, e[2], 4, { spread: 26, up: 3, size: 6, life: 4.5 });         // billowing ground cloud
        else emit(e[0], e[1], e[2], 1, { spread: 2, up: 0, size: 2.2, life: 1.4 });              // thin trail
      }
      const s = st.ship;
      if (s.visible && s.burn > 0) {
        const e = pt(shipMatrix(s), 0, -1.5, 0);
        if (e[1] < 12) emit(PAD.x, 0.8, PAD.z, 2, { spread: 16, up: 0.6, size: 2.6, life: 2.2 });
        else if (mission.t > TL.stage) emit(e[0], e[1], e[2], 1, { spread: 2, up: 0, size: 1.8, life: 1 });
      }

      if (prev) {
        if (prev.booster.phase !== b.phase && /Caught/.test(b.phase)) window.SpaceRadio?.cue('catch');
        if (prev.ship.phase !== s.phase && /Landed/.test(s.phase)) window.SpaceRadio?.cue('landed');
      }
      prev = st;
      if (mission.t >= TL.done && launchBtn.dataset.mode !== 'reset') setButton('reset');
    }

    const want = desiredTarget(current());
    const k = 1 - Math.exp(-dt * 4);
    cam.target = cam.target.map((v, i) => v + (want[i] - v) * k);
  }

  function setButton(mode) {
    launchBtn.dataset.mode = mode;
    launchBtn.querySelector('span:last-child').textContent = mode === 'reset' ? 'Reset' : mode === 'flying' ? 'Flying' : 'Launch';
    launchBtn.disabled = mode === 'flying';
  }

  function launch() {
    if (mission) return;
    prev = null;
    if (reduce.matches) {
      mission = { t: TL.done };                 // no motion: show the end state
      setButton('reset');
      paint();
      return;
    }
    mission = { t: 0 };
    setButton('flying');
    window.SpaceRadio?.cue('launch');
    start();
  }

  function resetPad() {
    mission = null; smoke = []; prev = null;
    cam.target = REST.slice();
    setButton('launch');
    paint();
  }

  launchBtn.addEventListener('click', (e) => { e.stopPropagation(); (launchBtn.dataset.mode === 'reset' ? resetPad() : launch()); });

  function setZoom(mul) {
    cam.mul = Math.max(0.6, Math.min(3, mul));
    cam.zoom = cam.base * cam.mul;
    if (!running) paint();
  }
  root.querySelectorAll('[data-zoom]').forEach((b) => b.addEventListener('click', (e) => {
    e.stopPropagation();
    setZoom(cam.mul * (b.dataset.zoom === 'in' ? 1.3 : 1 / 1.3));
  }));
  // trackpad pinch (ctrl + wheel) zooms; plain scrolling still scrolls the page
  stage.addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    setZoom(cam.mul * Math.exp(-e.deltaY * 0.01));
  }, { passive: false });

  T3.orbitControls(stage, {
    onOrbit(dx, dy) {
      cam.user = true;
      cam.yaw -= dx * 0.012;
      cam.pitch = Math.max(0.05, Math.min(1.1, cam.pitch + dy * 0.008));
      if (!running) paint();
    },
  });

  /* ---------------- Loop + sizing ---------------- */

  function paint() { draw(); updateHud(); }

  function frame(now) {
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;
    update(dt);
    paint();
    if (running) raf = requestAnimationFrame(frame);
  }

  function start() {
    if (running || reduce.matches || !visible || document.hidden) return;
    running = true;
    last = 0;
    raf = requestAnimationFrame(frame);
  }
  function stop() { running = false; cancelAnimationFrame(raf); }

  function buildStars() {
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    stars = [];
    const n = Math.round((W * H) / 55);
    for (let i = 0; i < n; i++) stars.push({ x: Math.floor(rnd() * W), y: rnd() * H * 2, k: rnd() });
  }

  function resize() {
    const sw = stage.clientWidth, sh = stage.clientHeight;
    if (!sw || !sh) return;
    scale = Math.max(2, Math.round(sw / 150));
    W = Math.ceil(sw / scale);
    H = Math.ceil(sh / scale);
    canvas.width = W; canvas.height = H;
    canvas.style.width = `${W * scale}px`;
    canvas.style.height = `${H * scale}px`;
    cam.base = Math.min(W / 92, H / 96);
    cam.zoom = cam.base * cam.mul;
    buildStars();
    paint();
  }

  setButton('launch');
  new ResizeObserver(resize).observe(stage);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; visible ? start() : stop(); }).observe(stage);
  }
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  resize();
  start();
})();
