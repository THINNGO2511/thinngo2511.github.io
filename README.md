# Edward Ngo — personal site

Live at **https://thinngo2511.github.io/**

A one-page portfolio in plain HTML, CSS and JavaScript: no framework, no build step, nothing to install. Every scene is drawn in code as low-res pixel art and scaled up crisply.

## A quick tour

The page has four sections. Each one pairs some text with a small interactive scene. Click a screenshot to jump to that section on the live site.

### Home

[![Home: the intro next to a pixel-art solar system](docs/screenshots/home.png)](https://thinngo2511.github.io/#home)

The intro sits next to a solar system that shows where the planets actually are today. Click the ISS, Lunar Gateway, Perseverance or Voyager 1 to zoom in and read about it. The **Radio** button plays synthesized static and beeps (sound is off until you press it).

### About

[![About: a pixel robot learning to fold laundry in a simulator](docs/screenshots/about.png)](https://thinngo2511.github.io/#about)

A pixel humanoid robot learns to fold laundry in a tiny RL environment, with a HUD that tracks the episode, return and success rate. Drag to look around, click to shove the robot.

### Career

[![Career: Meta, NASA and University of Houston next to a Starship on the launch tower](docs/screenshots/career.png)](https://thinngo2511.github.io/#career)

Meta, three NASA Johnson Space Center internships, the University of Houston, a few side quests and a link to the full resume. Next to them is a Starship on the pad: hit **Launch** to watch the booster get caught by the tower and the ship land. Drag to look around, **+ / −** to zoom.

### Contact

[![Contact: email and links next to a dotted globe with arcs from Houston](docs/screenshots/contact.png)](https://thinngo2511.github.io/#contact)

Email, LinkedIn, GitHub and resume, next to a dotted globe with arcs from Houston to places I've been. Drag to turn, **+ / −** to zoom.

## How it's built

| Section | Scene | Script |
|---|---|---|
| Home | Solar system with today's real planet positions; click the ISS, Lunar Gateway, Perseverance or Voyager 1 to zoom in | `orrery.js` |
| About | A 3D robot learning to fold laundry in a little RL environment (drag to orbit, click to shove) | `sim.js` |
| Career | Starship launch with a booster catch and ship landing (drag to orbit, +/− to zoom) | `rocket.js` |
| Contact | Dotted globe of places I've been, arcs from Houston (drag to turn, +/− to zoom) | `globe.js` |

Shared pieces:

```
index.html            all content and copy
assets/css/site.css   colors, fonts and layout
assets/js/pixels.js   palette, sprites and the dithered-sphere renderer (solar system)
assets/js/tiny3d.js   tiny software 3D renderer used by the robot room and Starship
assets/js/radio.js    the "Radio" button: synthesized static and beeps (Web Audio, off by default)
assets/fonts/         Coolvetica and La Belle Aurore, from the original site
assets/img/           pegasus favicon
404.html              sends old links (/about, /contact) to the matching section
docs/screenshots/     the screenshots in this README (1440×900 at 2×)
```

The globe's coastlines come from Natural Earth's public-domain 1:110m land data, baked into a 2 KB bitmask inside `globe.js`.

## Run locally

```bash
python3 -m http.server 4173
```

Then open http://localhost:4173.

## Editing

- **Words:** everything is in `index.html`; each section is commented.
- **Solar system info cards:** `INFO` near the top of `orrery.js`.
- **Places on the globe:** `PLACES` in `globe.js` (the `primary` one gets the yellow arc).
- **Starship timing:** the `TL` mission clock in `rocket.js`.

## Deploy

This repo is named `thinngo2511.github.io`, so GitHub Pages serves it at the root of that address, from the `main` branch. Push to `main` and the site updates. Old links to the previous address (`/Personal_Portfolio/…`) are redirected by `404.html`.

<details>
<summary>Previous version</summary>

The original React (Create React App) version lives in git history, before the `revamp` branch.
</details>
