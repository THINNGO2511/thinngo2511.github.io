/* Contact section: "a few places I've been", on a dotted globe you can drag
   to turn and zoom. Land comes from a 180x90 bitmask (2° cells) rasterized
   from Natural Earth's 1:110m land polygons (public domain).
   The dots are pinned to the globe's surface (an even lat/lon grid), so they
   glide with it as it turns instead of shimmering. Arcs run from Houston to
   each place: red, except the one to the SF Bay Area, which is yellow. */
(() => {
  'use strict';

  const root = document.querySelector('[data-globe]');
  const T3 = window.Tiny3D;
  if (!root) return;
  const stage = root.querySelector('[data-globe-stage]');
  const canvas = stage.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const labelLayer = root.querySelector('[data-globe-labels]');
  const hudEl = root.querySelector('[data-globe-hud]');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* ---------------- Land ---------------- */
  const MASK_W = 180, MASK_H = 90;
  const MASK = Uint8Array.from(atob('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAf4AP/AAAAAAAAAAAAAAAAAAAAAAAAX/z///+AAAAAAAABAAAAAAAAAAAAAYd8P///wAA+AAAAAA8AAAAAAAAAAAwAnw////4AAIAAAAAAGAAAAAAAAAAADivwAf//wAAAAADAAf/wAHYAAAAAADoi3sAP//gAAAAAMAD///sAAAAgBgACfwz/AD/+gAAAwAEHf8AABADf+AP4EAY2icP8AB///4A//EgAAAAAAAgHwAAAAAAeD4Af///gAFAAgAAAAAAAAzgAAAAAC4H8D/h//BhQAAAAAAAAAAAAP/////4A0B4AAAD5/////////////Af3////gHgA4AAAH5///////////LwAHgH///gHkAAAAAH4/////////+CIAABAB///4D+AAAAGCx/////////4A8AAIAAf///n/gAAAOCD/////////wA4AAAAAf///n/wAAAbP///////////AgAAAAAP/////wAAADf//////////9AAAAAAAF////0YAAAB///////////9AAAAAAAD////8EAAAB///////////5AAAAAAAD////2AAAAB/f5fP//////wAAAAAAAD////gAAAAfxnwPP//////jAAAAAAAD////AAAAAPCb3/n/////+CAAAAAAAD///8AAAAAfALf/n////+ECAAAAAAAB///8AAAAAGHQP/n/////mMAAAAAAAA///8AAAAAH+Ai///////E8AAAAAAAAf//wAAAAAP/AA///////BgAAAAAAAAP//gAAAAAf/73///////gAAAAAAAAAD/AQAAAAAf////f/////gAAAAAAAAAF+AQAAAAB///+/n/////AAAAAAAAAAC+AAAAAAB///+f0H////AAAAAAAAAAAeAwAAAAD////f/B///8gAAAAAAAAAAeGEAAAAH////v+B/z/AAAAAAAAAAAAPMAgAAAD////n+A/B+gAAAAAAAAAAAD8AAAAAD////n4AeB/AgAAAAAAAAAAAPAAAAAH////3gAcAfAgAAAAAAAAAAADAAAAAD////6AAcAfggAAAAAAAAAAABDwAAAD////8wAMATAIAAAAAAAAAAAAr/AAAB/////gAKASAAAAAAAAAAAAAAH/gAAA/////gACAAAIAAAAAAAAAAAAH/8AAAaH///AAAAsGAAAAAAAAAAAAAH/+AAAAB//+AAAAUOAAAAAAAAAAAAAP/+AAAAB//8AAAAYegAAAAAAAAAAAAP//gAAAD//4AAAAMeBgAAAAAAAAAAAP//8AAAB//wAAAAGdiuAAAAAAAAAAAf///AAAA//wAAAACAQHgAAAAAAAAAAP///gAAA//wAAAABwAHwgAAAAAAAAAH///AAAA//wAAAAACIDQIAAAAAAAAAH//+AAAAf/wAAAAAAAAAAAAAAAAAAAD//+AAAA//wgAAAAABxAAAAAAAAAAAD//+AAAA//wgAAAAAPxgBAAAAAAAAAA//8AAAA//jgAAAAAf5gAAAAAAAAAAAf/8AAAA//DgAAAAAf/gAAAAAAAAAAAf/8AAAAf/DAAAAAD//4CAAAAAAAAAAf/wAAAAf/DAAAAAH//4AAAAAAAAAAAf/AAAAAf+CAAAAAH//8AAAAAAAAAAAf/AAAAAP8AAAAAAH//+AAAAAAAAAAA/+AAAAAP8AAAAAAH//+AAAAAAAAAAA/+AAAAAH4AAAAAAD//+AAAAAAAAAAA/8AAAAAHwAAAAAADwf8AAAAAAAAAAA/gAAAAAAAAAAAAACAH4AIAAAAAAAAB/wAAAAAAAAAAAAAAAD4AEAAAAAAAAB+AAAAAAAAAAAAAAAAAAAGAAAAAAAAB6AAAAAAAAAAAAAAAAAwAMAAAAAAAAA8AAAAAAAAAAAAAAAAAQAYAAAAAAAAB4AAAAAAAAAAAAAAAAAAAwAAAAAAAAB4AAAAAAAAAAAAAAAAAAAAAAAAAAAADwAAAAAAAAAACAAAAAAAAAAAAAAAAADgAAAAAAAAAAAAAAAAAAAAAAAAAAAABwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMAAAAAAAAAeAAIP+f/gAAAAAAAAAAAMAAAAAAABP/+H//////AAAAAAAAAAA+AAAAAf////8////////AAAAAAAOEAPAAAB///////////////gAAAP//T//8AAAH//////////////+AAAH/////4AAAH///////////////8AAE//////4ABw////////////////8AAAD//////gCA////////////////wAAAf/////////////////////////+AAH/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'), (c) => c.charCodeAt(0));
  const isLand = (lat, lon) => {
    const c = Math.min(MASK_W - 1, Math.max(0, Math.floor(((lon + 180) / 360) * MASK_W)));
    const r = Math.min(MASK_H - 1, Math.max(0, Math.floor(((90 - lat) / 180) * MASK_H)));
    const i = r * MASK_W + c;
    return (MASK[i >> 3] >> (7 - (i & 7))) & 1;
  };

  const RAD = Math.PI / 180;
  const vec = (lat, lon) => {
    const p = lat * RAD, l = lon * RAD;
    return [Math.cos(p) * Math.sin(l), Math.sin(p), Math.cos(p) * Math.cos(l)];
  };

  // evenly spaced dots on land (roughly constant spacing, not crowded at the poles)
  const STEP = 2.2;
  const DOTS = [];
  for (let lat = -84; lat <= 84; lat += STEP) {
    const lonStep = STEP / Math.max(0.12, Math.cos(lat * RAD));
    for (let lon = -180 + ((lat * 7) % lonStep); lon < 180; lon += lonStep) {
      if (isLand(lat, lon)) DOTS.push(vec(lat, lon));
    }
  }

  /* ---------------- Places ---------------- */
  const COL = {
    sphere: '#262626', rim: '#3b3b3b',
    land: ['#d7d2c8', '#a8a399', '#77736b', '#4d4a46'],
    red: '#d9442e', redDim: '#7a2b20', yellow: '#ffd700', yellowDim: '#8a7420',
    pin: '#f2efe8', star0: '#3f3f3f', star1: '#555555',
  };
  const HOME = { lat: 29.76, lon: -95.37 };                     // Houston, where the arcs start
  const PLACES = [
    { name: 'SF Bay Area', lat: 37.6, lon: -122.2, color: COL.yellow, dim: COL.yellowDim, primary: true, dx: -1, dy: -1 },
    { name: 'Seattle', lat: 47.61, lon: -122.33, dx: -1, dy: -1 },
    { name: 'Los Angeles', lat: 34.05, lon: -118.24, dx: -1, dy: 1 },
    { name: 'Chicago', lat: 41.88, lon: -87.63, dx: 1, dy: -1 },
    { name: 'Florida', lat: 28.54, lon: -81.38, dx: 1, dy: 1 },
    { name: 'Zurich', lat: 47.38, lon: 8.54, dx: 1, dy: -1 },
    { name: 'Texas', lat: 30.6, lon: -97.4, dx: -1, dy: 1, noArc: true },
  ];
  const TEXAS_DOTS = [[29.76, -95.37], [30.27, -97.74], [32.78, -96.8], [29.42, -98.49], [31.76, -106.49], [27.8, -97.4]].map(([a, b]) => vec(a, b));

  // great-circle arc from Houston, lifted off the surface in proportion to its length
  function arc(to, n = 64) {
    const A = vec(HOME.lat, HOME.lon), B = vec(to.lat, to.lon);
    const om = Math.acos(Math.max(-1, Math.min(1, A[0] * B[0] + A[1] * B[1] + A[2] * B[2])));
    const lift = 0.06 + 0.32 * (om / Math.PI);
    return Array.from({ length: n + 1 }, (_, i) => {
      const s = i / n;
      const k1 = Math.sin((1 - s) * om) / Math.sin(om), k2 = Math.sin(s * om) / Math.sin(om);
      const h = 1 + lift * Math.sin(Math.PI * s);
      return [(A[0] * k1 + B[0] * k2) * h, (A[1] * k1 + B[1] * k2) * h, (A[2] * k1 + B[2] * k2) * h];
    });
  }
  PLACES.forEach((p) => { p.v = vec(p.lat, p.lon); if (!p.noArc) p.arc = arc(p); });

  /* ---------------- View ---------------- */
  let W = 0, H = 0, scale = 2, baseR = 10;
  const view = { lon: -55, lat: 30, zoom: 1, dragging: false, idleAt: -10 };
  let t = 0, running = false, raf = 0, last = 0, visible = true;
  let stars = [];

  const R = () => baseR * view.zoom;
  function toView(v) {
    const l = -view.lon * RAD, p = view.lat * RAD;
    const x1 = v[0] * Math.cos(l) + v[2] * Math.sin(l);
    const z1 = -v[0] * Math.sin(l) + v[2] * Math.cos(l);
    return [x1, v[1] * Math.cos(p) - z1 * Math.sin(p), v[1] * Math.sin(p) + z1 * Math.cos(p)];
  }
  const screen = (v) => [W / 2 + v[0] * R(), H / 2 - v[1] * R()];
  const hidden = (v) => v[2] < 0 && v[0] * v[0] + v[1] * v[1] < 1;

  /* ---------------- Drawing ---------------- */

  function drawStars() {
    const fade = 0.2 * Math.min(W, H);
    for (const s of stars) {
      const edge = Math.min(s.x, W - s.x, s.y, H - s.y) / fade;
      if (s.k * 1.1 > edge + 0.2) continue;
      ctx.fillStyle = s.k > 0.85 ? COL.star1 : COL.star0;
      ctx.fillRect(s.x, s.y, 1, 1);
    }
  }

  function drawSphere() {
    const r = R();
    ctx.fillStyle = COL.rim;
    ctx.beginPath(); ctx.arc(W / 2, H / 2, r + 0.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = COL.sphere;
    ctx.beginPath(); ctx.arc(W / 2, H / 2, r - 0.5, 0, Math.PI * 2); ctx.fill();
  }

  function drawLand() {
    for (const d of DOTS) {
      const v = toView(d);
      if (v[2] <= 0.02) continue;
      const [sx, sy] = screen(v);
      ctx.fillStyle = COL.land[v[2] > 0.55 ? 0 : v[2] > 0.3 ? 1 : v[2] > 0.14 ? 2 : 3];
      ctx.fillRect(Math.round(sx), Math.round(sy), 1, 1);
    }
  }

  function drawArcs() {
    PLACES.forEach((p, idx) => {
      if (!p.arc) return;
      const pts = p.arc.map(toView);
      const bright = p.color || COL.red, dim = p.dim || COL.redDim;
      // dotted line, with a brighter dash travelling from Houston outward
      const head = ((t * 0.32 + idx * 0.17) % 1.3) * (pts.length - 1);
      pts.forEach((v, i) => {
        if (hidden(v)) return;
        const near = i <= head && i > head - 10;
        if (!near && i % 2) return;
        const [sx, sy] = screen(v);
        ctx.fillStyle = near ? bright : (p.primary ? bright : dim);
        ctx.fillRect(Math.round(sx), Math.round(sy), 1, 1);
      });
    });
  }

  function drawPins() {
    TEXAS_DOTS.forEach((d) => {
      const v = toView(d);
      if (v[2] <= 0.05) return;
      const [sx, sy] = screen(v);
      ctx.fillStyle = COL.red;
      ctx.fillRect(Math.round(sx), Math.round(sy), 2, 2);
    });
    PLACES.forEach((p) => {
      const v = toView(p.v);
      p.visible = v[2] > 0.08;
      p.screen = screen(v);
      if (!p.visible || p.noArc) return;
      const [sx, sy] = p.screen;
      ctx.fillStyle = p.primary ? COL.yellow : COL.pin;
      ctx.fillRect(Math.round(sx) - 1, Math.round(sy) - 1, 3, 3);
      if (p.primary) {
        const rr = 3 + ((t * 3) % 6);
        for (let i = 0; i < 20; i += 2) {
          const a = (i / 20) * Math.PI * 2;
          ctx.fillRect(Math.round(sx + Math.cos(a) * rr), Math.round(sy + Math.sin(a) * rr), 1, 1);
        }
      }
    });
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    drawStars();
    drawSphere();
    drawLand();
    drawArcs();
    drawPins();
    placeLabels();
  }

  /* ---------------- Labels + HUD ---------------- */

  const labels = PLACES.map((p) => {
    const el = document.createElement('span');
    el.className = 'globe__label' + (p.primary ? ' is-primary' : '');
    el.textContent = p.name;
    labelLayer.appendChild(el);
    return el;
  });

  function placeLabels() {
    const ox = (stage.clientWidth - W * scale) / 2;
    const oy = (stage.clientHeight - H * scale) / 2;
    PLACES.forEach((p, i) => {
      const el = labels[i];
      const inside = p.visible && p.screen[0] > 0 && p.screen[0] < W && p.screen[1] > 0 && p.screen[1] < H;
      el.style.visibility = inside ? '' : 'hidden';
      if (!inside) return;
      const gap = 5;
      const x = ox + p.screen[0] * scale + (p.dx < 0 ? -el.offsetWidth - gap : gap);
      const y = oy + p.screen[1] * scale + (p.dy < 0 ? -el.offsetHeight - gap : gap);
      el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    });
  }

  const clock = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit' });
  function updateHud() {
    const s = `SF Bay Area · ${clock.format(new Date())} PT`;
    if (hudEl.textContent !== s) hudEl.textContent = s;
  }

  /* ---------------- Interaction ---------------- */

  function setZoom(z) {
    view.zoom = Math.max(0.8, Math.min(3, z));
    if (!running) draw();
  }

  if (T3) {
    T3.orbitControls(stage, {
      onDragStart() { view.dragging = true; },
      onOrbit(dx, dy) {
        view.idleAt = t;
        const k = 180 / (Math.PI * R() * scale);           // pixels -> degrees at the globe's center
        view.lon -= dx * k;
        view.lat = Math.max(-75, Math.min(75, view.lat + dy * k));
        if (!running) draw();
      },
    });
    stage.addEventListener('pointerup', () => { view.dragging = false; });
  }
  root.querySelectorAll('[data-zoom]').forEach((b) => b.addEventListener('click', (e) => {
    e.stopPropagation();
    setZoom(view.zoom * (b.dataset.zoom === 'in' ? 1.3 : 1 / 1.3));
  }));
  // trackpad pinch (ctrl + wheel) zooms; plain scrolling still scrolls the page
  stage.addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    setZoom(view.zoom * Math.exp(-e.deltaY * 0.01));
  }, { passive: false });

  /* ---------------- Loop ---------------- */

  function update(dt) {
    t += dt;
    // when nobody's touching it, drift back and sway slowly between the US and Europe
    if (!view.dragging && t - view.idleAt > 3) {
      // zoomed in, settle over the US (where most of the pins are) instead of the Atlantic
      const z = Math.max(0, Math.min(1, (view.zoom - 1) / 0.8));
      const target = -55 + (-98 + 55) * z + Math.sin(t * 0.12) * 18 * (1 - z * 0.7);
      const diff = ((target - view.lon + 540) % 360) - 180;
      const k = 1 - Math.exp(-dt * 0.8);
      view.lon += diff * k;
      view.lat += (30 + 7 * z - view.lat) * k;
    }
  }

  function frame(now) {
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;
    update(dt);
    draw();
    if (running) raf = requestAnimationFrame(frame);
  }

  function start() {
    if (running || reduce.matches || !visible || document.hidden) return;
    running = true;
    last = 0;
    raf = requestAnimationFrame(frame);
  }
  function stop() { running = false; cancelAnimationFrame(raf); }

  function resize() {
    const sw = stage.clientWidth, sh = stage.clientHeight;
    if (!sw || !sh) return;
    scale = 2;                                             // finer dots than the other scenes, easier on the eyes
    W = Math.ceil(sw / scale);
    H = Math.ceil(sh / scale);
    canvas.width = W; canvas.height = H;
    canvas.style.width = `${W * scale}px`;
    canvas.style.height = `${H * scale}px`;
    baseR = Math.floor(Math.min(W, H) * 0.4);
    let seed = 5;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    stars = Array.from({ length: Math.round((W * H) / 260) }, () => ({ x: Math.floor(rnd() * W), y: Math.floor(rnd() * H), k: rnd() }));
    draw();
    updateHud();
  }

  new ResizeObserver(resize).observe(stage);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; visible ? start() : stop(); }).observe(stage);
  }
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  resize();
  start();
  setInterval(updateHud, 15000);
})();
