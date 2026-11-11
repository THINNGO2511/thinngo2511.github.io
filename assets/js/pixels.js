/* Shared pixel-art helpers: palette, sprites and a dithered sphere renderer. */
(() => {
  'use strict';

  // Same colors as the CSS tokens, plus shade ramps for planets.
  const PALETTE = {
    space: '#313131',                 // page background; the scene floats on it
    star0: '#454545', star1: '#5f5f5f', star2: '#8c8c8c',
    orbit0: '#474747', orbit1: '#5a5a5a',
    hud: '#e8e3d8',
    plate: '#ebe3d0',
    paper: '#fbf8f1',
    ink: '#1f1d1a',
    ink2: '#5d5850',
    faint: '#cbc1ab',
    faint2: '#b5ab95',
    clay: '#bf5b36',
    green: '#5e9a5b',
    blue: '#6e9bd0',
    mint: '#bfd6cf',
    sand: '#e3d2ae',
    yellow: '#f2d88a',

    sun0: '#fbe9a8', sun1: '#f2c75e', sun2: '#de8a3f',
    sea0: '#2f4c74', sea1: '#5b86bd', sea2: '#9cc0de',
    land0: '#36603a', land1: '#5e9a5b', land2: '#9cc68c',
    ice0: '#9fb2b8', ice1: '#e4ebe6', ice2: '#fbf8f1',
    mars0: '#73311e', mars1: '#b4552f', mars2: '#dc8c5f',
    marsd0: '#5a2717', marsd1: '#8e4225', marsd2: '#b9653d',
    venus0: '#94733f', venus1: '#cdab69', venus2: '#ecd6a3',
    merc0: '#5b554d', merc1: '#8a8377', merc2: '#b9b1a2',
    jup0: '#6e4a31', jup1: '#b48657', jup2: '#e3c39a',
    jupb0: '#5c3a24', jupb1: '#94603d', jupb2: '#c4936a',
    sat0: '#7d6640', sat1: '#c9ad76', sat2: '#efdcae',
    ring0: '#7f7154', ring1: '#b3a179',
    ura0: '#3d7a82', ura1: '#84bfbe', ura2: '#c4e5e1',
    nep0: '#253f78', nep1: '#4a6fc0', nep2: '#8eaee6',
    moon0: '#4e4b47', moon1: '#8f8b84', moon2: '#d4d0c6',
    mare0: '#403d3a', mare1: '#6e6a64', mare2: '#a29d93',
  };

  // 4×4 ordered-dither thresholds, 0..1
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
  const threshold = (x, y) => BAYER[((y & 3) << 2) | (x & 3)];

  // Pick a color from a ramp (dark → light) for value v in 0..1, dithered.
  const dither = (ramp, v, x, y) => {
    const f = Math.max(0, Math.min(0.9999, v)) * (ramp.length - 1);
    const i = Math.floor(f);
    return ramp[Math.min(ramp.length - 1, i + (f - i > threshold(x, y) ? 1 : 0))];
  };

  /* Sprites: one string per row. '.' is transparent. */
  const KEY = {
    k: PALETTE.ink, d: PALETTE.ink2, w: PALETTE.paper, c: PALETTE.clay, g: PALETTE.green,
    b: PALETTE.blue, m: PALETTE.mint, y: PALETTE.yellow, s: PALETTE.sand, o: PALETTE.sun2,
    f: PALETTE.faint2, n: PALETTE.sea0,
  };
  // Same sprites on the dark scene: outlines turn light, solar panels turn gold.
  const DARK_KEY = { ...KEY, k: '#bdb7aa', d: '#7f796f', n: '#c9a24a' };

  const SPRITES = {
    issMini: ['dwd'],
    iss: [
      'nn.nn...w...nn.nn',
      'nn.nn..www..nn.nn',
      'nn.nn...w...nn.nn',
      'dddddddddwddddddd',
      'nn.nn...w...nn.nn',
      'nn.nn..www..nn.nn',
      'nn.nn...w...nn.nn',
    ],
    voyMini: ['.w.', 'kkk'],
    // Lunar Gateway: power/propulsion element with two roll-out solar wings,
    // the habitation stack below it, and Orion docked at the bottom.
    gateway: [
      'nnnnnnn.....nnnnnnn',
      'nnnnnnnd.w.dnnnnnnn',
      'nnnnnnnddwddnnnnnnn',
      'nnnnnnnd.w.dnnnnnnn',
      'nnnnnnn..w..nnnnnnn',
      '........www........',
      '........www........',
      '.........d.........',
      '........www........',
      '.......wwwww.......',
      '........ccc........',
    ],
    voyager: [
      '.......kkkkk........',
      '.....kkwwwwwkk......',
      '....kwwwwwwwwwk.....',
      '...kwwwwwwwwwwwk....',
      '...kwwwwwkwwwwwk....',
      '..kwwwwwkdkwwwwwk...',
      '...kwwwwwkwwwwwk....',
      '...kwwwwwwwwwwwk....',
      '....kwwwwwwwwwk.....',
      '.....kkwwwwwkk......',
      '.......kkkkk........',
      '........kdk.........',
      '.......kdddkkkkkkkk.',
      '......kkkkk...kdkdk.',
      '.....k..............',
      '....k...............',
      '...k................',
      '..k.................',
    ],
    rover: [
      '...........kkk..',
      '...........kwk..',
      '............k...',
      '............k...',
      '..kk........k...',
      '.kddkwwwwwwwwwk.',
      '..kkkwwwwwwwwwkk',
      '....kkkkkkkkkkk.',
      '....k...k....k..',
      '...kkk.kkk..kkk.',
      '...kdk.kdk..kdk.',
      '...kkk.kkk..kkk.',
    ],
    robot: [
      '.....kkkkkk.....',
      '....kwwwwwwk....',
      '....kkkkkkkk....',
      '....kkbkkbkk....',
      '....kwwwwwwk....',
      '.....kkkkkk.....',
      '.......kk.......',
      '..kkkkkkkkkkkk..',
      '.kwwkwwwwwwkwwk.',
      '.kwwkwwccwwkwwk.',
      '.kwwkwwccwwkwwk.',
      '.kwwkwwwwwwkwwk.',
      '.kwwkkkkkkkkwwk.',
      '.kddk.kwwk.kddk.',
      '.kkk..kwwk..kkk.',
      '.....kwkkwk.....',
      '.....kwkkwk.....',
      '.....kwkkwk.....',
      '....kkwkkwkk....',
      '....kkkkkkkk....',
    ],
    rocket: [
      '.....kk.....',
      '....kwwk....',
      '...kwwwwk...',
      '...kwwwwk...',
      '..kwwkkwwk..',
      '..kwkbbkwk..',
      '..kwkbbkwk..',
      '..kwwkkwwk..',
      '..kwwwwwwk..',
      '..kcccccck..',
      '..kwwwwwwk..',
      '..kwwwwwwk..',
      '.kkwwwwwwkk.',
      'kckwwwwwwkck',
      'kckwwwwwwkck',
      'kcckkkkkkcck',
      'kkk.kddk.kkk',
      '....kyyk....',
      '....yooy....',
      '.....oo.....',
    ],
    pin: [
      '...kkkkk...',
      '..kccccck..',
      '.kccccccck.',
      'kccckkkccck',
      'kcckwwwkcck',
      'kcckwwwkcck',
      'kccckkkccck',
      '.kccccccck.',
      '..kccccck..',
      '...kccck...',
      '....kck....',
      '.....k.....',
    ],
  };

  const size = (name) => ({ w: SPRITES[name][0].length, h: SPRITES[name].length });

  // Draw a sprite with its top-left at (x, y), each sprite pixel p×p.
  const drawSprite = (ctx, name, x, y, p = 1, key = KEY) => {
    const rows = SPRITES[name];
    x = Math.round(x); y = Math.round(y);
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      for (let c = 0; c < row.length; c++) {
        const col = key[row[c]];
        if (!col) continue;
        ctx.fillStyle = col;
        ctx.fillRect(x + c * p, y + r * p, p, p);
      }
    }
  };

  /* Dithered sphere. `light` is a unit vector in view space (x right, y up,
     z toward the viewer). `rampAt(nx, ny, nz)` returns the dark→light ramp
     for that surface point, so callers can paint continents, ice caps, etc. */
  const sphere = (ctx, sx, sy, r, light, rampAt) => {
    const ri = Math.ceil(r) + 1;
    const cx = Math.round(sx), cy = Math.round(sy);
    const r2 = r * r;
    for (let dy = -ri; dy <= ri; dy++) {
      for (let dx = -ri; dx <= ri; dx++) {
        const fx = dx, fy = dy;
        const d2 = fx * fx + fy * fy;
        if (d2 > r2) continue;
        const nx = fx / r, ny = -fy / r, nz = Math.sqrt(Math.max(0, 1 - d2 / r2));
        const lum = nx * light[0] + ny * light[1] + nz * light[2];
        const v = 0.5 + lum * 0.72;
        const px = cx + dx, py = cy + dy;
        ctx.fillStyle = dither(rampAt(nx, ny, nz), v, px, py);
        ctx.fillRect(px, py, 1, 1);
      }
    }
  };

  window.Pixels = { PALETTE, SPRITES, KEY, DARK_KEY, threshold, dither, drawSprite, sphere, size };

})();
