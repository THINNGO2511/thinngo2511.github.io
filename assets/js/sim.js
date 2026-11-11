/* About section: a pixel humanoid in a little 3D RL environment, folding laundry.
   Rendered with Tiny3D (real 3D boxes, orthographic camera ~45° from above);
   drag to orbit the room, click to shove the robot.
   Each episode it carries three shirts from the basket to the table and folds
   them. Early episodes it drops shirts a lot; the drop rate decays as episodes
   go by, so the success rate and the return curve climb while you watch. */
(() => {
  'use strict';

  const root = document.querySelector('[data-sim]');
  const T3 = window.Tiny3D;
  if (!root || !T3) return;
  const { Renderer, chain, T, S, RX, RY, RZ, pt } = T3;

  const stage = root.querySelector('[data-sim-stage]');
  const canvas = stage.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const r3 = new Renderer(ctx);
  const spark = root.querySelector('[data-spark]');
  const sctx = spark.getContext('2d');
  const hud = {
    ep: root.querySelector('[data-hud-ep]'),
    ret: root.querySelector('[data-hud-ret]'),
    rate: root.querySelector('[data-hud-rate]'),
    status: root.querySelector('[data-hud-status]'),
  };
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

  const COL = {
    bg: '#2b2b2b',
    floorA: '#343434', floorB: '#2f2f2f', wall: '#3a3a3a', wallTrim: '#4a4a4a',
    shadow: '#232323',
    body: '#ddd8cc', joint: '#8f897e', visor: '#1f1d1a', eye: '#6e9bd0', chest: '#bf5b36',
    basket: '#b8935a', basketIn: '#4a3824',
    tableTop: '#a39a8b', tableLeg: '#6a645b',
    box: '#ffd700', fail: '#e0533a', target: '#bfd6cf',
    axX: '#d0583a', axY: '#5e9a5b', axZ: '#6e9bd0', ring: '#ffd700',
  };
  const SHIRT_COLORS = ['#6e9bd0', '#bf5b36', '#5e9a5b', '#e3d2ae', '#bfd6cf', '#f2c75e'];
  const SHIRTS_PER_EPISODE = 3;
  const SPEED = 15;                                     // walking speed, units/s
  const rand = (a, b) => a + Math.random() * (b - a);
  const pad = (n, w) => String(n).padStart(w, '0');
  const pFail = (ep) => 0.06 + 0.45 * Math.exp(-(ep - 1) / 3);     // the "learning"

  /* ---------------- World (units; the robot is ~24 tall) ---------------- */

  const ROOM = { x: 46, z: 26, wall: 12 };
  const BASKET = { x: -28, z: -6, w: 12, h: 8 };
  const TABLE = { x: 22, z: 4, w: 26, d: 14, h: 10 };
  const PICK = { x: BASKET.x + 10, z: BASKET.z };
  const PLACE = { x: TABLE.x - TABLE.w / 2 - 4.5, z: TABLE.z };
  const FOLD = [TABLE.x - TABLE.w / 2 + 6, TABLE.h + 0.9, TABLE.z];
  const STACK = [TABLE.x + TABLE.w / 2 - 6, TABLE.h + 0.9, TABLE.z];

  /* ---------------- State ---------------- */

  let W = 0, H = 0, scale = 2;
  const cam = { yaw: 0.6, pitch: 0.72, zoom: 1, userYaw: null, idleT: 0 };
  let ep = 1, step = 0, ret = 0, successes = 0, finished = 0;
  const history = [];
  const robot = { x: 0, z: 0, yaw: Math.PI / 2, phase: 0, hand: [0, 0, 0] };
  let state = 'toBasket', stateT = 0;
  let basketLeft = SHIRTS_PER_EPISODE, colors = [], stack = [], held = null, onTable = null, falling = null;
  let slipAt = null;
  let stumbleT = 0;
  let pushes = [];
  let statusTimer = 0;
  let t = 0, running = false, raf = 0, last = 0, visible = true;

  /* ---------------- Robot model ---------------- */

  function pose() {
    const walking = state === 'toBasket' || state === 'toTable';
    const ph = robot.phase;
    const p = { crouch: 0, lean: 0, wobble: 0, hip: [0, 0], knee: [0, 0], sh: [0.1, 0.1], el: [0.15, 0.15] };
    if (walking) {
      [0, 1].forEach((s) => {
        const q = ph + s * Math.PI;
        p.hip[s] = Math.sin(q) * 0.55;
        p.knee[s] = Math.max(0, Math.sin(q - Math.PI / 2)) * 0.9;
        p.sh[s] = -Math.sin(q) * 0.45;
        p.el[s] = 0.3;
      });
    }
    if (state === 'pick') {
      const k = Math.min(1, stateT / 0.2) * (stateT > 0.55 ? Math.max(0, 1 - (stateT - 0.55) / 0.2) : 1);
      p.crouch = 2.4 * k; p.hip = [0.75 * k, 0.75 * k]; p.knee = [1.45 * k, 1.45 * k];
      p.lean = 0.6 * k; p.sh = [0.5 + 0.75 * k, 0.5 + 0.75 * k]; p.el = [0.3, 0.3];
    }
    if (held) { p.sh = [1.15, 1.05]; p.el = [0.35, 0.45]; }
    if (state === 'fold' || state === 'stack') {
      const w = Math.sin(t * 9) * 0.22;
      p.lean = 0.3; p.sh = [1.15 + w, 1.15 - w]; p.el = [0.1, 0.1];
    }
    if (state === 'success') { p.sh = [2.9, 2.75]; p.el = [0.1, 0.1]; }
    if (stumbleT > 0) {
      const w = Math.sin(t * 25);
      p.wobble = w * 0.18; p.sh = [2.2 + w * 0.4, 1.8 - w * 0.4]; p.el = [0.5, 0.5];
    }
    return p;
  }

  function drawRobot() {
    const p = pose();
    const shake = stumbleT > 0 ? Math.sin(stumbleT * 40) * 0.6 : 0;
    const base = chain(T(robot.x + shake, 0, robot.z), RY(robot.yaw));
    r3.disc(robot.x, 0.05, robot.z, 5, COL.shadow, { ry: 3.5 });

    const P = chain(base, T(0, 11.7 - p.crouch, 0));
    r3.box(chain(P, S(6, 2.2, 3.6)), COL.joint);

    // legs
    [-1, 1].forEach((side, s) => {
      const hip = chain(P, T(side * 1.7, -0.6, 0), RX(-p.hip[s]));
      r3.box(chain(hip, T(0, -2.7, 0), S(2.2, 5.4, 2.2)), COL.body);
      const knee = chain(hip, T(0, -5.4, 0), RX(p.knee[s]));
      r3.box(chain(knee, T(0, -2.6, 0), S(2, 5.2, 2)), COL.body);
      r3.box(chain(knee, T(0, -5.6, 0.6), S(2.3, 1.1, 3.6)), COL.joint);
    });

    // torso (leans forward from the pelvis; wobbles when shoved)
    const Tr = chain(P, T(0, 1, 0), RZ(p.wobble), RX(p.lean));
    r3.box(chain(Tr, T(0, 4.4, 0), S(7, 8, 4)), COL.body);
    r3.box(chain(Tr, T(0, 5.4, 2.05), S(2, 2, 0.3)), COL.chest);

    // head
    const Hd = chain(Tr, T(0, 8.9, 0));
    r3.box(chain(Hd, T(0, 2.6, 0), S(5.6, 5, 5)), COL.body);
    r3.box(chain(Hd, T(0, 2.8, 2.55), S(4.6, 1.7, 0.3)), COL.visor);
    [-1, 1].forEach((s) => r3.box(chain(Hd, T(s * 1.1, 2.8, 2.72), S(0.9, 0.9, 0.15)), COL.eye));
    r3.box(chain(Hd, T(0, 5.9, -1.2), S(0.6, 1.6, 0.6)), COL.joint);
    if (Math.sin(t * 4) > 0.3) r3.box(chain(Hd, T(0, 6.9, -1.2), S(0.9, 0.9, 0.9)), COL.chest);

    // arms
    const hands = [-1, 1].map((side, s) => {
      const sh = chain(Tr, T(side * 4.4, 7.4, 0), RX(-p.sh[s]));
      r3.box(chain(sh, T(0, -2.4, 0), S(1.9, 4.8, 1.9)), COL.body);
      const el = chain(sh, T(0, -4.8, 0), RX(-p.el[s]));
      r3.box(chain(el, T(0, -2.3, 0), S(1.7, 4.6, 1.7)), COL.body);
      r3.box(chain(el, T(0, -5, 0), S(2, 1.6, 2)), COL.joint);
      return pt(el, 0, -5, 0);
    });
    robot.hand = [(hands[0][0] + hands[1][0]) / 2, (hands[0][1] + hands[1][1]) / 2, (hands[0][2] + hands[1][2]) / 2];
    if (held) {
      const M = chain(T(robot.hand[0], robot.hand[1] - 0.4, robot.hand[2]), RY(robot.yaw + 0.4), S(4.4, 2.8, 3.2));
      r3.box(M, held.color);
      r3.wireBox(chain(M, S(1.45, 1.6, 1.5)), COL.box);
    }
  }

  /* ---------------- Room ---------------- */

  function drawRoom() {
    // floor tiles
    const tile = 8;
    for (let x = -ROOM.x; x < ROOM.x; x += tile) {
      for (let z = -ROOM.z; z < ROOM.z; z += tile) {
        const x1 = Math.min(x + tile, ROOM.x), z1 = Math.min(z + tile, ROOM.z);
        const c = ((x + z) / tile) & 1 ? COL.floorA : COL.floorB;
        r3.poly([[x, 0, z1], [x1, 0, z1], [x1, 0, z], [x, 0, z]], c, { layer: 0, flat: true });
      }
    }
    // walls on all four sides, facing in; only the far ones survive back-face culling
    const h = ROOM.wall, X = ROOM.x, Z = ROOM.z;
    const wall = (pts) => r3.poly(pts, COL.wall, { layer: 0 });
    wall([[-X, 0, -Z], [X, 0, -Z], [X, h, -Z], [-X, h, -Z]]);
    wall([[X, 0, Z], [-X, 0, Z], [-X, h, Z], [X, h, Z]]);
    wall([[-X, 0, Z], [-X, 0, -Z], [-X, h, -Z], [-X, h, Z]]);
    wall([[X, 0, -Z], [X, 0, Z], [X, h, Z], [X, h, -Z]]);

    // basket: an open-topped box with shirts inside
    const B = BASKET;
    r3.disc(B.x, 0.05, B.z, B.w * 0.7, COL.shadow, { ry: B.w * 0.6 });
    r3.box(chain(T(B.x, B.h / 2, B.z), S(B.w, B.h, B.w)), COL.basket, { open: 'top' });
    r3.poly([[B.x - B.w / 2 + 0.6, B.h - 0.6, B.z + B.w / 2 - 0.6], [B.x + B.w / 2 - 0.6, B.h - 0.6, B.z + B.w / 2 - 0.6],
      [B.x + B.w / 2 - 0.6, B.h - 0.6, B.z - B.w / 2 + 0.6], [B.x - B.w / 2 + 0.6, B.h - 0.6, B.z - B.w / 2 + 0.6]], COL.basketIn, { bias: -2 });
    for (let i = 0; i < basketLeft; i++) {
      const c = colors[SHIRTS_PER_EPISODE - 1 - i];
      r3.box(chain(T(B.x - 3 + i * 3, B.h - 0.2 + (i % 2) * 0.6, B.z - 2 + (i % 2) * 3), RY(i * 0.7), S(4.5, 2.4, 3.6)), c);
    }

    // table
    const Tb = TABLE;
    r3.disc(Tb.x, 0.05, Tb.z, Tb.w * 0.55, COL.shadow, { ry: Tb.d * 0.6 });
    r3.box(chain(T(Tb.x, Tb.h, Tb.z), S(Tb.w, 1.6, Tb.d)), COL.tableTop);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) =>
      r3.box(chain(T(Tb.x + sx * (Tb.w / 2 - 1.5), (Tb.h - 0.8) / 2, Tb.z + sz * (Tb.d / 2 - 1.5)), S(1.6, Tb.h - 0.8, 1.6)), COL.tableLeg));

    // folded stack, and the shirt being folded (flat T-shirt -> half -> folded)
    stack.forEach((c, i) => r3.box(chain(T(STACK[0], STACK[1] + i * 1.2, STACK[2]), S(5, 1.1, 4)), c));
    if (onTable) {
      const sizes = [[9, 0.5, 8], [6, 0.9, 8], [5, 1.1, 4]];
      const [sx, sy, sz] = sizes[onTable.stage];
      const M = chain(T(FOLD[0], FOLD[1] + sy / 2 - 0.3, FOLD[2]), S(sx, sy, sz));
      r3.box(M, onTable.color);
      if (onTable.stage === 0) {                                            // sleeves
        r3.box(chain(T(FOLD[0], FOLD[1] - 0.05, FOLD[2] - 5), S(4, 0.45, 2.4)), onTable.color);
        r3.box(chain(T(FOLD[0], FOLD[1] - 0.05, FOLD[2] + 5), S(4, 0.45, 2.4)), onTable.color);
      }
      r3.wireBox(chain(M, S(1.25, 3, 1.2)), COL.box);
    }

    // axis gizmo in a corner
    const g = [-ROOM.x + 5, 0.1, ROOM.z - 5];
    r3.line(g, [g[0] + 7, g[1], g[2]], COL.axX);
    r3.line(g, [g[0], g[1] + 7, g[2]], COL.axY);
    r3.line(g, [g[0], g[1], g[2] - 7], COL.axZ);
  }

  function drawExtras() {
    if (falling) {
      r3.disc(falling.x, 0.06, falling.z, 2.6, COL.shadow);
      const M = chain(T(falling.x, falling.y + 1.2, falling.z), RY(falling.spin), RZ(falling.roll), S(4.4, 2.4, 3.4));
      r3.box(M, falling.color);
      r3.wireBox(chain(M, S(1.4, 1.7, 1.5)), COL.fail);
    }
    if (held) {
      // place target on the table
      const [x, y, z] = FOLD;
      r3.line([x - 2, y, z], [x + 2, y, z], COL.target);
      r3.line([x, y, z - 2], [x, y, z + 2], COL.target);
    }
    pushes.forEach((p) => {
      const r = 1 + p.t * 22;
      const n = 20;
      for (let i = 0; i < n; i += 2) {
        const a = (i / n) * Math.PI * 2;
        r3.dot([p.x + Math.cos(a) * r, 0.2, p.z + Math.sin(a) * r], COL.ring);
      }
    });
  }

  function draw() {
    ctx.fillStyle = COL.bg;
    ctx.fillRect(0, 0, W, H);
    r3.setView({ W, H, yaw: cam.yaw, pitch: cam.pitch, zoom: cam.zoom, target: [0, 6, 0], oy: H * 0.06 });
    drawRoom();
    drawRobot();
    drawExtras();
    r3.render();
  }

  /* ---------------- HUD ---------------- */

  let hudCache = '';
  function updateHud() {
    const rate = finished ? Math.round((successes / finished) * 100) : 0;
    const s = `${ep}|${Math.floor(step)}|${ret.toFixed(2)}|${rate}`;
    if (s === hudCache) return;
    hudCache = s;
    hud.ep.textContent = `Episode ${pad(ep, 3)} · Step ${pad(Math.floor(step), 4)}`;
    hud.ret.textContent = `Return ${ret >= 0 ? '+' : ''}${ret.toFixed(2)}`;
    hud.rate.textContent = `Success ${rate}%`;
  }

  function setStatus(text, kind) {
    hud.status.textContent = text;
    hud.status.dataset.kind = kind;
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => { hud.status.textContent = ''; }, 1800);
  }

  function drawSpark() {
    const w = spark.width, h = spark.height;
    sctx.clearRect(0, 0, w, h);
    sctx.fillStyle = '#4d4d4d';
    const zero = Math.round(h - 1 - (1.5 / 4.5) * (h - 1));
    for (let x = 0; x < w; x += 2) sctx.fillRect(x, zero, 1, 1);
    if (!history.length) return;
    sctx.fillStyle = COL.box;
    const n = history.length;
    let prev = null;
    history.forEach((v, i) => {
      const x = n === 1 ? w - 1 : Math.round((i / (n - 1)) * (w - 1));
      const y = Math.round(h - 1 - ((Math.max(-1.5, Math.min(3, v)) + 1.5) / 4.5) * (h - 1));
      if (prev) {
        const steps = Math.max(Math.abs(x - prev[0]), Math.abs(y - prev[1]), 1);
        for (let s = 0; s <= steps; s++) sctx.fillRect(Math.round(prev[0] + ((x - prev[0]) * s) / steps), Math.round(prev[1] + ((y - prev[1]) * s) / steps), 1, 1);
      } else sctx.fillRect(x, y, 1, 1);
      prev = [x, y];
    });
  }

  /* ---------------- Episode logic ---------------- */

  function shuffled(arr) { return arr.map((v) => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map((p) => p[1]); }

  function resetEpisode() {
    step = 0; ret = 0;
    basketLeft = SHIRTS_PER_EPISODE;
    colors = shuffled(SHIRT_COLORS).slice(0, SHIRTS_PER_EPISODE);
    stack = []; held = null; onTable = null; falling = null;
    robot.x = (PICK.x + PLACE.x) / 2; robot.z = (PICK.z + PLACE.z) / 2 + 6;
    go('toBasket');
  }

  function endEpisode(success) {
    finished++;
    if (success) successes++;
    history.push(ret);
    if (history.length > 40) history.shift();
    ep++;
    drawSpark();
  }

  function go(next) {
    state = next;
    stateT = 0;
    if (next === 'pick') robot.yaw = -Math.PI / 2;
    if (next === 'fold') { onTable = { color: held.color, stage: 0 }; held = null; robot.yaw = Math.PI / 2; }
    if (next === 'success') setStatus('Success · all shirts folded', 'ok');
  }

  function drop(reason) {
    const [hx, hy, hz] = robot.hand;
    falling = { x: hx, y: hy, z: hz, vy: 6, vx: Math.sin(robot.yaw) * rand(4, 9), vz: Math.cos(robot.yaw) * rand(4, 9), spin: 0, roll: 0, color: held.color };
    held = null;
    ret -= 1;
    stumbleT = 0.6;
    setStatus(`Terminated: ${reason}`, 'fail');
    go('dropped');
  }

  function walkTo(target, dt) {
    const dx = target.x - robot.x, dz = target.z - robot.z;
    const d = Math.hypot(dx, dz);
    const move = SPEED * dt;
    if (d <= move) { robot.x = target.x; robot.z = target.z; return true; }
    const want = Math.atan2(dx, dz);
    let diff = want - robot.yaw;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    robot.yaw += diff * Math.min(1, dt * 10);
    robot.x += (dx / d) * move;
    robot.z += (dz / d) * move;
    robot.phase += move * 0.5;
    return false;
  }

  function carryProgress() {
    const total = Math.hypot(PLACE.x - PICK.x, PLACE.z - PICK.z) || 1;
    return 1 - Math.hypot(PLACE.x - robot.x, PLACE.z - robot.z) / total;
  }

  function update(dt) {
    stateT += dt;
    if (stumbleT > 0) stumbleT = Math.max(0, stumbleT - dt);
    pushes = pushes.filter((p) => (p.t += dt) < 0.45);
    if (state !== 'dropped' && state !== 'success') { step += dt * 30; ret -= dt * 0.02; }

    // when nobody's dragging, the camera drifts gently so the room reads as 3D
    cam.idleT += dt;
    if (cam.userYaw == null) cam.yaw = 0.6 + Math.sin(t * 0.25) * 0.28;

    switch (state) {
      case 'toBasket':
        if (stumbleT > 0) break;
        if (walkTo(PICK, dt)) go('pick');
        break;
      case 'pick':
        if (stateT > 0.75) {
          held = { color: colors[SHIRTS_PER_EPISODE - basketLeft] };
          basketLeft--;
          slipAt = Math.random() < pFail(ep) ? rand(0.2, 0.8) : null;
          go('toTable');
        }
        break;
      case 'toTable':
        if (stumbleT > 0) break;
        if (slipAt != null && carryProgress() >= slipAt) { slipAt = null; drop('dropped_shirt'); break; }
        if (walkTo(PLACE, dt)) go('fold');
        break;
      case 'fold':
        onTable.stage = Math.min(2, Math.floor(stateT / 0.5));
        if (stateT > 1.5) go('stack');
        break;
      case 'stack':
        if (stateT > 0.3) {
          stack.push(onTable.color);
          onTable = null;
          ret += 1;
          go(basketLeft === 0 ? 'success' : 'toBasket');
        }
        break;
      case 'dropped':
        if (falling && falling.y > 0) {
          falling.vy -= 40 * dt;
          falling.y = Math.max(0, falling.y + falling.vy * dt);
          falling.x += falling.vx * dt; falling.z += falling.vz * dt;
          falling.spin += dt * 5; falling.roll += dt * 3;
          if (falling.y === 0) { falling.roll = 0; }
        }
        if (stateT > 1.8) { endEpisode(false); resetEpisode(); }
        break;
      case 'success':
        if (stateT > 1.4) { endEpisode(true); resetEpisode(); }
        break;
      default:
    }
  }

  /* ---------------- Input: drag to orbit, click to shove ---------------- */

  T3.orbitControls(stage, {
    onOrbit(dx, dy) {
      cam.userYaw = true;
      cam.yaw -= dx * 0.012;
      cam.pitch = Math.max(0.3, Math.min(1.25, cam.pitch + dy * 0.008));
      if (!running) draw();
    },
    onTap(e) {
      if (reduce.matches) return;
      const rect = canvas.getBoundingClientRect();
      const sx = ((e.clientX - rect.left) / rect.width) * W;
      const sy = ((e.clientY - rect.top) / rect.height) * H;
      const [x, , z] = r3.unproject(sx, sy, 0);
      pushes.push({ x, z, t: 0 });
      if (state === 'dropped' || state === 'success') return;
      if (held) { drop('perturbed'); return; }
      stumbleT = 0.5;
      setStatus('Perturbation', 'warn');
    },
  });

  /* ---------------- Loop + sizing ---------------- */

  function frame(now) {
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;
    t += dt;
    update(dt);
    draw();
    updateHud();
    if (running) raf = requestAnimationFrame(frame);
  }

  function start() {
    if (running || reduce.matches || !visible || document.hidden) return;
    running = true;
    last = 0;
    raf = requestAnimationFrame(frame);
  }
  function stop() { running = false; cancelAnimationFrame(raf); }

  // Reduced motion: one still frame of the robot carrying a shirt.
  function still() {
    resetEpisode();
    held = { color: colors[0] };
    basketLeft = SHIRTS_PER_EPISODE - 1;
    state = 'toTable';
    robot.x = PICK.x + (PLACE.x - PICK.x) * 0.55;
    robot.z = PICK.z + (PLACE.z - PICK.z) * 0.55;
    robot.yaw = Math.atan2(PLACE.x - PICK.x, PLACE.z - PICK.z);
    draw();
    updateHud();
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
    spark.width = 48; spark.height = 14;
    const sp = Math.max(2, Math.min(4, scale - 2));
    spark.style.width = `${48 * sp}px`;
    spark.style.height = `${14 * sp}px`;
    cam.zoom = Math.min(W / 104, H / 74);
    drawSpark();
    // resizing a canvas clears it, so repaint right away rather than waiting for the next frame
    if (reduce.matches) still(); else { draw(); updateHud(); }
  }

  resetEpisode();
  new ResizeObserver(resize).observe(stage);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; visible ? start() : stop(); }).observe(stage);
  }
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  reduce.addEventListener?.('change', () => { if (reduce.matches) { stop(); still(); } else start(); });
  resize();
  start();
})();
