/* Career section: an Artemis Moon mission in 3D pixels, rendered with Tiny3D.

   Pressing Launch starts one mission clock that runs the whole flight as a
   series of shots:
     pad      SLS lifts off from Kennedy, drops its boosters and abort tower
     orbit    core stage separation, Orion opens its solar wings, the upper
              stage burns for the Moon and Orion separates
     map      the coast out (and back) on a little Earth-Moon map
     gateway  Orion docks with the Lunar Gateway, where a Starship lander is
              already waiting; later the lander comes back up to it
     surface  two crew land near the lunar south pole, walk, and lift off
     entry    the service module drops away and the capsule hits the air
     ocean    parachutes and splashdown in the Pacific
   Drag to look around, +/- to zoom, and the dots jump to any phase.
   Every vehicle position is a pure function of the mission time, so jumping
   around is just setting the clock. */
(() => {
  'use strict';

  const root = document.querySelector('[data-rocket]');
  const T3 = window.Tiny3D, P = window.Pixels;
  if (!root || !T3 || !P) return;
  const { Renderer, chain, T, S, RX, RY, RZ, pt } = T3;

  const stage = root.querySelector('[data-rocket-stage]');
  const canvas = stage.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const r3 = new Renderer(ctx);
  const clockEl = root.querySelector('[data-rocket-clock]');
  const orionEl = root.querySelector('[data-rocket-orion]');
  const landerEl = root.querySelector('[data-rocket-lander]');
  const liveEl = root.querySelector('[data-rocket-live]');
  const phasesEl = root.querySelector('[data-phases]');
  const launchBtn = root.querySelector('[data-launch]');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

  const C = P.PALETTE;
  const COL = {
    space: '#313131', star0: '#454545', star1: '#5f5f5f', star2: '#8c8c8c',
    // Kennedy
    ground: '#383838', groundB: '#343434', slab: '#2a2a2a',
    deck: '#4f4b46', towerA: '#5d5953', towerB: '#4b4743', arm: '#8a8378',
    // SLS and the spacecraft
    core: '#cf6c2c', coreDark: '#a9541f', white: '#e6e2d9', offWhite: '#cfcabe', grey: '#9a958b',
    dark: '#57534d', nozzle: '#45423e', silver: '#bdb8ae', solar: '#c9a24a', heat: '#6b4a32',
    steel: '#b9b4a9', hull: '#ece8df', band: '#3b3a38',
    // the Moon
    regA: '#5e5b55', regB: '#5a5751', regSlab: '#3d3b37', rim: '#73706a', pit: '#4a4742', rock: '#7a766f', shadow: '#3a3834',
    // the Pacific
    seaA: '#2b4762', seaB: '#29435c', seaSlab: '#1d3044', foam: '#cfe0ea', ship: '#6c6863', shipDark: '#57534d',
    flightDeck: '#474542', island: '#7a766f', jet: '#9a968e', helo: '#86827b', rotor: '#3b3a38', deckLine: '#d8d4cc',
    catTrack: '#77736b', elevator: '#3d3b38', jbd: '#5d5953', track: '#42403b', rotorLight: '#a29d93', waterline: '#262524',
    chuteA: '#e0703a', chuteB: '#efe9dc', line: '#a29d93', suit: '#f2efe8', visor: '#c9a24a', bag: '#e8873f',
    // map
    path: '#4f4f4f', pathLit: '#bdb7aa', ksc: '#ffd700',
  };
  const FLAME = {
    solid: ['#fffbe6', '#ffe08a', '#f7a443', '#d9622f'],
    hydrolox: ['#ffffff', '#e6ecff', '#a9b8f0', '#6f7fc8'],
    methalox: ['#fffbe6', '#ffd9a0', '#f2a25a', '#c9603a'],
    small: ['#fff6d8', '#f7c77a', '#e08a4a', '#b55a30'],
    plasma: ['#ffffff', '#ffe9a8', '#ffb14a', '#e0582e'],
  };
  const PUFF = {
    smoke: ['#a7a29a', '#8a857e', '#6c6863'],
    rcs: ['#e8e4da', '#b5b0a6', '#7d786f'],
    dust: ['#8f8a80', '#76716a', '#5d5952'],
    splash: ['#f4f7f6', '#c6d9e3', '#86a9bf'],
    steam: ['#f4f2ec', '#d9d5cc', '#aea99f'],
    water: ['#e9f2f6', '#b9d1de', '#8fb0c4'],
  };

  /* ---------------- Mission timeline (seconds after pressing Launch) ---------------- */

  const TL = {
    liftoff: 3, srbSep: 9.5, lasJet: 10.8,
    orbit: 14, wingsA: 15.4, wingsB: 17.4,          // in Earth orbit: core stage drops away, solar wings open
    lap: 18.4,                                      // map: one lap of Earth before leaving
    tli: 21.8, tliA: 22.2, tliB: 25.4, orionSep: 25.4,   // the burn to the Moon, then Orion separates
    out: 26.6,                                      // map: coast out, swing past the Moon, catch Gateway
    gateway: 33.4, docked: 37.2,                    // dock with Gateway
    dockedLap: 38, undockShot: 41, undock: 42.2,    // map: one lap of the Moon docked; then the crew boards and the lander eases away
    surface: 45.2, mainOff: 49.7, landed: 52.3, elevDown: 52.6, drive: 53.9, parkBack: 57.5, walkBack: 57.6, elevUp: 58.7, liftoff2: 59.5, mainOn2: 60.3,
    back: 63, redock: 65.5, orionUndock: 66.5, burnHome: 67.3,
    home: 68,                                       // map: the trip home, straight in
    entry: 74, smSep: 74.4, turnA: 74.8, turnB: 75.8, plasmaA: 75.8, plasmaB: 80,
    ocean: 80, drogue: 80.5, mains: 81.9, jet1: 83.7, jet2: 85, heloA: 86.6, splash: 87, heloB: 87.3, bags: 87.6, flyby: 89.6, fireworks: 91.4, done: 93,
  };

  // the dots under the scene; `key` is the frame shown when paused or when motion is reduced
  const PHASES = [
    { name: 'Launch', at: TL.liftoff - 1.3, key: 5.5 },        // Launch goes straight to the water deluge and ignition
    { name: 'Earth orbit', at: TL.orbit, key: 20.2 },
    { name: 'To the Moon', at: TL.tli, key: 23.8 },
    { name: 'Gateway', at: TL.gateway, key: 36.4 },
    { name: 'Landing', at: TL.undockShot, key: 50.4 },
    { name: 'On the Moon', at: TL.landed, key: 55.6 },
    { name: 'Back to Gateway', at: TL.liftoff2, key: 64.6 },
    { name: 'Trip home', at: TL.orionUndock, key: 71 },
    { name: 'Splashdown', at: TL.entry, key: 90.4 },
  ];
  const phaseAt = (m) => { let i = 0; while (i + 1 < PHASES.length && m >= PHASES[i + 1].at) i++; return i; };

  function shotAt(m) {
    if (m < TL.orbit) return 'pad';
    if (m < TL.lap) return 'orbit';
    if (m < TL.tli) return 'map';
    if (m < TL.out) return 'orbit';
    if (m < TL.gateway) return 'map';
    if (m < TL.dockedLap) return 'gateway';
    if (m < TL.undockShot) return 'map';
    if (m < TL.surface) return 'gateway';
    if (m < TL.back) return 'surface';
    if (m < TL.home) return 'gateway';
    if (m < TL.entry) return 'map';
    if (m < TL.ocean) return 'entry';
    return 'ocean';
  }

  // camera framing per shot (zoom multiplies the base fit; rest is the look-at point)
  const SHOTS = {
    pad: { zoom: 1, rest: [6, 34, -6] },
    orbit: { zoom: 3.2, rest: [0, 0, 0] },
    map: { zoom: 1, rest: [0, 0, 0] },
    gateway: { zoom: 1.5, rest: [-2, -12, 0] },
    surface: { zoom: 1.25, rest: [0, 14, 0] },
    entry: { zoom: 3.4, rest: [0, 0, 0] },
    ocean: { zoom: 1.2, rest: [0, 20, 0] },
  };

  // Real mission elapsed time for the HUD clock: [animation second, real seconds]
  const DAY = 86400;
  // (one lap of Gateway's halo orbit takes about 6.5 days; docked, they go round 1.5 times, from the
  // bottom where Orion arrives to the top where Starship leaves, so the clock jumps ~9.75 days there)
  const REAL = [
    [3, 0], [6.4, 70], [9.5, 132], [10.8, 193], [14, 486], [18.4, 1400], [21.8, 5000], [22.2, 5200], [25.4, 6300], [26.6, 7200],
    [33.4, 4.4 * DAY], [37.2, 5 * DAY], [38, 5.1 * DAY], [41, 14.85 * DAY], [45.2, 15.05 * DAY], [52.3, 15.15 * DAY], [59.5, 21.65 * DAY],
    [63, 21.75 * DAY], [65.5, 21.95 * DAY], [66.5, 22.45 * DAY], [68, 22.65 * DAY], [74, 27.55 * DAY],
    [75.8, 27.55 * DAY + 1200], [80, 27.55 * DAY + 1900], [87, 27.55 * DAY + 2500], [93, 27.55 * DAY + 3600],
  ];
  function realTime(m) {
    if (m < REAL[0][0]) return m - REAL[0][0];
    for (let i = 1; i < REAL.length; i++) {
      if (m < REAL[i][0]) {
        const [a, ra] = REAL[i - 1], [b, rb] = REAL[i];
        return ra + ((rb - ra) * (m - a)) / (b - a);
      }
    }
    return REAL[REAL.length - 1][1];
  }
  const two = (n) => String(n).padStart(2, '0');
  function clockText(m) {
    const s = realTime(m);
    if (s < 0) return `T-00:00:${two(Math.ceil(-s))}`;
    if (s < DAY) return `T+${two(Math.floor(s / 3600))}:${two(Math.floor(s / 60) % 60)}:${two(Math.floor(s) % 60)}`;
    return `Day ${Math.floor(s / DAY) + 1}`;
  }

  /* ---------------- Small math ---------------- */

  const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const lerp = (a, b, k) => a + (b - a) * k;
  const seg = (m, a, b) => clamp01((m - a) / (b - a));
  const smooth = (m, a, b) => ease(seg(m, a, b));
  // cubic Hermite from p0 (velocity v0) to p1 (velocity v1) over `dur` seconds, u in 0..1
  function hermite(p0, v0, p1, v1, dur, u) {
    const u2 = u * u, u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * p0 + (u3 - 2 * u2 + u) * dur * v0 + (-2 * u3 + 3 * u2) * p1 + (u3 - u2) * dur * v1;
  }
  function seeded(seed) { return () => ((seed = (seed * 16807) % 2147483647) / 2147483647); }
  function hash(i, j) {
    let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  /* ---------------- Building blocks ---------------- */

  const cyl = (M, y0, y1, r, color, o = {}) => r3.cylinder(chain(M, T(0, y0, 0), S(r, y1 - y0, r)), color, { sides: 12, ...o });
  const cone = (M, y0, y1, r0, r1, color, o = {}) => r3.cylinder(chain(M, T(0, y0, 0), S(r0, y1 - y0, r0)), color, { sides: 12, rTop: r1 / r0, ...o });

  /* ---------------- SLS (frame: y = 0 at the base of the core stage) ---------------- */

  const MT = 5;                      // mobile launcher deck height
  const SRB_Z = 3.85;                // boosters sit either side of the core, away from the tower
  // deluge nozzles ("rainbirds") around the launcher deck
  const RAINBIRDS = [[-6.5, -6], [7, -6], [-6.5, 6], [7, 6], [1, -8.5], [1, 8.5], [10.5, -2.5], [10.5, 2.5], [-3, -9], [-3, 9]];

  function drawCore(M) {
    [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([a, b]) =>
      r3.cylinder(chain(M, T(a * 1.1, -1.6, b * 1.1), S(0.6, 1.6, 0.6)), COL.nozzle, { sides: 6, rTop: 0.55 }));
    cyl(M, 0, 4, 2.6, COL.coreDark, { sides: 14 });
    [[4, 13], [13, 22], [22, 27]].forEach(([a, b]) => cyl(M, a, b, 2.6, COL.core, { sides: 14, caps: false }));
    cyl(M, 27, 28.2, 2.6, COL.coreDark, { sides: 14, caps: false });          // intertank
    [[28.2, 34], [34, 40]].forEach(([a, b]) => cyl(M, a, b, 2.6, COL.core, { sides: 14, caps: false }));
    cone(M, 40, 43.5, 2.6, 1.6, COL.offWhite, { sides: 14, caps: false });     // stage adapter
  }

  function drawSRB(M) {
    r3.cylinder(chain(M, T(0, -1.8, 0), S(1.0, 1.8, 1.0)), COL.nozzle, { sides: 8, rTop: 0.6 });
    cyl(M, 0, 2.2, 1.35, COL.offWhite, { sides: 10 });
    [[2.2, 11], [11, 20], [20, 28]].forEach(([a, b]) => cyl(M, a, b, 1.15, COL.white, { sides: 10, caps: false }));
    cyl(M, 28, 29.2, 1.15, COL.band, { sides: 10, caps: false });
    cyl(M, 29.2, 33, 1.15, COL.white, { sides: 10, caps: false });
    cone(M, 33, 37.4, 1.15, 0.05, COL.white, { sides: 10 });
  }

  // upper stage (ICPS): y = 0 at the engine, Orion bolts on at y = 8.6
  function drawICPS(M) {
    r3.cylinder(chain(M, T(0, -0.2, 0), S(0.8, 1.8, 0.8)), COL.nozzle, { sides: 8, rTop: 0.4 });
    cyl(M, 1.6, 3.4, 1.0, COL.silver, { sides: 10 });
    cyl(M, 3.4, 8, 1.6, COL.white, { sides: 12 });
    cyl(M, 8, 8.6, 1.62, COL.offWhite, { sides: 12 });
  }

  // launch abort system: y = 0 at the bottom of the fairing over the crew module
  function drawLAS(M) {
    cone(M, 0, 3.4, 1.7, 0.45, COL.white, { sides: 12 });
    cyl(M, 3.4, 7.4, 0.35, COL.offWhite, { sides: 6 });
    cyl(M, 7.4, 8.2, 0.5, COL.dark, { sides: 6 });
    cone(M, 8.2, 9.7, 0.5, 0.05, COL.offWhite, { sides: 6 });
  }

  function drawStackTop(M, orionOut) {
    cyl(M, 43.5, 47.5, 1.6, COL.white, { sides: 12 });
    cyl(M, 47.5, 48.1, 1.62, COL.offWhite, { sides: 12 });
    if (orionOut) { drawOrion(chain(M, T(0, 48.1, 0)), { wings: 0 }); return; }
    cyl(M, 48.1, 50.6, 1.7, COL.white, { sides: 12 });
    drawLAS(chain(M, T(0, 50.6, 0)));
  }

  /* ---------------- Orion (frame: y = 0 at the back of the service module) ---------------- */

  const ORION_MID = 2.2;
  function drawOrion(M, { wings = 1, cm = true } = {}) {
    r3.cylinder(chain(M, T(0, -0.9, 0), S(0.5, 0.9, 0.5)), COL.nozzle, { sides: 6, rTop: 0.5 });   // main engine
    cyl(M, 0, 2.4, 1.55, COL.silver, { sides: 12, colorAt: (i) => (i % 3 ? COL.silver : COL.grey) });
    // four solar wings, folded down the hull at launch and swung out into an X in orbit
    for (let k = 0; k < 4; k++) {
      r3.box(chain(M, T(0, 2.1, 0), RY(Math.PI / 4 + (k * Math.PI) / 2), T(1.72, 0, 0),
        RZ(-(1 - wings) * Math.PI * 0.49), T(2.3, 0, 0), S(4.6, 0.12, 1.3)), COL.solar);
    }
    cyl(M, 2.4, 2.8, 1.5, COL.grey, { sides: 12 });
    if (cm) drawCM(chain(M, T(0, 2.8, 0)));
  }

  // crew module: y = 0 at the heat shield, docking tunnel on top at y = 2.4
  function drawCM(M, bags = 0) {
    cyl(M, -0.2, 0, 1.52, COL.heat, { sides: 12 });
    cone(M, 0, 2.0, 1.5, 0.45, COL.offWhite, { sides: 12, caps: false });
    cyl(M, 2.0, 2.4, 0.42, COL.silver, { sides: 8 });
    if (bags > 0) {
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        r3.box(chain(M, T(Math.cos(a) * 0.75, 2.4 + 0.3 * bags, Math.sin(a) * 0.75), S(0.7 * bags)), k % 2 ? COL.chuteB : COL.bag);
      }
    }
  }

  /* ---------------- Starship lander (frame: y = 0 at the footpads) ---------------- */

  const HLS_MID = 15.3;
  const THRUSTERS = Array.from({ length: 6 }, (_, k) => k * (Math.PI / 3));
  // Cargo elevator on the +x side: a door, a boom with a canopy, and a platform on four cables.
  // `lift` is the platform height; null means it's stowed and the door is shut.
  const LIFT = { x: 6.4, sill: 19.4, hx: 3.2, hz: 2.5, boom: 24.6 };
  function drawHLS(M, lift = null) {
    for (let k = 0; k < 4; k++) {
      const L = chain(M, RY(Math.PI / 4 + (k * Math.PI) / 2));
      r3.box(chain(L, T(3.5, 2.15, 0), RZ(0.5), S(0.45, 4.6, 0.45)), COL.dark);
      r3.box(chain(L, T(4.6, 0.2, 0), S(1.3, 0.4, 1.3)), COL.dark);
    }
    cyl(M, 1.8, 3, 2.5, COL.band, { sides: 14 });
    [[3, 8], [8, 13]].forEach(([a, b]) => cyl(M, a, b, 2.7, COL.steel, { sides: 14, caps: false }));
    cyl(M, 13, 19.5, 2.7, COL.hull, { sides: 14, caps: false });
    cyl(M, 19.5, 21, 2.7, COL.band, { sides: 14, caps: false, colorAt: (i) => (i % 2 ? COL.band : COL.solar) });
    cyl(M, 21, 24, 2.7, COL.hull, { sides: 14, caps: false });
    cone(M, 24, 29.6, 2.7, 0.8, COL.hull, { sides: 14 });
    cyl(M, 29.6, 30.6, 0.7, COL.silver, { sides: 8 });
    THRUSTERS.forEach((a) => r3.box(chain(M, RY(a), T(2.85, 17.6, 0), S(0.5, 1.1, 0.8)), COL.dark));
    const out = lift !== null && lift !== undefined;
    r3.box(chain(M, T(2.72, out ? 21.6 : 22.4, 0), S(0.2, out ? 4.4 : 1.8, out ? 4 : 1.1)), COL.band);   // cargo door / hatch
    if (out) {
      const { x, hx, hz, boom } = LIFT, len = x + hx - 2.7;
      [1, -1].forEach((s) => r3.box(chain(M, T(2.7 + len / 2, boom, s * hz), S(len, 0.4, 0.4)), COL.grey));    // boom
      r3.box(chain(M, T(x - 0.3, boom + 0.35, 0), S(hx * 2 + 0.8, 0.16, hz * 2 + 0.6)), COL.offWhite);         // canopy
      r3.box(chain(M, T(x, lift + 0.15, 0), S(hx * 2, 0.3, hz * 2)), COL.silver);                               // platform
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        r3.line(pt(M, x + sx * (hx - 0.3), boom - 0.2, sz * (hz - 0.3)), pt(M, x + sx * (hx - 0.3), lift + 0.3, sz * (hz - 0.3)), COL.line);
      }
    }
  }

  /* ---------------- Lunar Gateway (world frame, centered on HALO) ---------------- */

  const GW_PORT_X = 7.2;                     // where Orion's nose docks
  const HLS_DOCK = { x: -6.5, y: -2.7 - 30.6 + HLS_MID };   // lander center when docked under HALO
  function drawGateway() {
    const X = RZ(-Math.PI / 2);              // modules run along +x
    const along = (x0, x1, r, color, o) => cyl(chain(T(x0, 0, 0), X), 0, x1 - x0, r, color, o);
    // power and propulsion element with its two big roll-out solar wings
    r3.box(chain(T(-15.1, 0, 0), S(0.8, 2.4, 2.4)), COL.solar);
    r3.box(chain(T(-12.8, 0, 0), S(4, 3.6, 3.6)), COL.silver);
    [1, -1].forEach((z) => {
      r3.box(chain(T(-12.8, 0, z * 2.6), S(0.3, 0.3, 1.6)), COL.grey);
      r3.box(chain(T(-12.8, 0, z * 10.4), S(3.4, 0.14, 14)), COL.solar);
    });
    along(-10.8, -2.6, 1.75, COL.offWhite, { sides: 12 });   // HALO
    along(-2.6, 4.6, 2.05, COL.white, { sides: 12 });         // I-Hab
    along(4.6, 6.2, 1.25, COL.silver, { sides: 10 });         // ESPRIT
    along(6.2, GW_PORT_X, 0.7, COL.grey, { sides: 8 });
    cyl(T(-6.5, -2.7, 0), 0, 1.0, 0.7, COL.grey, { sides: 8 }); // lander port under HALO
    // Canadarm3
    r3.box(chain(T(-5, 2.4, 0), RZ(-0.6), S(0.35, 3.2, 0.35)), COL.offWhite);
    r3.box(chain(T(-2.2, 3.7, 0), RZ(1.1), S(0.35, 4.0, 0.35)), COL.offWhite);
  }

  /* ---------------- Little people and props ---------------- */

  // Lunar terrain vehicle (NASA plans an LTV from around Artemis V). It rides down Starship's
  // cargo elevator with the crew aboard, rolls off, drives a loop and parks out of the way;
  // it stays behind for the next crew. Front toward +x, origin on the ground.
  const ROVER_SCALE = 2;
  // the drive as dense points with heading and distance: off the platform, one loop, then out to park
  const ROUTE = (() => {
    const pts = [], a = 9, b = 7, cx = 14, cz = -b;
    for (let i = 0; i <= 8; i++) pts.push({ x: lerp(LIFT.x, cx, i / 8), z: 0 });
    for (let i = 1; i <= 72; i++) { const phi = Math.PI / 2 - (i / 72) * Math.PI * 2; pts.push({ x: cx + a * Math.cos(phi), z: cz + b * Math.sin(phi) }); }
    for (let i = 1; i <= 8; i++) pts.push({ x: lerp(cx, cx + 7, i / 8), z: 0 });
    let d = 0;
    pts.forEach((p, i) => {
      if (i) d += Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z);
      p.d = d;
      const [o, q] = i + 1 < pts.length ? [p, pts[i + 1]] : [pts[i - 1], p];
      p.h = Math.atan2(-(q.z - o.z), q.x - o.x);
    });
    return pts;
  })();
  const ROUTE_LEN = ROUTE[ROUTE.length - 1].d;
  function roverPose(f) {
    const d = f * ROUTE_LEN;
    let i = 1;
    while (i < ROUTE.length - 1 && ROUTE[i].d < d) i++;
    const a = ROUTE[i - 1], b = ROUTE[i], k = clamp01((d - a.d) / (b.d - a.d || 1));
    return { x: lerp(a.x, b.x, k), z: lerp(a.z, b.z, k), h: a.h };
  }
  function drawRover(M) {
    [[1.2, 1.0], [1.2, -1.0], [-1.2, 1.0], [-1.2, -1.0]].forEach(([x, z]) =>
      r3.cylinder(chain(M, T(x, 0.55, z - 0.2), RX(Math.PI / 2), S(0.55, 0.4, 0.55)), COL.band, { sides: 8 }));
    r3.box(chain(M, T(0, 0.9, 0), S(3.0, 0.3, 1.5)), COL.silver);
    r3.box(chain(M, T(0, 1.15, 0), S(2.7, 0.1, 2.4)), COL.grey);                  // fenders
    [0.45, -0.45].forEach((z) => r3.box(chain(M, T(-0.45, 1.5, z), S(0.25, 0.6, 0.55)), COL.dark));   // seat backs
    r3.box(chain(M, T(1.2, 1.4, 0), S(0.25, 0.45, 1.2)), COL.dark);              // console
    r3.box(chain(M, T(-1.4, 1.35, 0), S(0.4, 0.35, 1.3)), COL.solar);           // cargo box
    r3.box(chain(M, T(-1.3, 2.0, 0.6), S(0.12, 1.6, 0.12)), COL.grey);          // mast
    r3.cylinder(chain(M, T(-1.3, 2.8, 0.6), RZ(0.6), S(0.6, 0.15, 0.6)), COL.white, { sides: 10, rTop: 0.5 });   // antenna dish
  }
  // tire tracks along the part of the route driven so far (none on the elevator platform)
  function drawTracks(f) {
    const d = f * ROUTE_LEN;
    for (let i = 1; i < ROUTE.length && ROUTE[i - 1].d < d; i++) {
      const a = ROUTE[i - 1], b = ROUTE[i];
      if (a.x < LIFT.x + LIFT.hx && Math.abs(a.z) < LIFT.hz) continue;
      for (const s of [1, -1]) {
        const ax = a.x + Math.sin(a.h) * 2 * s, az = a.z + Math.cos(a.h) * 2 * s, bx = b.x + Math.sin(b.h) * 2 * s, bz = b.z + Math.cos(b.h) * 2 * s;
        const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1, ox = (-dz / L) * 0.22, oz = (dx / L) * 0.22;
        flat([[ax - ox, az - oz], [bx - ox, bz - oz], [bx + ox, bz + oz], [ax + ox, az + oz]], 0.07, COL.track, 1, 50);
      }
    }
  }

  function drawAstronaut(x, z, face, step, y = 0) {
    const M = chain(T(x, y + Math.abs(Math.sin(step)) * 0.3, z), RY(face), S(1.7));   // drawn larger than life so they read
    r3.box(chain(M, T(0, 0.55, 0), S(0.75, 1.1, 0.55)), COL.suit);
    r3.box(chain(M, T(0, 1.4, 0), S(0.62, 0.6, 0.6)), COL.suit, { faces: { right: COL.visor } });
    r3.box(chain(M, T(-0.42, 0.95, 0), S(0.3, 0.8, 0.6)), COL.offWhite);
  }

  // a flat polygon (xz points) on the plane y, facing up
  function flat(pts, y, color, layer = 1, bias = 0, isFlat = true) {
    const area = pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0);
    const ring = area < 0 ? pts : pts.slice().reverse();
    r3.poly(ring.map(([x, z]) => [x, y, z]), color, { layer, bias, flat: isFlat });
  }
  // a convex xz outline extruded from y0 to y1 (no top face when `top` is null; `skip` lists
  // edges, by starting index, that are shared with a neighbouring piece and so get no wall)
  function prism(pts, y0, y1, side, top, topLayer = 2, skip = []) {
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cz = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    if (top) flat(pts, y1, top, topLayer, 0, false);
    for (let i = 0; i < pts.length; i++) {
      if (skip.includes(i)) continue;
      const a = pts[i], b = pts[(i + 1) % pts.length];
      let q = [[a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]]];
      if (-(b[1] - a[1]) * ((a[0] + b[0]) / 2 - cx) + (b[0] - a[0]) * ((a[1] + b[1]) / 2 - cz) < 0) q = q.reverse();
      r3.poly(q, side);
    }
  }

  // The recovery group: a Ford-class carrier. (Real Artemis recoveries use an amphibious ship
  // and Seahawks; a carrier launching Hornets is the dramatic version.)
  // Carrier frame: bow toward -x, so starboard is -z and port is +z (49 long, traced from an
  // overhead photo of Ford). The aft two thirds is a wide, nearly rectangular deck; it steps in
  // on both sides to a narrower, squared-off bow section. The island sits on the starboard edge
  // about a quarter of the way from the stern, and the angled landing deck runs from the stern
  // out to the port corner where the bow section starts. Two catapults run up the bow section.
  const CARRIER = { x: 26, z: -18, deck: 3.6 };
  const AIR = S(1.15);                               // aircraft a little larger than scale so they read
  const DECK_AFT = [[24.5, -5.4], [24.5, 5], [-8.3, 5.7], [-12.8, 2.5], [-13.1, -2.4], [-10.3, -5.3]];
  const DECK_BOW = [[-12.8, 2.5], [-24.4, 2.1], [-24.4, -2], [-13.1, -2.4]];
  const HULL = [[-23.5, -0.1], [-14, 3.3], [22, 3.6], [24, 2.6], [24, -2.8], [22, -4], [-14, -3.6]];
  const BOW = -24.4, CATS = [{ z: -0.9, start: -9 }, { z: 0.9, start: -4.5 }];   // staggered so waiting jets don't overlap
  const LAND = { x0: 24, z0: 0.3, x1: -8, z1: 4.4 };                // angled-deck centerline, stern to the port corner
  const HULL_NO = { 7: ['111', '001', '001', '010', '010'], 8: ['111', '101', '111', '101', '111'] };
  const cw = ([x, z]) => [x + CARRIER.x, z + CARRIER.z];
  const atDeck = (x, z, y = 0) => T(x + CARRIER.x, CARRIER.deck + y, z + CARRIER.z);

  function drawCarrier() {
    const { deck } = CARRIER;
    prism(HULL.map(cw), 0, 0.55, COL.waterline, null);                       // black boot-topping at the waterline
    prism(HULL.map(cw), 0.55, deck - 0.7, COL.ship, null);
    prism(DECK_AFT.map(cw), deck - 0.7, deck, COL.island, COL.flightDeck, 1, [3]);
    prism(DECK_BOW.map(cw), deck - 0.7, deck, COL.island, COL.flightDeck, 1, [3]);
    // deck paint: a thin strip from (x0, z0) to (x1, z1), in carrier coordinates
    const strip = (x0, z0, x1, z1, wid, color) => {
      const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz), ox = ((-dz / L) * wid) / 2, oz = ((dx / L) * wid) / 2;
      flat([[x0 - ox, z0 - oz], [x1 - ox, z1 - oz], [x1 + ox, z1 + oz], [x0 + ox, z0 + oz]].map(cw), deck + 0.02, color, 1, 200);
    };
    // angled landing deck: dashed centerline and two edge lines
    const { x0, z0, x1, z1 } = LAND, L = Math.hypot(x1 - x0, z1 - z0), px = -(z1 - z0) / L, pz = (x1 - x0) / L;
    for (let i = 0; i < 10; i++) {
      const a = i / 10, b = a + 0.05;
      strip(lerp(x0, x1, a), lerp(z0, z1, a), lerp(x0, x1, b), lerp(z0, z1, b), 0.2, COL.deckLine);
    }
    [-2.4, 2.4].forEach((o) => strip(x0 + px * o, z0 + pz * o, x1 + px * o, z1 + pz * o, 0.12, COL.catTrack));
    CATS.forEach((c) => strip(c.start, c.z, BOW + 0.6, c.z, 0.16, COL.catTrack));                // bow catapults
    // elevators: two on the starboard edge just forward of the island, one on the port side aft
    [[9, -4.5, 3.2, 1.8], [-1.8, -4.5, 3.2, 1.8], [11, 4.4, 3, 1.6]].forEach(([x, z, w, d]) => strip(x - w / 2, z, x + w / 2, z, d, COL.elevator));
    ['7', '8'].forEach((digit, d) => HULL_NO[digit].forEach((row, r) => [...row].forEach((on, c) => {
      if (on === '1') { const x = -23.7 + r * 0.42, z = 1.3 - (d * 4 + c) * 0.42; strip(x, z, x + 0.42, z, 0.42, COL.deckLine); }
    })));
    // jet blast deflectors raised behind each catapult's start
    CATS.forEach((c) => r3.box(chain(atDeck(c.start + 2.6, c.z, 0.5), RZ(-0.6), S(0.12, 1.1, 1.7)), COL.jbd));
    // the island, on the starboard edge a quarter of the way from the stern: bridge windows, radar tier, mast
    const IX = 13.4, IZ = -4.8;
    r3.box(chain(atDeck(IX, IZ, 1.4), S(4.4, 2.8, 2)), COL.island);
    r3.box(chain(atDeck(IX, IZ, 3.05), S(4.4, 0.5, 2)), COL.band);
    r3.box(chain(atDeck(IX, IZ, 3.7), S(3.6, 0.8, 1.8)), COL.island);
    r3.box(chain(atDeck(IX + 0.2, IZ, 4.8), S(2.6, 1.4, 1.5)), COL.ship);
    r3.box(chain(atDeck(IX + 0.2, IZ, 6.8), S(0.2, 2.6, 0.2)), COL.grey);
    r3.box(chain(atDeck(IX + 0.2, IZ, 7.4), S(0.15, 0.15, 1.6)), COL.grey);
    r3.box(chain(atDeck(IX + 0.2, IZ, 8.3), S(0.5, 0.4, 0.5)), COL.offWhite);
    // parked Hornets: a row along the starboard edge between the elevators, a pair at the
    // starboard stern and a pair at the port stern, noses angled inboard
    [6.8, 4.6, 2.4, -4.4, -6.6, 19.8, 22].forEach((x) => drawHornet(chain(atDeck(x, -4, 0.35), RY(-2.1)), true));
    [20, 22.2].forEach((x) => drawHornet(chain(atDeck(x, 4, 0.35), RY(2.1)), true));
  }

  // F/A-18, nose toward +x
  function drawHornet(M, parked = false) {
    r3.box(chain(M, S(3.4, 0.45, 0.55)), COL.jet);
    r3.box(chain(M, T(2.0, -0.02, 0), S(0.8, 0.32, 0.36)), COL.jet);
    r3.box(chain(M, T(-0.1, -0.05, 0), S(1.3, 0.08, parked ? 2.2 : 3.0)), COL.jet);
    r3.box(chain(M, T(-1.5, -0.05, 0), S(0.6, 0.06, 1.5)), COL.jet);
    [1, -1].forEach((s) => r3.box(chain(M, T(-1.35, 0.42, s * 0.24), RX(s * 0.35), S(0.6, 0.6, 0.06)), COL.jet));
    r3.box(chain(M, T(1.1, 0.27, 0), S(0.7, 0.18, 0.3)), COL.band);
  }

  // MH-60 Seahawk, nose toward +x
  function drawSeahawk(M, spin) {
    r3.box(chain(M, S(2.4, 1.0, 0.9)), COL.helo);
    r3.box(chain(M, T(1.4, -0.1, 0), S(0.6, 0.7, 0.8)), COL.helo);
    r3.box(chain(M, T(1.0, 0.05, 0), S(0.5, 0.35, 0.92)), COL.band);
    r3.box(chain(M, T(-2.0, 0.2, 0), S(2.0, 0.35, 0.3)), COL.helo);
    r3.box(chain(M, T(-3.0, 0.6, 0), S(0.45, 0.9, 0.1)), COL.helo);
    // two-tone blades plus a dotted rotor disc, so the spin reads even from a low, edge-on angle
    for (let k = 0; k < 2; k++) r3.box(chain(M, T(0, 0.75, 0), RY(spin + (k * Math.PI) / 2), S(5.6, 0.05, 0.22)), k ? COL.rotorLight : COL.rotor);
    for (let i = 0; i < 16; i++) {
      const a0 = (i / 16) * Math.PI * 2, a1 = ((i + 1) / 16) * Math.PI * 2;
      r3.line(pt(M, Math.cos(a0) * 2.8, 0.78, Math.sin(a0) * 2.8), pt(M, Math.cos(a1) * 2.8, 0.78, Math.sin(a1) * 2.8), COL.rotorLight, { dotted: true });
    }
  }

  // A catapult launch: the jet waits on a bow catapult nose-forward, lights its afterburner
  // against the raised blast deflector, gets thrown down the deck and climbs off the bow.
  function hornetLaunch(m, at, cat) {
    const tau = m - at;
    if (tau > 3.6) return null;
    const stroke = cat.start - BOW, v = (2 * stroke) / 0.75, y0 = CARRIER.deck + 0.45;
    let x = cat.start, y = y0, pitch = 0;
    if (tau > 0 && tau < 0.75) x -= stroke * (tau / 0.75) ** 2;
    else if (tau >= 0.75) {
      const s = tau - 0.75;
      x = BOW - v * s; y = y0 + 6 * s + 6 * s * s; pitch = Math.atan2(6 + 12 * s, v);
    }
    return {
      M: chain(T(x + CARRIER.x, y, cat.z + CARRIER.z), RY(Math.PI), RZ(pitch), AIR),
      burner: tau > -0.6,
      blast: tau > -0.6 && tau < 0.2 ? [CARRIER.x + cat.start + 2.8, CARRIER.deck + 1.3, CARRIER.z + cat.z] : null,   // exhaust off the deflector
    };
  }

  // two Hornets in formation screaming low over the capsule
  function hornetFlyby(m) {
    const u = seg(m, TL.flyby, TL.flyby + 1.6);
    if (u <= 0 || u >= 1) return [];
    const a = [-70, 22, 30], b = [70, 16, -42];
    const p = a.map((v, i) => lerp(v, b[i], u));
    const h = Math.atan2(-(b[2] - a[2]), b[0] - a[0]);
    return [p, [p[0] - 5, p[1] + 0.8, p[2] + 4.4]].map(([x, y, z]) => chain(T(x, y, z), RY(h), RX(-0.25), AIR));
  }

  // Seahawks lift off the aft deck and fly out to hover over the capsule
  function seahawk(m, at, park, hover) {
    const tau = m - at;
    let p, heading = Math.PI;
    const LIFTOFF = 1.2, TRANSIT = 2.8;                                       // seconds to climb out, then to fly over
    if (tau <= 0) p = park;
    else if (tau < LIFTOFF) p = [park[0], lerp(park[1], 12, ease(tau / LIFTOFF)), park[2]];
    else {
      const u = ease(clamp01((tau - LIFTOFF) / TRANSIT));
      p = [lerp(park[0], hover[0], u), lerp(12, hover[1], u) + Math.sin(t * 2.1 + at) * 0.25 * u, lerp(park[2], hover[2], u)];
      const want = Math.atan2(-(hover[2] - park[2]), hover[0] - park[0]);
      const turn = ((want - Math.PI + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;     // shortest way round
      heading = Math.PI + turn * ease(clamp01((tau - LIFTOFF) / 0.8));
    }
    const cruising = tau > LIFTOFF && tau < LIFTOFF + TRANSIT;
    return { M: chain(T(...p), RY(heading), RZ(cruising ? -0.12 : 0), AIR), hovering: tau > LIFTOFF + TRANSIT, at: p };
  }

  function drawChute(cx, cy, cz, out, R, h, size, apex) {
    if (size <= 0.02) return;
    const a = Math.atan2(cz - apex[2], cx - apex[0]);
    const M = chain(T(cx, cy, cz), RY(-a), RZ(-out), S(R * size, h * size, R * size));
    r3.cylinder(M, COL.chuteA, { sides: 10, rTop: 0.35, colorAt: (i) => (i % 2 ? COL.chuteA : COL.chuteB) });
    for (let k = 0; k < 4; k++) {
      const b = (k / 4) * Math.PI * 2 + 0.4;
      r3.line(pt(M, Math.cos(b), 0, Math.sin(b)), apex, COL.line);
    }
  }

  function drawGround(a, b, slab, cx = 8, cz = -6, half = 54, tile = 9) {
    r3.box(chain(T(cx, -2, cz), S(half * 2, 4, half * 2)), slab, { layer: 0 });
    for (let gx = -half; gx < half; gx += tile) {
      for (let gz = -half; gz < half; gz += tile) {
        const x0 = cx + gx, z0 = cz + gz;
        r3.poly([[x0, 0.02, z0 + tile], [x0 + tile, 0.02, z0 + tile], [x0 + tile, 0.02, z0], [x0, 0.02, z0]],
          ((gx + gz) / tile) & 1 ? a : b, { layer: 0, flat: true });
      }
    }
  }

  // lunar south pole: craters and boulders, kept clear of the landing spot
  const CRATERS = [], ROCKS = [], SPARKLES = [];
  (() => {
    const rnd = seeded(29);
    while (CRATERS.length < 16) {
      const x = 8 + (rnd() - 0.5) * 100, z = -6 + (rnd() - 0.5) * 100, r = 1.5 + rnd() * 5;
      if (Math.hypot(x, z) > r + 9) CRATERS.push({ x, z, r });
    }
    while (ROCKS.length < 22) {
      const x = 8 + (rnd() - 0.5) * 100, z = -6 + (rnd() - 0.5) * 100;
      if (Math.hypot(x, z) > 8) ROCKS.push({ x, z, s: 0.5 + rnd() * 1.4, a: rnd() * 3 });
    }
    for (let i = 0; i < 60; i++) SPARKLES.push({ x: 8 + (rnd() - 0.5) * 104, z: -6 + (rnd() - 0.5) * 104, k: rnd() * 6.3 });
  })();

  /* ---------------- Earth and Moon (2D backdrops) ---------------- */

  const DEG = 180 / Math.PI;
  const RAMP = {
    sea: [C.sea0, C.sea1, C.sea2], land: [C.land0, C.land1, C.land2], ice: [C.ice0, C.ice1, C.ice2],
    moon: [C.moon0, C.moon1, C.moon2], mare: [C.mare0, C.mare1, C.mare2],
  };
  const landNoise = (lon, lat) =>
    Math.sin(2 * lon + 0.6) * Math.cos(1.6 * lat) + 0.55 * Math.sin(3 * lon - 2.1 * lat + 1.7) + 0.35 * Math.sin(5 * lon + 2.7 * lat + 0.4);

  function earthRamp(lat, lon) {
    const latD = lat * DEG;
    if (Math.abs(latD) > 70) return RAMP.ice;
    const cloud = Math.sin(lon * 5 + lat * 3.1 + 0.7) * Math.sin(lat * 7.3 - lon * 2.2) + 0.45 * Math.sin(lon * 11 - lat * 6 + 1.3);
    if (cloud > 0.95) return RAMP.ice;
    const isLand = window.EarthLand;
    const lonD = (((lon * DEG) % 360) + 540) % 360 - 180;
    return (isLand ? isLand(latD, lonD) : landNoise(lon, lat) > 0.55) ? RAMP.land : RAMP.sea;
  }

  function moonSurface(lat, lon) {
    const mare = landNoise(lon + 2.2, lat * 1.4 - 0.3) > 0.5;
    const s = 0.11, ci = Math.floor(lon / s), cj = Math.floor(lat / s);
    let dv = 0;
    if (hash(ci, cj) < 0.6) {
      const ox = (ci + 0.25 + 0.5 * hash(ci + 17, cj)) * s, oy = (cj + 0.25 + 0.5 * hash(ci, cj + 29)) * s;
      const d = Math.hypot((lon - ox) * Math.cos(lat), lat - oy) / (s * (0.12 + 0.28 * hash(ci + 5, cj + 11)));
      if (d < 0.7) dv = -0.16; else if (d < 1) dv = 0.1;
    }
    return { ramp: mare ? RAMP.mare : RAMP.moon, dv };
  }

  // Big planet limbs are painted pixel by pixel into an ImageData layer, then drawn under the 3D scene.
  const bodyCanvas = document.createElement('canvas');
  const bodyCtx = bodyCanvas.getContext('2d');
  let bodyImg = null, bodyBuf = null;
  const u32Cache = new Map();
  function u32(hex) {
    let v = u32Cache.get(hex);
    if (v === undefined) {
      const n = parseInt(hex.slice(1), 16);
      v = ((255 << 24) | ((n & 255) << 16) | (((n >> 8) & 255) << 8) | ((n >> 16) & 255)) >>> 0;
      u32Cache.set(hex, v);
    }
    return v;
  }

  // Backdrops are laid out for the default camera angle. They sit far away in a fixed direction,
  // so when the view turns (drag or the slow sway) they turn with the 3D scene.
  const BASE_YAW = 0.78, BASE_PITCH = 0.26;
  const camRot = (yaw, pitch) => chain(RX(pitch), RY(-yaw));
  const rot = (R, v) => [R[0] * v[0] + R[1] * v[1] + R[2] * v[2], R[4] * v[0] + R[5] * v[1] + R[6] * v[2], R[8] * v[0] + R[9] * v[1] + R[10] * v[2]];
  const unrot = (R, v) => [R[0] * v[0] + R[4] * v[1] + R[8] * v[2], R[1] * v[0] + R[5] * v[1] + R[9] * v[2], R[2] * v[0] + R[6] * v[1] + R[10] * v[2]];
  // screen position now of something placed at (x, y) for the default camera; null once it's behind us
  function skyPos(x, y) {
    const d = unrot(camRot(BASE_YAW, BASE_PITCH), [x - W / 2, -(y - H / 2), -0.35 * Math.max(W, H)]);
    const v = rot(camRot(cam.yaw, cam.pitch), d);
    return v[2] > 0 ? null : [W / 2 + v[0], H / 2 - v[1]];
  }

  // the same, for something placed by a world-space direction (its length is the screen distance)
  function skyDir(d) {
    const v = rot(camRot(cam.yaw, cam.pitch), d);
    return v[2] > 0 ? null : [W / 2 + v[0], H / 2 - v[1]];
  }

  function drawBody({ kind, cx: bx, cy: by, dir, r, light, spin = 0, tilt = 0 }) {
    const at = dir ? skyDir(dir) : skyPos(bx, by);
    if (!at) return;
    bodiesBegin();
    renderBody(kind, at[0], at[1], r, camRot(cam.yaw, cam.pitch), light, spin, tilt);
    bodiesEnd();
  }

  // Globes are painted pixel by pixel into one shared buffer, then put on screen in a single copy.
  // (Painting two globes as two separate clear-and-copy passes loses the first one on iOS Safari,
  // which can copy the buffer late, after the second globe has already overwritten it.)
  function bodiesBegin() {
    if (!bodyImg || bodyImg.width !== W || bodyImg.height !== H) {
      bodyCanvas.width = W; bodyCanvas.height = H;
      bodyImg = bodyCtx.createImageData(W, H);
      bodyBuf = new Uint32Array(bodyImg.data.buffer);
    }
    bodyBuf.fill(0);
  }
  function bodiesEnd() {
    bodyCtx.putImageData(bodyImg, 0, 0);
    ctx.drawImage(bodyCanvas, 0, 0);
  }

  // Paint a globe centred at (cx, cy) into the buffer. R is the camera rotation: surface normals
  // are turned back into world space, so the globe's face and lighting turn with the view.
  function renderBody(kind, cx, cy, r, R, light, spin = 0, tilt = 0, base = null) {
    const Lv = rot(R, light);
    const ct = Math.cos(tilt), st = Math.sin(tilt);
    const halo = kind === 'earth' ? 2.4 : 0, reach = r + halo;
    const v0 = base ?? (kind === 'earth' ? 0.16 : 0.3);   // backdrops sit a step darker than the vehicles
    const y0 = Math.max(0, Math.floor(cy - reach)), y1 = Math.min(H - 1, Math.ceil(cy + reach));
    for (let y = y0; y <= y1; y++) {
      const fy = y + 0.5 - cy;
      if (Math.abs(fy) > reach) continue;
      const span = Math.sqrt(reach * reach - fy * fy);
      const xa = Math.max(0, Math.floor(cx - span)), xb = Math.min(W - 1, Math.ceil(cx + span));
      for (let x = xa; x <= xb; x++) {
        const fx = x + 0.5 - cx, d2 = fx * fx + fy * fy;
        if (d2 > r * r) {
          // thin atmosphere glow along Earth's sunlit edge
          const d = Math.sqrt(d2) - r;
          if (d < halo) {
            const lit = (fx * Lv[0] - fy * Lv[1]) / Math.sqrt(d2);
            if (P.threshold(x, y) < (1 - d / halo) * 0.75 * clamp01(lit + 0.6)) bodyBuf[y * W + x] = u32(d < 1 ? C.sea2 : C.sea1);
          }
          continue;
        }
        const nx = fx / r, ny = -fy / r, nz = Math.sqrt(Math.max(0, 1 - d2 / (r * r)));
        // surface normal in world space, so the globe's face and lighting turn with the camera
        const wx = R[0] * nx + R[4] * ny + R[8] * nz, wy = R[1] * nx + R[5] * ny + R[9] * nz, wz = R[2] * nx + R[6] * ny + R[10] * nz;
        let v = v0 + (wx * light[0] + wy * light[1] + wz * light[2]) * 0.62;
        const yy = wy * ct - wz * st, zz = wy * st + wz * ct;
        const lat = Math.asin(Math.max(-1, Math.min(1, yy))), lon = Math.atan2(wx, zz) + spin;
        let ramp;
        if (kind === 'earth') ramp = earthRamp(lat, lon);
        else { const s = moonSurface(lat, lon); ramp = s.ramp; v += s.dv; }
        bodyBuf[y * W + x] = u32(P.dither(ramp, v, x, y));
      }
    }
  }

  const smallEarth = (x, y, r, light, spin) =>
    P.sphere(ctx, x, y, r, light, (nx, ny, nz) => earthRamp(Math.asin(ny), Math.atan2(nx, nz) + spin));

  /* ---------------- Scenes: everything as a function of mission time m ---------------- */

  const asc = (L) => ({ x: 0.1 * L * L, y: MT + 2.6 * L * L, tilt: 0.014 * L });
  const ascV = (L) => ({ x: 0.2 * L, y: 5.2 * L });

  function padScene(m) {
    const sc = { shot: 'pad', jets: [], emits: [] };
    const L = m - TL.liftoff, Ls = TL.srbSep - TL.liftoff;
    const b = L > 0 ? asc(L) : { x: 0, y: MT, tilt: 0 };
    const M = chain(T(b.x, b.y, 0), RZ(-b.tilt));
    sc.stackM = M;
    sc.orionOut = m >= TL.lasJet;
    sc.alt = L > 0 ? Math.round((b.y - MT) * 0.44) : 0;

    sc.srbM = [1, -1].map((side) => {
      if (L < Ls) return chain(M, T(0, 0, side * SRB_Z));
      // spent boosters peel away and tumble back down
      const bs = asc(Ls), vs = ascV(Ls), Ms = chain(T(bs.x, bs.y, 0), RZ(-bs.tilt));
      const c0 = pt(Ms, 0, 18, side * SRB_Z), tau = L - Ls;
      return chain(T(c0[0] + vs.x * tau, c0[1] + vs.y * tau - 17 * tau * tau, c0[2] + side * 3.5 * tau),
        RY(side * 0.3), RZ(-(bs.tilt - 0.7 * tau)), T(0, -18, 0));
    });

    // Sound suppression: rainbird nozzles throw big arcs of water across the launcher deck from
    // just before ignition until the rocket clears the tower, and the water floods over the deck.
    if (L > -1.4 && L < 2.6) {
      for (const [x, z] of RAINBIRDS) {
        const d = Math.hypot(x, z);
        sc.emits.push({ at: [x, MT + 0.8, z], n: 2, o: { spread: 2.4, up: 3, size: 3, life: 1.5, pal: 'water', vel: [(-x / d) * 12, 16, (-z / d) * 12], g: 22, floor: MT + 0.4 } });
      }
      for (let i = 0; i < 2; i++) {                // water pouring off the deck edges
        const a = Math.random() * Math.PI * 2;
        sc.emits.push({ at: [Math.cos(a) * 12, MT + 0.3, Math.sin(a) * 10], n: 1, o: { spread: 5, up: 3, size: 4, life: 1.3, pal: 'water', vel: [Math.cos(a) * 4, 0, Math.sin(a) * 4], g: 10, floor: 0.6 } });
      }
    }
    if (L > -0.5) sc.jets.push({ M, at: [0, -1.6, 0], power: L < 0 ? 0.6 : 0.9, r: 2, len: 0.75, pal: 'hydrolox' });
    if (L > -0.5 && L < 0) sc.emits.push({ at: [0, 1, 0], n: 4, o: { spread: 24, up: 3, size: 7, life: 4, pal: 'steam' } });   // the engines flash the water to steam
    if (L >= 0 && L < Ls) {
      for (const SM of sc.srbM) {
        sc.jets.push({ M: SM, at: [0, -1.8, 0], power: 1, r: 1.1, len: 1, pal: 'solid' });
        const e = pt(SM, 0, -2.5, 0);
        if (e[1] < 24) sc.emits.push({ at: [e[0], 1, e[2]], n: 3, o: { spread: 28, up: 3, size: 7, life: 4.5, pal: L < 2 ? 'steam' : 'smoke' } });
        else sc.emits.push({ at: e, n: 1, o: { spread: 2, up: 0, size: 2.6, life: 2.2 } });
      }
    }
    if (L >= Ls && L < Ls + 0.3) sc.srbM.forEach((SM) => sc.emits.push({ at: pt(SM, 0, 34, 0), n: 2, o: { spread: 3, size: 1.6, life: 0.8, pal: 'rcs', floor: -1e9 } }));

    if (sc.orionOut) {
      const tau = m - TL.lasJet;
      sc.lasM = chain(M, T(0.4 * tau * tau, 50.6 + 3 * tau + 20 * tau * tau, 0), RZ(-0.2 * tau));
      if (tau < 1.2) [1, -1].forEach((s) => sc.jets.push({ M: sc.lasM, at: [s * 0.5, 7.6, 0], dir: [s * 0.7, -0.7, 0], power: 1 - tau / 1.2, r: 0.3, len: 0.25, pal: 'solid' }));
    }

    const c = pt(M, 0, 30, 0);
    sc.focus = [lerp(6, c[0], 0.6), Math.max(34, c[1] + 4), -6];
    return sc;
  }

  function orbitScene(m) {
    const sc = { shot: 'orbit', jets: [], emits: [] };
    const X0 = -46.3;                           // stack frame origin, so ICPS + Orion sit around x = 0
    const tau = m - TL.orbit;
    if (tau < 2) {
      sc.coreM = chain(T(X0 - (3 * tau + 4 * tau * tau), -0.6 * tau * tau, 0), RZ(-Math.PI / 2 - 0.05 * tau));
      if (tau < 0.3) sc.emits.push({ at: [X0 + 43.5, 0, 0], n: 3, o: { spread: 4, size: 1.6, life: 0.9, pal: 'rcs', floor: -1e9 } });
    }
    const st = Math.max(0, m - TL.orionSep);
    sc.icpsM = chain(T(X0 + 39.5 - (0.8 * st + 0.9 * st * st), -0.3 * st, 0), RZ(-Math.PI / 2 - 0.15 * st));
    sc.orionM = chain(T(X0 + 48.1, 0, 0), RZ(-Math.PI / 2));
    sc.wings = smooth(m, TL.wingsA, TL.wingsB);
    if (m >= TL.tliA && m < TL.tliB) {
      sc.jets.push({ M: sc.icpsM, at: [0, -0.2, 0], power: smooth(m, TL.tliA, TL.tliA + 0.4), r: 0.8, len: 0.55, pal: 'hydrolox' });
    }
    if (m >= TL.orionSep && m < TL.orionSep + 0.4) {
      [[0, 1.2, 1.6], [0, 1.2, -1.6], [0, 1.2, 0]].forEach((p) => sc.emits.push({ at: pt(sc.orionM, p[0], p[1], p[2]), n: 1, o: { spread: 3, size: 1.2, life: 0.7, pal: 'rcs', floor: -1e9 } }));
    }
    // In orbit Earth is straight below, turning underneath. During the burn the stack points
    // forward (+x) and its exhaust streams back (-x), so Earth falls away behind it, the same way
    // the exhaust goes, shrinking as it recedes (placed by world direction, so this holds at any camera angle).
    const k = smooth(m, TL.tliA, TL.tliB + 1);
    const r0 = 1.35 * W, r = lerp(r0, 0.3 * W, k);
    const d0 = (H / 2 - 0.3 * W + r0) / Math.cos(BASE_PITCH), D = lerp(d0, 0.8 * Math.max(W, H), k);
    const v = [lerp(0, -0.9, k), lerp(-1, -0.35, k), lerp(0, 0.2, k)], n = Math.hypot(...v);
    sc.body = { kind: 'earth', dir: v.map((c) => (c / n) * D), r, light: [-0.5, 0.6, 0.62], spin: -0.7 + tau * 0.06, tilt: 1.13 };
    sc.focus = [lerp(0, X0 + 48.1 + ORION_MID, smooth(m, TL.orionSep, TL.orionSep + 2)), 0, 0];
    return sc;
  }

  function gatewayScene(m) {
    const sc = { shot: 'gateway', jets: [], emits: [] };
    // Orion comes in nose first along the station's axis, docks, and later turns around and leaves
    let ox = 10.2, yaw = Math.PI;
    if (m < TL.docked) ox = hermite(70, -32, 10.2, 0, TL.docked - TL.gateway, seg(m, TL.gateway, TL.docked));
    else if (m >= TL.orionUndock && m < TL.burnHome) {
      const u = seg(m, TL.orionUndock, TL.burnHome);
      ox = 10.2 + 3.5 * ease(u);
      yaw = Math.PI * (1 - ease(clamp01((u - 0.2) / 0.8)));
    } else if (m >= TL.burnHome) {
      const tau = m - TL.burnHome;
      ox = 13.7 + 2 * tau + 20 * tau * tau;
      yaw = 0;
    }
    sc.orionM = chain(T(ox, 0, 0), RY(yaw), RZ(-Math.PI / 2), T(0, -ORION_MID, 0));
    if (m >= TL.burnHome) sc.jets.push({ M: sc.orionM, at: [0, -0.9, 0], power: 1, r: 0.45, len: 0.35, pal: 'small' });
    if ((m > TL.docked - 0.8 && m < TL.docked) || (m > TL.orionUndock && m < TL.orionUndock + 0.4)) {
      sc.emits.push({ at: pt(sc.orionM, 0, 4.4, 1.3), n: 1, o: { spread: 2.5, size: 1, life: 0.6, pal: 'rcs', floor: -1e9 } });
    }

    // the lander waits under HALO, backs away to head down, and later climbs back up to it
    let hy = HLS_DOCK.y, show = true;
    if (m >= TL.undock && m < TL.surface) { const tau = m - TL.undock; hy -= 0.5 * tau + 0.9 * tau * tau; }   // eases away on thrusters
    else if (m >= TL.back && m < TL.redock) {
      const u = seg(m, TL.back, TL.redock);
      hy = hermite(HLS_DOCK.y - 62, 34, HLS_DOCK.y, 0, TL.redock - TL.back, u);
      if (u < 0.25) sc.jetsHLS = true;
    } else if (m >= TL.surface && m < TL.back) show = false;
    if (show) {
      sc.hlsM = chain(T(HLS_DOCK.x, hy, 0), T(0, -HLS_MID, 0));
      if (sc.jetsHLS) sc.jets.push({ M: sc.hlsM, at: [0, 1.8, 0], power: 1, r: 2.2, len: 0.7, pal: 'methalox' });
      if ((m > TL.undock && m < TL.undock + 0.8) || (m > TL.surface - 0.8 && m < TL.surface) || (m > TL.redock - 0.7 && m < TL.redock)) {
        sc.emits.push({ at: pt(sc.hlsM, 0, 28, 2.2), n: 1, o: { spread: 3, size: 1.4, life: 0.7, pal: 'rcs', floor: -1e9 } });
      }
    }
    // the Moon sits low in one corner, far below, so the docked lander reads as hanging in space
    // (it turns steadily underneath: Gateway and everything docked to it are always moving in orbit).
    // Starship undocks at the top of the orbit, the close pass over the north pole, so the Moon looms larger there.
    const nearPole = m >= TL.undockShot && m < TL.surface;
    sc.body = nearPole
      ? { kind: 'moon', cx: W * 1.02, cy: H * 1.3, r: W * 0.62, light: [-0.85, 0.3, 0.43], spin: 1.2 + m * 0.05, tilt: 0.9 }
      : { kind: 'moon', cx: W * 0.94, cy: H * 1.06, r: W * 0.4, light: [-0.85, 0.3, 0.43], spin: 0.4 + m * 0.03, tilt: 0.3 };
    sc.focus = SHOTS.gateway.rest;
    return sc;
  }

  function surfaceScene(m) {
    const sc = { shot: 'surface', jets: [], emits: [], crew: [] };
    let h = 0, main = 0, thr = 0;
    if (m < TL.mainOff) { h = hermite(150, -55, 16, -9, TL.mainOff - TL.surface, seg(m, TL.surface, TL.mainOff)); main = 1; }
    else if (m < TL.landed) { h = hermite(16, -9, 0, 0, TL.landed - TL.mainOff, seg(m, TL.mainOff, TL.landed)); thr = 1; }
    else if (m >= TL.liftoff2 && m < TL.mainOn2) { const tau = m - TL.liftoff2; h = 4.5 * tau * tau; thr = 1; }
    else if (m >= TL.mainOn2) { const tau = m - TL.mainOn2; h = 2.88 + 7.2 * tau + 13 * tau * tau; main = 1; }
    sc.hlsM = chain(T(0, h, 0));
    if (main) sc.jets.push({ M: sc.hlsM, at: [0, 1.8, 0], power: 1, r: 2.2, len: 0.8, pal: 'methalox' });
    if (thr) {
      THRUSTERS.forEach((a) => {
        const x = Math.cos(a) * 2.95, z = -Math.sin(a) * 2.95;
        sc.jets.push({ M: sc.hlsM, at: [x, 17.0, z], dir: [x * 0.12, -1, z * 0.12], power: 0.9, r: 0.35, len: 0.45, pal: 'methalox' });
      });
    }
    if ((main || thr) && h < 18) sc.emits.push({ at: [0, 0.6, 0], n: 3, o: { spread: 26, up: 1.2, size: 4.5, life: 2.6, pal: 'dust' } });

    // The cargo elevator swings out once landed and lowers the rover with both crew aboard;
    // they drive the route and park, walk back to the platform and ride it up. The rover stays.
    if (m >= TL.landed && m < TL.elevUp + 0.8) {
      sc.lift = LIFT.sill * (1 - smooth(m, TL.elevDown, TL.drive - 0.1) + smooth(m, TL.elevUp, TL.elevUp + 0.6));
    }
    if (m >= TL.elevDown) {
      const onLift = m < TL.drive;
      sc.track = ease(seg(m, TL.drive, TL.parkBack));
      const p = onLift ? { x: LIFT.x, z: 0, h: 0 } : roverPose(sc.track);
      sc.roverM = chain(T(p.x, onLift ? sc.lift + 0.3 : 0, p.z), RY(p.h), S(ROVER_SCALE));
      if (m < TL.walkBack) {
        [0.45, -0.45].forEach((z) => { const q = pt(sc.roverM, -0.1, 0, z); sc.crew.push({ x: q[0], z: q[2], face: p.h, step: 0, y: q[1] + 1 }); });
      }
      if (m >= TL.drive && m < TL.parkBack && Math.random() < 0.7) {
        sc.emits.push({ at: pt(sc.roverM, -1.7, 0.3, 0), n: 1, o: { spread: 3, up: 1.4, size: 1.6, life: 1.2, pal: 'dust' } });
      }
    }
    if (m >= TL.walkBack && m < TL.elevUp + 0.6) {
      const park = ROUTE[ROUTE.length - 1], riding = m >= TL.elevUp;
      [1, -1].forEach((s, i) => {
        const from = [park.x - 0.5, s * 2.8], to = [LIFT.x + (i ? -0.9 : 0.9), s * 1.1];
        const k = smooth(m, TL.walkBack + i * 0.12, TL.elevUp - 0.05);
        sc.crew.push({
          x: lerp(from[0], to[0], k), z: lerp(from[1], to[1], k), face: Math.atan2(-(to[1] - from[1]), to[0] - from[0]),
          step: riding ? 0 : m * 9 + i * 3, y: riding ? sc.lift + 0.3 : 0,
        });
      });
    }
    if (h < 10) sc.shadow = { x: 13 + h * 3.2, r: 13, ry: 2.4 };
    const look = smooth(m, TL.elevDown, TL.drive) * (1 - smooth(m, TL.walkBack, TL.elevUp + 0.6));   // ease over to watch the drive
    sc.focus = [12 * look, Math.max(lerp(14, 11, look), h + HLS_MID - 2), -5 * look];
    return sc;
  }

  function entryScene(m) {
    const sc = { shot: 'entry', jets: [], emits: [] };
    const k = smooth(m, TL.plasmaA, TL.plasmaB);
    const r = lerp(1.35, 3.2, k) * W, top = lerp(H - 0.3 * W, H * 0.52, k);
    sc.body = { kind: 'earth', cx: lerp(0.5, 0.45, k) * W, cy: top + r, r, light: [-0.5, 0.6, 0.62], spin: -2.25 + (m - TL.entry) * 0.05, tilt: 1.13 };
    const base = -ORION_MID;
    if (m < TL.smSep) {
      sc.orionM = chain(T(base, 0, 0), RZ(-Math.PI / 2));
      sc.focus = [0, 0, 0];
      return sc;
    }
    const tau = m - TL.smSep;
    if (tau < 3) sc.smM = chain(T(base - 2 * tau - 1.6 * tau * tau, -0.8 * tau * tau, 0), RZ(-Math.PI / 2 - 0.5 * tau));
    if (tau < 0.3) sc.emits.push({ at: [base + 2.6, 0, 0], n: 3, o: { spread: 3, size: 1.2, life: 0.7, pal: 'rcs', floor: -1e9 } });
    // the capsule turns its heat shield forward (+x), then the air lights up around it
    const yaw = Math.PI * smooth(m, TL.turnA, TL.turnB);
    const p = smooth(m, TL.plasmaA, TL.plasmaA + 1.4) * (1 - smooth(m, TL.plasmaB - 1, TL.plasmaB));
    const jit = p * 0.35;
    sc.cmM = chain(T(base + 2.8 + 1, 0, 0), RY(yaw), RZ(-Math.PI / 2), T(0, -1, 0));
    sc.plasma = p;
    sc.focus = [base + 3.8 + (Math.random() - 0.5) * jit, (Math.random() - 0.5) * jit, 0];
    return sc;
  }

  function oceanScene(m) {
    const sc = { shot: 'ocean', jets: [], emits: [] };
    let y;
    if (m < TL.drogue) y = 150 - 55 * (m - TL.ocean);
    else if (m < TL.mains) y = hermite(117, -45, 70, -18, TL.mains - TL.drogue, seg(m, TL.drogue, TL.mains));
    else if (m < TL.splash) y = hermite(70, -12, 0, -2.5, TL.splash - TL.mains, seg(m, TL.mains, TL.splash));
    else y = -0.5 + Math.sin(t * 2.2) * 0.12;          // bobbing on real time, so it keeps floating after the mission ends
    const sway = m < TL.splash ? Math.sin(m * 1.3) * 0.05 : 0;
    sc.cmM = chain(T(0, y, 0), RZ(sway));
    sc.capY = y;
    const apex = pt(sc.cmM, 0, 2.4, 0);
    sc.apex = apex;
    if (m >= TL.drogue && m < TL.mains + 0.1) sc.drogue = smooth(m, TL.drogue, TL.drogue + 0.3);
    if (m >= TL.mains && m < TL.splash + 1.2) {
      const fall = smooth(m, TL.splash, TL.splash + 1.2);
      sc.mains = { size: smooth(m, TL.mains, TL.mains + 0.9), drop: fall * 22, flat: 1 - fall * 0.85, fade: fall };
    }
    if (m >= TL.splash && m < TL.splash + 0.15) sc.emits.push({ at: [0, 0.5, 0], n: 10, o: { spread: 9, up: 9, size: 2.4, life: 1.4, pal: 'splash' } });
    if (m >= TL.splash) sc.ripple = m - TL.splash;
    sc.bags = smooth(m, TL.bags, TL.bags + 0.8);

    // the carrier launches Hornets as the capsule comes down, then sends Seahawks and a flyover
    sc.hornets = [];
    [[TL.jet1, CATS[0]], [TL.jet2, CATS[1]]].forEach(([at, catZ]) => {
      const h = hornetLaunch(m, at, catZ);
      if (!h) return;
      sc.hornets.push(h);
      if (h.blast && Math.random() < 0.6) sc.emits.push({ at: h.blast, n: 1, o: { spread: 2, up: 3, size: 1.4, life: 0.8, pal: 'rcs', floor: CARRIER.deck } });
    });
    hornetFlyby(m).forEach((M) => sc.hornets.push({ M, burner: true }));
    sc.hornets.forEach((h) => h.burner && sc.jets.push({ M: h.M, at: [-1.75, 0, 0], dir: [-1, 0, 0], power: 1, r: 0.22, len: 0.16, pal: 'small' }));
    sc.helos = [[TL.heloA, [6.5, 3.8], [8, 8.5, 6]], [TL.heloB, [-1.5, 3.6], [-5, 10, -6]]].map(([at, [px, pz], hover]) => {
      const h = seahawk(m, at, [CARRIER.x + px, CARRIER.deck + 0.75, CARRIER.z + pz], hover);
      if (h.hovering && Math.random() < 0.15) sc.emits.push({ at: [h.at[0], 0.4, h.at[2]], n: 1, o: { spread: 8, up: 0.8, size: 1, life: 0.7, pal: 'splash' } });   // rotor wash
      return h.M;
    });
    sc.spin = t * 9;                                  // rotors run on real time, so they keep turning after the mission ends

    // follow the capsule down, widen out to catch the catapult launches with it, then take in the whole group
    const kj = smooth(m, TL.jet1 - 1.5, TL.jet1 - 0.4), k = smooth(m, TL.splash, TL.splash + 2.2);
    const follow = [0, Math.max(20, y + 9), 0], jets = [12, (y + 3) / 2 + 6, -9], group = [16, 7, -10];
    sc.focus = follow.map((v, i) => lerp(lerp(v, jets[i], kj), group[i], k));
    sc.zoom = lerp(lerp(1, 0.85, kj), 0.95, k);
    return sc;
  }

  // four visits to the map: a lap of Earth, the coast out, a docked lap of the Moon, the trip home
  function mapScene(m) {
    let leg, f;
    if (m < TL.tli) { leg = 'lap'; f = seg(m, TL.lap, TL.tli); }
    else if (m < TL.gateway) { leg = 'out'; f = ease(seg(m, TL.out, TL.gateway)); }
    else if (m < TL.undockShot) { leg = 'docked'; f = 1; }
    else { leg = 'home'; f = ease(seg(m, TL.home, TL.entry)); }
    return { shot: 'map', jets: [], emits: [], leg, f, m, focus: [0, 0, 0] };
  }

  function scene(m) {
    switch (shotAt(m)) {
      case 'pad': return padScene(m);
      case 'orbit': return orbitScene(m);
      case 'map': return mapScene(m);
      case 'gateway': return gatewayScene(m);
      case 'surface': return surfaceScene(m);
      case 'entry': return entryScene(m);
      default: return oceanScene(m);
    }
  }

  /* ---------------- Drawing each shot ---------------- */

  const DRAW = {
    pad(sc) {
      drawGround(COL.ground, COL.groundB, COL.slab);
      r3.box(chain(T(0, MT / 2, 0), S(24, MT, 20)), COL.deck);
      const tx = -9.5;
      for (let y = MT, i = 0; y < MT + 66; y += 4, i++) r3.box(chain(T(tx, y + 2, 0), S(5, 4, 5)), i % 2 ? COL.towerA : COL.towerB);
      r3.box(chain(T(tx + 0.6, MT + 67.5, 0), S(7, 3, 3.5)), COL.towerB);
      r3.box(chain(T(-5.05, MT + 51.6, 0), S(3.9, 1.2, 1.4)), COL.arm);               // crew access arm
      r3.box(chain(T(-2.4, MT + 51.6, 0), S(1.4, 2, 2)), COL.offWhite);              // white room
      r3.box(chain(T(-4.8, MT + 44.6, 0), S(4.4, 0.8, 1)), COL.arm);
      r3.box(chain(T(-4.8, MT + 30, 0), S(4.4, 0.8, 1)), COL.arm);
      drawCore(sc.stackM);
      drawStackTop(sc.stackM, sc.orionOut);
      sc.srbM.forEach(drawSRB);
      if (sc.lasM) drawLAS(sc.lasM);
    },
    orbit(sc) {
      if (sc.coreM) drawCore(sc.coreM);
      drawICPS(sc.icpsM);
      drawOrion(sc.orionM, { wings: sc.wings });
    },
    gateway(sc) {
      drawGateway();
      if (sc.hlsM) drawHLS(sc.hlsM);
      drawOrion(sc.orionM);
    },
    surface(sc) {
      drawGround(COL.regA, COL.regB, COL.regSlab);
      for (const c of CRATERS) {
        r3.disc(c.x, 0.04, c.z, c.r, COL.rim, { sides: 14, layer: 1 });
        r3.disc(c.x + c.r * 0.08, 0.05, c.z, c.r * 0.74, COL.pit, { sides: 14, layer: 1 });
      }
      for (const k of ROCKS) r3.box(chain(T(k.x, k.s * 0.35, k.z), RY(k.a), S(k.s, k.s * 0.7, k.s * 0.8)), COL.rock);
      if (sc.shadow) r3.disc(sc.shadow.x, 0.06, 0, sc.shadow.r, COL.shadow, { sides: 16, layer: 1, ry: sc.shadow.ry });
      if (sc.track > 0) drawTracks(sc.track);
      if (sc.roverM) drawRover(sc.roverM);
      drawHLS(sc.hlsM, sc.lift ?? null);
      for (const a of sc.crew) drawAstronaut(a.x, a.z, a.face, a.step, a.y);
    },
    entry(sc) {
      if (sc.orionM) drawOrion(sc.orionM);
      if (sc.smM) drawOrion(sc.smM, { cm: false });
      if (sc.cmM) drawCM(sc.cmM);
    },
    ocean(sc) {
      drawGround(COL.seaA, COL.seaB, COL.seaSlab);
      for (const s of SPARKLES) {
        if (Math.abs(s.x - CARRIER.x) < 27 && Math.abs(s.z - CARRIER.z) < 9) continue;     // none under the carrier
        if (Math.sin(t * 2.4 + s.k * 3) > 0.82) r3.disc(s.x, 0.05, s.z, 0.45, COL.foam, { sides: 4, layer: 1 });
      }
      drawCarrier();
      sc.hornets.forEach((h) => drawHornet(h.M));
      sc.helos.forEach((M) => drawSeahawk(M, sc.spin));
      drawCM(sc.cmM, sc.bags);
      const a = sc.apex;
      if (sc.drogue) [1, -1].forEach((s) => drawChute(a[0] + s * 1.6, a[1] + 9, a[2], s * 0.2, 1.4, 1.2, sc.drogue, a));
      if (sc.mains && sc.mains.fade < 1) {
        const { size, drop, flat } = sc.mains;
        for (let k = 0; k < 3; k++) {
          const ang = (k / 3) * Math.PI * 2 + 0.5;
          const cx = a[0] + Math.cos(ang) * 4.2 * size, cz = a[2] + Math.sin(ang) * 4.2 * size;
          drawChute(cx + drop * 0.4, Math.max(0.3, a[1] + 3 + 15 * size - drop), cz, 0.22, 5, 2.6 * flat, size, a);
        }
      }
      if (sc.ripple !== undefined && sc.ripple < 2.2) {
        const rr = 2 + sc.ripple * 5;
        for (let i = 0; i < 16; i++) {
          const a0 = (i / 16) * Math.PI * 2, a1 = ((i + 1) / 16) * Math.PI * 2;
          r3.line([Math.cos(a0) * rr, 0.1, Math.sin(a0) * rr], [Math.cos(a1) * rr, 0.1, Math.sin(a1) * rr], COL.foam, { dotted: true });
        }
      }
    },
  };

  /* ---------------- The Earth-Moon map ---------------- */

  if (!P.SPRITES.gwTiny) P.SPRITES.gwTiny = ['nn.w.nn', 'nnwwwnn', '...w...'];

  // The map is a small schematic Earth-Moon system in its own 3D space, drawn through the same camera
  // angles as the other shots (tipped further down so the orbits open up), so dragging turns it.
  // The orbital plane is horizontal, Earth near-left and the Moon far-right. Orion launches from
  // Kennedy Space Center into a parking orbit around Earth. Gateway's near-rectilinear halo orbit
  // stands upright under the Moon, its close pass over the north pole; Gateway moves round it with
  // Kepler timing (quick over the pole, slow at the far end), one lap every ~6.5 days of mission time.
  // The trip out and the trip home cross in a figure eight.
  // Orion meets Gateway at the bottom of the orbit (the slow far end, where rendezvous is planned).
  // Docked, they make a full lap and carry on to the top, the close pass over the north pole,
  // where Starship undocks to head down. Orion later leaves for home from the bottom and rides
  // up over the pole on its way out. Each map visit times Gateway to be at the bottom when it starts.
  const NRHO = { days: 6.5, e: 0.6 };
  const keplerE = (M) => { let E = M; for (let i = 0; i < 8; i++) E -= (E - NRHO.e * Math.sin(E) - M) / (1 - NRHO.e * Math.cos(E)); return E; };
  function gatewayE(m, leg) {
    const ref = leg === 'docked' ? TL.dockedLap : leg === 'home' ? TL.home : TL.gateway;
    return keplerE(Math.PI + (2 * Math.PI * (realTime(m) - realTime(ref))) / (NRHO.days * DAY));
  }

  // map world: Earth, the Moon, Orion's parking orbit radius, the halo orbit's half-width and
  // half-height, the point the map camera looks at, Earth's turn (so Kennedy faces us) and the Sun
  const MAP = { E: [-26, 0, 14], Re: 5, Mo: [24, 0, -20], Rm: 2.2, park: 8.5, ax: 4, ay: 12, center: [-1, -3, -3], spin: -1.71, light: [-0.7, 0.3, 0.65] };
  const add3 = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
  const unit3 = (a) => { const n = Math.hypot(a[0], a[1], a[2]); return [a[0] / n, a[1] / n, a[2] / n]; };
  // Kennedy Space Center (28.5° N, 80.6° W) as a direction from Earth's centre, on the map's turned Earth
  const KSC = (() => { const lat = 28.5 / DEG, lon = -80.6 / DEG - MAP.spin; return [Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon)]; })();
  const park3 = (psi) => add3(MAP.E, [Math.cos(psi), 0, Math.sin(psi)], MAP.park);
  // eccentric anomaly 0 is the close pass over the north pole; the orbit stands in the plane z = Moon's z
  const NRHO_YC = MAP.Mo[1] + MAP.Rm + 1.5 - MAP.ay;
  const nrho3 = (Ea) => [MAP.Mo[0] - MAP.ax * Math.sin(Ea), NRHO_YC + MAP.ay * Math.cos(Ea), MAP.Mo[2]];

  function bez3(p0, p1, p2, p3, out, n = 60) {
    for (let i = 1; i <= n; i++) {
      const u = i / n, v = 1 - u, a = v * v * v, b = 3 * v * v * u, c = 3 * v * u * u, d = u * u * u;
      out.push([0, 1, 2].map((j) => a * p0[j] + b * p1[j] + c * p2[j] + d * p3[j]));
    }
  }
  // resample a 3D polyline into even steps, about a pixel apart on screen
  function dense3(pts, step = 0.5) {
    const res = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / step));
      for (let j = 1; j <= n; j++) res.push([0, 1, 2].map((k) => a[k] + ((b[k] - a[k]) * j) / n));
    }
    return res;
  }

  const MAP_PATHS = (() => {
    const { E, Re, Mo, Rm } = MAP;
    // ascent: from the pad at Kennedy up into the parking orbit
    const pad = add3(E, KSC, Re), ins = park3(Math.PI / 2);
    const ascent = [pad];
    bez3(pad, add3(pad, KSC, 3), add3(ins, [3, 0, 0]), ins, ascent, 24);
    // a lap and a half of the parking orbit, ending on the far side heading for the Moon
    const lap = [];
    for (let i = 0; i <= 160; i++) lap.push(park3(Math.PI / 2 + (i / 160) * 3 * Math.PI));
    // out: the burn sends Orion across the gap past the Moon's near side, round its far side and up
    // over the north pole into the halo orbit, then down the near half to meet Gateway at the bottom
    const R = Rm + 1.5, p0 = lap[lap.length - 1], fly = add3(Mo, [0, 0, R]);
    const out = [p0];
    bez3(p0, add3(p0, [22, 0, 0]), add3(fly, [-22, 0, 0]), fly, out);
    for (let i = 1; i <= 24; i++) {
      const a = (i / 24) * Math.PI;   // near side, round to the far right, then up over the pole
      out.push(add3(Mo, a < Math.PI / 2 ? [Math.sin(a), 0, Math.cos(a)] : [Math.cos(a - Math.PI / 2), Math.sin(a - Math.PI / 2), 0], R));
    }
    for (let i = 1; i <= 48; i++) out.push(nrho3((i / 48) * Math.PI));
    // home: from the bottom up the far half and over the pole, then a long fall back that crosses the
    // outbound path and comes straight down into the atmosphere (no Earth orbit on the way home)
    const home = [];
    for (let i = 0; i <= 48; i++) home.push(nrho3(Math.PI + (i / 48) * Math.PI));
    const q0 = home[home.length - 1], en = unit3([0.55, 0.1, 0.83]), entry = add3(E, en, Re);
    bez3(q0, add3(q0, [-20, -2, -14]), add3(entry, en, 16), entry, home);
    return {
      ascent: dense3(ascent), lap: dense3(lap), out: dense3(out), home: dense3(home),
      ring: dense3(Array.from({ length: 97 }, (_, i) => nrho3((i / 96) * Math.PI * 2))),
    };
  })();

  function drawMap(sc) {
    const { leg, m } = sc, { E, Re, Mo, Rm, center } = MAP;
    // the map's camera: the shared yaw (the default faces the map square-on) and a steeper pitch
    const R = camRot(cam.yaw - BASE_YAW, Math.min(1.45, cam.pitch + 0.45));
    const zoom = (Math.min(W, H) / 70) * cam.mul;
    const proj = (p) => {
      const v = rot(R, [p[0] - center[0], p[1] - center[1], p[2] - center[2]]);
      return [W / 2 + v[0] * zoom, H / 2 - v[1] * zoom, v[2]];
    };
    const ec = proj(E), mc = proj(Mo), er = Re * zoom, mr = Rm * zoom;
    // anything behind Earth or the Moon (farther than its centre) and inside its disc is hidden
    const hidden = (s) => (s[2] < ec[2] && Math.hypot(s[0] - ec[0], s[1] - ec[1]) < er)
      || (s[2] < mc[2] && Math.hypot(s[0] - mc[0], s[1] - mc[1]) < mr);
    bodiesBegin();
    renderBody('earth', ec[0], ec[1], er, R, MAP.light, MAP.spin, 0, 0.42);
    renderBody('moon', mc[0], mc[1], mr, R, MAP.light, 0.4, 0, 0.42);
    bodiesEnd();

    const dot = (s, col) => { if (!hidden(s)) { ctx.fillStyle = col; ctx.fillRect(Math.round(s[0]), Math.round(s[1]), 1, 1); } };
    // traveled stretches are bright dots, the rest fainter, sparser dots
    const trace = (path, f) => path.forEach((p, i) => {
      const lit = i <= f * (path.length - 1);
      if (lit ? i % 2 === 0 : i % 3 === 0) dot(proj(p), lit ? COL.pathLit : COL.path);
    });
    const lapF = leg === 'lap' ? sc.f : 1, outF = leg === 'lap' ? 0 : leg === 'out' ? sc.f : 1, homeF = leg === 'home' ? sc.f : 0;
    MAP_PATHS.ring.forEach((p, i) => i % 3 === 0 && dot(proj(p), COL.path));
    trace(MAP_PATHS.ascent, 1);
    trace(MAP_PATHS.lap, lapF);
    trace(MAP_PATHS.out, outF);
    if (leg === 'home') trace(MAP_PATHS.home, homeF);
    // the docked lap leaves a trail of bright dots round the halo orbit, from the bottom to where they are now
    const gE = gatewayE(m, leg);
    if (leg === 'docked') {
      let prev = nrho3(Math.PI), run = 0;
      for (let Ea = Math.PI; Ea <= gE; Ea += 0.01) {
        const p = nrho3(Ea);
        run += Math.hypot(p[0] - prev[0], p[1] - prev[1], p[2] - prev[2]);
        prev = p;
        if (run >= 1) { run = 0; dot(proj(p), COL.pathLit); }
      }
    }
    // Kennedy Space Center: a gold dot on Florida, when that side of Earth faces us
    if (rot(R, KSC)[2] > 0) {
      const k = proj(add3(E, KSC, Re));
      ctx.fillStyle = COL.ksc;
      ctx.fillRect(Math.round(k[0]) - 1, Math.round(k[1]) - 1, 2, 2);
    }
    // Gateway is always moving round its orbit; while docked, Orion rides along on its bottom port
    const gs = proj(nrho3(gE)), { w, h } = P.size('gwTiny');
    if (!hidden(gs)) P.drawSprite(ctx, 'gwTiny', gs[0] - (w - 1) / 2, gs[1] - (h - 1) / 2, 1, P.DARK_KEY);
    const at = (path, f) => path[Math.round(clamp01(f) * (path.length - 1))];
    const o = leg === 'lap' ? at(MAP_PATHS.lap, lapF) : leg === 'out' ? at(MAP_PATHS.out, outF) : leg === 'home' ? at(MAP_PATHS.home, homeF) : null;
    const os = leg === 'docked' ? [gs[0] + 0.5, gs[1] + 2.5, gs[2]] : o && proj(o);
    if (os && !hidden(os)) { ctx.fillStyle = '#ffffff'; ctx.fillRect(Math.round(os[0]) - 1, Math.round(os[1]) - 1, 2, 2); }
  }

  /* ---------------- Exhaust, particles, stars ---------------- */

  function jet({ M, at, dir = [0, -1, 0], power, r, len = 1, pal }) {
    if (power <= 0) return;
    const a = r3.project(pt(M, at[0], at[1], at[2]));
    const b = r3.project(pt(M, at[0] + dir[0] * 10, at[1] + dir[1] * 10, at[2] + dir[2] * 10));
    let dx = b[0] - a[0], dy = b[1] - a[1];
    const d = Math.hypot(dx, dy) || 1;
    dx /= d; dy /= d;
    const L = Math.max(2, Math.round(power * len * (17 + Math.random() * 7) * Math.max(1, cam.zoom)));
    const w = Math.max(0.6, r * cam.zoom * 1.05);
    const F = FLAME[pal];
    for (let i = 0; i < L; i++) {
      const k = i / L;
      const half = w * (1 - k * 0.7) * (i < 2 ? 0.8 : 1);
      const cx = a[0] + dx * i, cy = a[1] + dy * i;
      for (let o = -half; o <= half; o += 1) {
        if (Math.random() < k * 0.6) continue;
        const e = Math.abs(o) / half;
        ctx.fillStyle = k < 0.25 && e < 0.55 ? F[0] : k < 0.5 && e < 0.8 ? F[1] : k < 0.78 ? F[2] : F[3];
        ctx.fillRect(Math.round(cx - dy * o), Math.round(cy + dx * o), 1, 1);
      }
    }
  }

  // re-entry: a bright cap on the heat shield and streaks flowing back past the capsule
  function plasma(M, p) {
    if (p <= 0) return;
    jet({ M, at: [0, -0.3, 0], dir: [0, -1, 0], power: p, r: 1.5, len: 0.04, pal: 'plasma' });
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2, x = Math.cos(a) * 1.45, z = Math.sin(a) * 1.45;
      jet({ M, at: [x, 0.1, z], dir: [-x * 0.09, 1, -z * 0.09], power: p * (0.8 + 0.2 * Math.random()), r: 0.3, len: 0.42, pal: 'plasma' });
    }
  }

  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
  const puffCache = new Map();
  function puff(r, density, shade, pal) {
    const key = `${r}|${density}|${shade}|${pal}`;
    let c = puffCache.get(key);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = c.height = r * 2 + 1;
    const g = c.getContext('2d');
    g.fillStyle = PUFF[pal][shade];
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) {
        const d = Math.hypot(x, y) / (r + 0.5);
        if (d > 1) continue;
        if (BAYER[((y + 64) & 3) * 4 + ((x + 64) & 3)] < (density / 4) * (1 - d * d * 0.6)) g.fillRect(x + r, y + r, 1, 1);
      }
    }
    puffCache.set(key, c);
    return c;
  }

  /* ---------------- Fireworks over the recovery group ---------------- */

  // A quick salvo after the flyover, then a burst every so often while the end shot stays up.
  // Shells go up from the carrier deck and burst into sparks that arc down and twinkle out.
  // Each colour runs [flash, colour, embers].
  const FW_COLORS = [
    ['#fff6d8', '#ffd700', '#8a7420'], ['#fff6d8', '#e0533a', '#7a2b20'], ['#ffffff', '#6e9bd0', '#2f4c74'],
    ['#fff6d8', '#9cc68c', '#36603a'], ['#ffffff', '#f2a25a', '#8e4225'],
  ];
  let shells = [], sparks = [], nextShell = 0;
  function launchShell() {
    shells.push({
      x: CARRIER.x + lerp(-22, 16, Math.random()), y: CARRIER.deck + 0.5, z: CARRIER.z + lerp(-3, 3, Math.random()),
      vx: (Math.random() - 0.5) * 4, vy: 25 + Math.random() * 7, vz: (Math.random() - 0.5) * 4,
      fuse: 0.9 + Math.random() * 0.4, col: FW_COLORS[Math.floor(Math.random() * FW_COLORS.length)],
    });
  }
  function burst(s) {
    const n = 60 + Math.floor(Math.random() * 26), speed = 16 + Math.random() * 6;
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u), sp = speed * (0.85 + Math.random() * 0.3);
      sparks.push({ x: s.x, y: s.y, z: s.z, vx: r * Math.cos(a) * sp, vy: u * sp, vz: r * Math.sin(a) * sp, age: 0, life: 1.4 + Math.random() * 0.6, col: s.col });
    }
    window.SpaceRadio?.cue('firework');
  }
  function updateFireworks(dt) {
    for (const s of shells) {
      s.fuse -= dt; s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt; s.vy -= 9 * dt;
      if (s.fuse <= 0) burst(s);
    }
    shells = shells.filter((s) => s.fuse > 0);
    sparks = sparks.filter((p) => (p.age += dt) < p.life);
    for (const p of sparks) {
      const d = Math.exp(-dt * 2.2);
      p.vx *= d; p.vy = p.vy * d - 7 * dt; p.vz *= d;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    }
  }
  function drawFireworks() {
    for (const s of shells) {
      const a = r3.project([s.x, s.y, s.z]);
      ctx.fillStyle = '#fff6d8';
      ctx.fillRect(Math.round(a[0]), Math.round(a[1]), 1, 2);
    }
    for (const p of sparks) {
      const k = p.age / p.life;
      if (k > 0.55 && Math.random() < (k - 0.55) * 1.6) continue;           // twinkle out as they fade
      const s = r3.project([p.x, p.y, p.z]);
      ctx.fillStyle = k < 0.12 ? p.col[0] : k < 0.6 ? p.col[1] : p.col[2];
      ctx.fillRect(Math.round(s[0]), Math.round(s[1]), 1, 1);
      if (k < 0.45) {                                                          // a short streak while they're fast
        const b = r3.project([p.x - p.vx * 0.05, p.y - p.vy * 0.05, p.z - p.vz * 0.05]);
        ctx.fillRect(Math.round(b[0]), Math.round(b[1]), 1, 1);
      }
    }
  }

  let parts = [];
  // vel adds a push in one direction (water jets); g pulls it back down
  function emit([x, y, z], n, { spread = 4, up = 1, size = 2, life = 2, pal = 'smoke', floor = 0.5, vel = [0, 0, 0], g = 0 } = {}) {
    for (let i = 0; i < n && parts.length < 1000; i++) {
      const a = Math.random() * Math.PI * 2, sp = spread * (0.4 + Math.random() * 0.6);
      parts.push({
        x, y, z, vx: Math.cos(a) * sp + vel[0], vy: up * Math.random() + vel[1], vz: Math.sin(a) * sp + vel[2],
        age: 0, life: life * (0.7 + Math.random() * 0.6), size: 0.6, max: size * (0.6 + Math.random() * 0.6), pal, floor, g,
      });
    }
  }

  function drawParts() {
    const items = parts.map((p) => ({ p, s: r3.project([p.x, p.y, p.z]) })).sort((a, b) => a.s[2] - b.s[2]);
    for (const { p, s } of items) {
      const k = p.age / p.life;
      const r = Math.max(1, Math.min(9, Math.round(p.size * cam.zoom)));
      const img = puff(r, Math.max(1, 4 - Math.floor(k * 4)), k < 0.3 ? 0 : k < 0.65 ? 1 : 2, p.pal);
      ctx.drawImage(img, Math.round(s[0] - r), Math.round(s[1] - r));
    }
  }

  let stars = [];
  function drawStars(shiftY, shiftX = 0) {
    const fade = 0.16 * Math.min(W, H);
    for (const st of stars) {
      const y = Math.floor((((st.y + shiftY) % (H * 2)) + H * 2) % (H * 2)) - Math.floor(H / 2);
      if (y < 0 || y >= H) continue;
      const x = Math.floor((((st.x + shiftX) % W) + W) % W);
      const edge = Math.min(x, W - x, y, H - y) / fade;
      if (st.k * 1.1 > edge + 0.2) continue;
      ctx.fillStyle = st.k > 0.93 ? COL.star2 : st.k > 0.75 ? COL.star1 : COL.star0;
      ctx.fillRect(x, y, 1, 1);
    }
  }

  // ordered-dither cut between shots
  const wipePatterns = [];
  function wipe(k) {
    const lvl = Math.round(clamp01(k) * 16);
    if (lvl <= 0) return;
    if (!wipePatterns[lvl]) {
      const c = document.createElement('canvas');
      c.width = c.height = 4;
      const g = c.getContext('2d');
      g.fillStyle = COL.space;
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) if (P.threshold(x, y) < lvl / 16) g.fillRect(x, y, 1, 1);
      wipePatterns[lvl] = ctx.createPattern(c, 'repeat');
    }
    ctx.fillStyle = wipePatterns[lvl];
    ctx.fillRect(0, 0, W, H);
  }

  /* ---------------- Frame ---------------- */

  let W = 0, H = 0, scale = 2;
  const cam = { yaw: 0.78, pitch: 0.26, zoom: 1, base: 1, mul: 1, user: false, target: SHOTS.pad.rest.slice() };
  const DEFAULT_LIGHT = r3.light;
  const LOW_SUN = (() => { const v = [-0.92, 0.22, 0.3], m = Math.hypot(...v); return v.map((c) => c / m); })();
  let mission = null;
  let cur = null, lastShot = 'pad', cutAt = -1;
  let t = 0, running = false, raf = 0, last = 0, visible = true;

  const missionTime = () => (mission ? mission.t : 0);

  function draw() {
    const sc = cur || scene(missionTime());
    cam.zoom = cam.base * cam.mul * SHOTS[sc.shot].zoom * (sc.zoom || 1);
    ctx.fillStyle = COL.space;
    ctx.fillRect(0, 0, W, H);
    // stars wheel with the camera too (and slide down past the climbing rocket on the pad)
    drawStars((sc.shot === 'pad' ? cam.target[1] * cam.zoom * 0.35 : 0) + cam.pitch * H * 0.8, -cam.yaw * W * 0.45);
    if (sc.shot === 'map') {
      drawMap(sc);
    } else {
      if (sc.body) drawBody(sc.body);
      if (sc.shot === 'surface') {
        const e = skyPos(W * 0.8, H * 0.24);
        if (e) smallEarth(Math.round(e[0]), Math.round(e[1]), Math.max(3, Math.round(Math.min(W, H) * 0.04)), [-0.92, 0.22, 0.3], 0.9);
      }
      r3.light = sc.shot === 'surface' ? LOW_SUN : DEFAULT_LIGHT;
      r3.setView({ W, H, yaw: cam.yaw, pitch: cam.pitch, zoom: cam.zoom, target: cam.target });
      DRAW[sc.shot](sc);
      r3.render();
      drawParts();
      for (const j of sc.jets) jet(j);
      if (sc.plasma) plasma(sc.cmM, sc.plasma);
      if (sc.shot === 'ocean') drawFireworks();
    }
    if (cutAt >= 0) wipe(1 - (t - cutAt) / 0.3);
  }

  /* ---------------- HUD ---------------- */

  function sls(text, m) {
    const sc = cur;
    return sc && sc.shot === 'pad' && m > TL.liftoff && sc.alt > 0 ? `${text} · ${sc.alt} km` : text;
  }
  const ORION_LINES = [
    [TL.liftoff - 0.5, () => 'SLS · Water deluge on'], [TL.liftoff, () => 'SLS · Ignition'], [5, () => 'SLS · Liftoff'], [5.8, (m) => sls('SLS · Ascent', m)],
    [7.2, (m) => sls('SLS · Max-Q', m)], [TL.srbSep, (m) => sls('SLS · Ascent', m)], [TL.lasJet, (m) => sls('SLS · Booster sep', m)],
    [11.8, (m) => sls('SLS · Abort tower off', m)], [TL.orbit, (m) => sls('SLS · Core stage burn', m)],
    [15.4, () => 'SLS · Core stage sep'], [TL.lap, () => 'Orion · Solar wings out'], [TL.tliA, () => 'Orion · Orbiting Earth'],
    [TL.tliB, () => 'Upper stage · Burn to Moon'], [TL.out, () => 'Orion · Separation'],
    [30.8, () => 'Orion · Coasting to Moon'], [31.8, () => 'Orion · Lunar flyby'], [TL.gateway, () => 'Orion · Catching Gateway'],
    [TL.docked, () => 'Orion · Approaching Gateway'], [TL.dockedLap, () => 'Orion · Docked at Gateway ✓'],
    [TL.undockShot, () => 'Orion · Docked, orbiting Moon'], [TL.orionUndock, () => 'Orion · Waiting at Gateway'],
    [TL.burnHome, () => 'Orion · Undocking'], [TL.home, () => 'Orion · Burn for home'],
    [TL.home + 2.4, () => 'Orion · Leaving lunar orbit'], [TL.home + 3.4, () => 'Orion · Lunar flyby'],
    [TL.entry, () => 'Orion · Coasting home'], [TL.turnB, () => 'Orion · Service module sep'], [TL.ocean, () => 'Orion · Entry · 40,000 km/h'],
    [TL.mains, () => 'Orion · Drogue chutes'], [TL.splash, () => 'Orion · Main chutes'], [Infinity, () => 'Orion · Splashdown ✓'],
  ];
  const LANDER_LINES = [
    [TL.dockedLap, () => 'Starship · Waiting at Gateway'], [TL.undock, () => 'Starship · 2 crew aboard'],
    [TL.surface, () => 'Starship · Undocking'], [TL.mainOff, () => 'Starship · Descent burn'], [TL.landed, () => 'Starship · Landing engines'],
    [TL.elevDown, () => 'Starship · On the Moon ✓'],
    [TL.drive, () => 'Starship · Lowering the rover'],
    [TL.walkBack, (m) => `Rover · Exploring · day ${surfaceDay(m)}`],
    [TL.elevUp, (m) => `Starship · Moonwalk · day ${surfaceDay(m)}`],
    [TL.liftoff2, () => 'Starship · Crew back aboard'], [TL.back, () => 'Starship · Liftoff'], [TL.redock, () => 'Starship · Docking'],
    [TL.orionUndock, () => 'Starship · Docked ✓'], [TL.ocean, () => 'Starship · Stays at Gateway'],
    // by splashdown the third line belongs to the Navy
    [TL.jet1, () => 'Navy · Carrier standing by'], [TL.heloA, () => 'Navy · Launching Hornets'],
    [TL.flyby, () => 'Navy · Seahawks inbound'], [TL.flyby + 1.6, () => 'Navy · Hornet flyover'],
    [TL.fireworks + 0.8, () => 'Navy · Seahawks overhead ✓'], [Infinity, () => 'Navy · Welcome home ✓'],
  ];
  const surfaceDay = (m) => Math.min(7, Math.floor((realTime(m) - 15.15 * DAY) / DAY) + 1);
  const lineAt = (list, m) => list.find(([until]) => m < until)[1](m);

  let hudCache = '', livePhase = -1;
  function updateHud() {
    const m = missionTime();
    const i = mission ? phaseAt(m) : -1;
    let line;
    if (!mission) line = 'Kennedy Space Center · Pad 39B';
    else if (m >= TL.done) line = `${clockText(m)} · Home ✓`;
    else if (m < TL.liftoff) line = `${clockText(m)} · Ignition`;
    else line = `${clockText(m)} · ${PHASES[i].name}`;
    const o = mission ? lineAt(ORION_LINES, m) : 'SLS · On the pad';
    const l = mission ? lineAt(LANDER_LINES, m) : 'Starship · Waiting at Gateway';
    const key = line + o + l + i;
    if (key === hudCache) return;
    hudCache = key;
    clockEl.textContent = line;
    orionEl.textContent = o;
    landerEl.textContent = l;
    orionEl.classList.toggle('is-done', /✓/.test(o));
    landerEl.classList.toggle('is-done', /✓/.test(l));
    dots.forEach((d, k) => {
      d.dataset.state = !mission ? '' : k < i || m >= TL.done ? 'done' : k === i ? 'now' : '';
      if (k === i && mission) d.setAttribute('aria-current', 'step'); else d.removeAttribute('aria-current');
    });
    const liveKey = m >= TL.done ? PHASES.length : i;
    if (mission && liveKey !== livePhase) {
      livePhase = liveKey;
      liveEl.textContent = m >= TL.done ? 'Splashdown. Mission complete.' : PHASES[i].name;
    }
  }

  /* ---------------- Update ---------------- */

  const CUES = [[TL.docked, 'gateway'], [TL.landed, 'landed'], [TL.redock, 'catch'], [TL.splash, 'landed']];

  function update(dt) {
    t += dt;
    if (!cam.user) cam.yaw = 0.78 + Math.sin(t * 0.18) * 0.25;
    // paused: the mission clock, smoke and spray all hold still; the camera can still be dragged
    const paused = !!(mission && mission.paused);
    if (!paused) {
      parts = parts.filter((p) => (p.age += dt) < p.life);
      for (const p of parts) {
        p.vy -= p.g * dt;
        p.x += p.vx * dt; p.y = Math.max(p.floor, p.y + p.vy * dt); p.z += p.vz * dt;
        const drag = Math.exp(-dt * 1.6);
        p.vx *= drag; p.vz *= drag; p.vy *= Math.exp(-dt * 0.8);
        p.size += (p.max - p.size) * (1 - Math.exp(-dt * 1.5));
      }
    }
    const before = missionTime();
    if (mission && !paused && mission.t < TL.done) mission.t = Math.min(TL.done, mission.t + dt);
    const m = missionTime();
    if (mission) for (const [at, id] of CUES) if (before < at && m >= at) window.SpaceRadio?.cue(id);
    settle(scene(m));
    if (!paused) for (const e of cur.emits) emit(e.at, e.n, e.o);
    // fireworks: a quick salvo once they start, then one every second or so while the end shot stays up
    if (!paused) {
      if (cur.shot === 'ocean' && m >= TL.fireworks && t >= nextShell) {
        launchShell();
        nextShell = t + (m < TL.done ? 0.3 + Math.random() * 0.3 : 0.8 + Math.random() * 0.9);
      }
      updateFireworks(dt);
    }
    if (mission && m >= TL.done && launchBtn.dataset.mode !== 'reset') setButton('reset');
    const k = 1 - Math.exp(-dt * 4);
    cam.target = cam.target.map((v, i) => v + (cur.focus[i] - v) * k);
  }

  // adopt a new scene; on a change of shot, cut the camera straight to it
  function settle(sc) {
    if (sc.shot !== lastShot) {
      parts = []; shells = []; sparks = [];
      cam.target = sc.focus.slice();
      cutAt = mission && !reduce.matches ? t : -1;
      lastShot = sc.shot;
    }
    if (cutAt >= 0 && t - cutAt > 0.3) cutAt = -1;
    cur = sc;
  }

  const BUTTON = { launch: 'Launch', pause: 'Pause', resume: 'Resume', reset: 'Reset' };
  function setButton(mode) {
    launchBtn.dataset.mode = mode;
    launchBtn.querySelector('span:last-child').textContent = BUTTON[mode];
  }

  // Jump to a phase. While paused it shows that phase's key moment and stays paused,
  // so you can step through the mission dot by dot and look around each one.
  function jumpTo(i) {
    const p = PHASES[i];
    const paused = !reduce.matches && !!(mission && mission.paused && mission.t < TL.done);
    parts = []; shells = []; sparks = [];
    livePhase = -1;
    mission = { t: reduce.matches || paused ? p.key : p.at, paused };
    if (i === 0 && !reduce.matches && !paused) window.SpaceRadio?.cue('launch');
    if (reduce.matches || paused) {
      settle(scene(mission.t));
      cam.target = cur.focus.slice();
    }
    if (reduce.matches) { setButton('reset'); paint(); return; }
    setButton(paused ? 'resume' : 'pause');
    start();
  }

  function togglePause() {
    if (!mission) return;
    mission.paused = !mission.paused;
    setButton(mission.paused ? 'resume' : 'pause');
    liveEl.textContent = mission.paused ? 'Paused' : PHASES[phaseAt(mission.t)].name;
    start();
  }

  function launch() {
    if (mission) return;
    if (reduce.matches) { jumpTo(PHASES.length - 1); mission.t = TL.done; settle(scene(TL.done)); cam.target = cur.focus.slice(); paint(); return; }
    jumpTo(0);
  }

  function resetPad() {
    mission = null; parts = []; shells = []; sparks = []; livePhase = -1;
    settle(scene(0));
    cam.target = cur.focus.slice();
    setButton('launch');
    paint();
  }

  launchBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const mode = launchBtn.dataset.mode;
    if (mode === 'reset') resetPad();
    else if (mode === 'launch') launch();
    else togglePause();
  });

  const dots = PHASES.map((p, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'phases__dot';
    b.title = p.name;
    b.setAttribute('aria-label', `Jump to ${p.name}`);
    b.addEventListener('click', (e) => { e.stopPropagation(); jumpTo(i); });
    phasesEl.appendChild(b);
    return b;
  });

  function setZoom(mul) {
    cam.mul = Math.max(0.6, Math.min(3, mul));
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
    const rnd = seeded(11);
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
    buildStars();
    paint();
  }

  setButton('launch');
  settle(scene(0));
  new ResizeObserver(resize).observe(stage);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; visible ? start() : stop(); }).observe(stage);
  }
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  resize();
  start();
})();
