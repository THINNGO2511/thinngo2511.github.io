/* Tiny3D: a minimal software 3D renderer for low-resolution pixel scenes.
   - Orthographic camera that orbits a target (yaw, pitch, zoom).
   - Boxes, cylinders and cones built from 3x4 affine transforms.
   - Flat shading in a few posterized tones, back-face culling, and a
     painter's sort; every face is filled one scanline at a time on the
     integer pixel grid, so edges stay crisp when CSS scales the canvas up.
   Used by the robot room (About) and the Starship scene (Career). */
window.Tiny3D = (() => {
  'use strict';

  /* ---------- 3x4 affine matrices (row-major) ---------- */
  const mul = (A, B) => [
    A[0] * B[0] + A[1] * B[4] + A[2] * B[8], A[0] * B[1] + A[1] * B[5] + A[2] * B[9], A[0] * B[2] + A[1] * B[6] + A[2] * B[10], A[0] * B[3] + A[1] * B[7] + A[2] * B[11] + A[3],
    A[4] * B[0] + A[5] * B[4] + A[6] * B[8], A[4] * B[1] + A[5] * B[5] + A[6] * B[9], A[4] * B[2] + A[5] * B[6] + A[6] * B[10], A[4] * B[3] + A[5] * B[7] + A[6] * B[11] + A[7],
    A[8] * B[0] + A[9] * B[4] + A[10] * B[8], A[8] * B[1] + A[9] * B[5] + A[10] * B[9], A[8] * B[2] + A[9] * B[6] + A[10] * B[10], A[8] * B[3] + A[9] * B[7] + A[10] * B[11] + A[11],
  ];
  const chain = (...ms) => ms.reduce(mul);
  const T = (x, y, z) => [1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z];
  const S = (x, y = x, z = x) => [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0];
  const RX = (a) => { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0]; };
  const RY = (a) => { const c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0]; };
  const RZ = (a) => { const c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0]; };
  const pt = (M, x, y, z) => [
    M[0] * x + M[1] * y + M[2] * z + M[3],
    M[4] * x + M[5] * y + M[6] * z + M[7],
    M[8] * x + M[9] * y + M[10] * z + M[11],
  ];

  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const norm = (a) => { const m = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / m, a[1] / m, a[2] / m]; };

  /* ---------- colors ---------- */
  const toneCache = new Map();
  function tone(hex, k) {
    const key = hex + '|' + k;
    let v = toneCache.get(key);
    if (!v) {
      const n = parseInt(hex.slice(1), 16);
      const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((x) => Math.max(0, Math.min(255, Math.round(x * k))));
      v = `rgb(${c[0]},${c[1]},${c[2]})`;
      toneCache.set(key, v);
    }
    return v;
  }

  // unit cube faces, counter-clockwise seen from outside
  const CUBE = [
    [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]],      // +z
    [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]],  // -z
    [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]],      // +x
    [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]],  // -x
    [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]],      // +y
    [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]],  // -y
  ].map((f) => f.map((v) => v.map((c) => c * 0.5)));

  class Renderer {
    constructor(ctx) {
      this.ctx = ctx;
      this.faces = [];
      this.overlay = [];
      this.light = norm([-0.5, 0.85, 0.35]);
      this.tones = [0.58, 0.74, 0.88, 1.0, 1.1];
    }

    // yaw: orbit around the vertical axis; pitch: how far we look down (radians)
    setView({ W, H, yaw, pitch, zoom, target, ox = 0, oy = 0 }) {
      this.W = W; this.H = H; this.zoom = zoom;
      this.cx = W / 2 + ox; this.cy = H / 2 + oy;
      this.target = target;
      this.V = chain(RX(pitch), RY(-yaw), T(-target[0], -target[1], -target[2]));
      this.toCam = [this.V[8], this.V[9], this.V[10]];       // camera +z, in world space
      this.faces.length = 0;
      this.overlay.length = 0;
    }

    project(p) {
      const v = pt(this.V, p[0], p[1], p[2]);
      return [this.cx + v[0] * this.zoom, this.cy - v[1] * this.zoom, v[2]];
    }

    // screen point -> world point on the horizontal plane y = planeY
    unproject(sx, sy, planeY = 0) {
      const xc = (sx - this.cx) / this.zoom, yc = -(sy - this.cy) / this.zoom;
      const V = this.V;
      // world = R^T * (xc, yc, zc) + target; solve for zc so world.y = planeY
      const R0 = [V[0], V[4], V[8]], R1 = [V[1], V[5], V[9]], R2 = [V[2], V[6], V[10]];
      const zc = (planeY - this.target[1] - (R1[0] * xc + R1[1] * yc)) / (R1[2] || 1e-6);
      return [
        R0[0] * xc + R0[1] * yc + R0[2] * zc + this.target[0],
        planeY,
        R2[0] * xc + R2[1] * yc + R2[2] * zc + this.target[2],
      ];
    }

    shadeFor(n) {
      const lit = 0.5 + 0.5 * dot(n, this.light);
      return this.tones[Math.min(this.tones.length - 1, Math.floor(lit * this.tones.length))];
    }

    // convex polygon in world space, counter-clockwise from its front
    poly(pts, color, { layer = 2, twoSided = false, flat = false, bias = 0 } = {}) {
      let n = norm(cross(sub(pts[1], pts[0]), sub(pts[2], pts[0])));
      if (dot(n, this.toCam) <= 0) {
        if (!twoSided) return;
        n = [-n[0], -n[1], -n[2]];
      }
      const proj = pts.map((p) => this.project(p));
      let depth = 0;
      for (const p of proj) depth += p[2];
      this.faces.push({ pts: proj, depth: depth / proj.length + bias, layer, fill: flat ? color : tone(color, this.shadeFor(n)) });
    }

    box(M, color, opts = {}) {
      const colors = opts.faces || {};
      const keys = ['front', 'back', 'right', 'left', 'top', 'bottom'];
      CUBE.forEach((f, i) => {
        if (opts.open === keys[i]) return;
        this.poly(f.map((v) => pt(M, v[0], v[1], v[2])), colors[keys[i]] || color, opts);
      });
    }

    // unit cylinder: radius 1, from y = 0 to y = 1; rTop < 1 makes a frustum, 0 a cone
    cylinder(M, color, { sides = 12, rTop = 1, caps = true, colorAt = null, ...opts } = {}) {
      const ring = (r, y) => Array.from({ length: sides }, (_, i) => {
        const a = (i / sides) * Math.PI * 2;
        return pt(M, Math.cos(a) * r, y, Math.sin(a) * r);
      });
      const bot = ring(1, 0), top = ring(rTop, 1);
      for (let i = 0; i < sides; i++) {
        const j = (i + 1) % sides;
        const c = colorAt ? colorAt(i, sides) : color;
        const quad = rTop > 0 ? [bot[j], bot[i], top[i], top[j]] : [bot[j], bot[i], top[i]];
        this.poly(quad, c, opts);
      }
      if (caps) {
        this.poly(bot.slice(), color, opts);
        if (rTop > 0) this.poly(top.slice().reverse(), color, opts);
      }
    }

    // flat disc on a horizontal plane (shadows, pads)
    disc(cx, y, cz, r, color, { sides = 14, layer = 1, ry = r } = {}) {
      const pts = Array.from({ length: sides }, (_, i) => {
        const a = -(i / sides) * Math.PI * 2;
        return [cx + Math.cos(a) * r, y, cz + Math.sin(a) * ry];
      });
      this.poly(pts, color, { layer, flat: true, twoSided: true });
    }

    // lines and dots drawn on top of everything (wireframes, markers)
    line(a, b, color, { dotted = false } = {}) { this.overlay.push({ kind: 'line', a: this.project(a), b: this.project(b), color, dotted }); }
    dot(p, color, size = 1) { this.overlay.push({ kind: 'dot', p: this.project(p), color, size }); }

    wireBox(M, color, dotted = true) {
      const v = (x, y, z) => pt(M, x * 0.5, y * 0.5, z * 0.5);
      const c = [v(-1, -1, -1), v(1, -1, -1), v(1, 1, -1), v(-1, 1, -1), v(-1, -1, 1), v(1, -1, 1), v(1, 1, 1), v(-1, 1, 1)];
      [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]
        .forEach(([i, j]) => this.line(c[i], c[j], color, { dotted }));
    }

    fill(pts, color) {
      const ctx = this.ctx, H = this.H;
      let minY = Infinity, maxY = -Infinity;
      for (const p of pts) { if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1]; }
      const y0 = Math.max(0, Math.ceil(minY - 0.5)), y1 = Math.min(H - 1, Math.floor(maxY - 0.5));
      if (y1 < y0) return;
      ctx.fillStyle = color;
      const n = pts.length;
      for (let y = y0; y <= y1; y++) {
        const sy = y + 0.5;
        let xa = Infinity, xb = -Infinity;
        for (let i = 0; i < n; i++) {
          const p = pts[i], q = pts[(i + 1) % n];
          if ((p[1] <= sy && q[1] > sy) || (q[1] <= sy && p[1] > sy)) {
            const x = p[0] + ((sy - p[1]) * (q[0] - p[0])) / (q[1] - p[1]);
            if (x < xa) xa = x;
            if (x > xb) xb = x;
          }
        }
        if (xb < xa) continue;
        const ia = Math.max(0, Math.ceil(xa - 0.5)), ib = Math.min(this.W - 1, Math.floor(xb - 0.5));
        if (ib >= ia) ctx.fillRect(ia, y, ib - ia + 1, 1);
      }
    }

    drawLine(a, b, color, dotted) {
      const ctx = this.ctx;
      let x0 = Math.round(a[0]), y0 = Math.round(a[1]);
      const x1 = Math.round(b[0]), y1 = Math.round(b[1]);
      const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
      let err = dx + dy, k = 0;
      ctx.fillStyle = color;
      for (let guard = 0; guard < 4000; guard++) {
        if (!dotted || k % 2 === 0) ctx.fillRect(x0, y0, 1, 1);
        k++;
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 >= dy) { err += dy; x0 += sx; }
        if (e2 <= dx) { err += dx; y0 += sy; }
      }
    }

    render() {
      this.faces.sort((a, b) => (a.layer - b.layer) || (a.depth - b.depth));
      for (const f of this.faces) this.fill(f.pts, f.fill);
      for (const o of this.overlay) {
        if (o.kind === 'line') this.drawLine(o.a, o.b, o.color, o.dotted);
        else { this.ctx.fillStyle = o.color; this.ctx.fillRect(Math.round(o.p[0] - (o.size - 1) / 2), Math.round(o.p[1] - (o.size - 1) / 2), o.size, o.size); }
      }
    }
  }

  // Drag to orbit, tap/click to "act"; returns a small controller.
  function orbitControls(el, { onOrbit, onTap, onDragStart }) {
    let down = null;
    el.addEventListener('pointerdown', (e) => {
      down = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, moved: false, id: e.pointerId };
    });
    el.addEventListener('pointermove', (e) => {
      if (!down || e.pointerId !== down.id) return;
      const dx = e.clientX - down.lx, dy = e.clientY - down.ly;
      if (!down.moved && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) {
        down.moved = true;
        try { el.setPointerCapture(e.pointerId); } catch (err) { /* not capturable */ }
        el.classList.add('is-dragging');
        onDragStart && onDragStart();
      }
      if (down.moved) onOrbit(dx, dy);
      down.lx = e.clientX; down.ly = e.clientY;
    });
    const end = (e) => {
      if (!down || e.pointerId !== down.id) return;
      if (!down.moved && e.type === 'pointerup') onTap && onTap(e);
      el.classList.remove('is-dragging');
      down = null;
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  return { Renderer, chain, T, S, RX, RY, RZ, pt, tone, orbitControls };
})();
