# Dukun — Gen Z Witch

A fictional Indonesian ritual studio built with Vite, React, React Three Fiber, Three.js, Drei, GSAP ScrollTrigger, and Lenis.

## Run

```sh
npm install
npm run dev
```

Open http://localhost:5173. `npm run build` produces the static site in `dist/`; `npm run preview` previews it. All booking and newsletter actions are local demonstrations. No data is stored or transmitted.

The hero uses a cinematic candlelit room with coral backlighting, dark foreground falloff, and a matching dark booking widget. It reuses the generated room artwork; the scroll-driven bubble transition remains intact.

## Editing

- `public/props/props.json` drives the four supplied objects, descriptions, prices, anchors, and camera focus offsets.
- `src/scrollState.js` is the scroll/interaction singleton. GSAP writes scroll progress; the R3F frame loop owns the camera, the bubble anchor, and model movement.
- `src/Hero3D.jsx` is the hero stage: the cinematic chamber, the figure as a 2.5D plate, and the bubble.
- `src/Scene.jsx` wires the canvas together — the interior environments, model loading, bounded prop movement, pointer raycasting, and frame-rate-independent damping.
- `src/main.jsx` contains the hero DOM, navigation, services, accessible gallery controls, and focus-trapped panels.
- `src/style.css` contains the six brand tokens and desktop/mobile layouts.
- `src/journey.js` is the shared source for scroll duration, story beats, and contained object anchors.
- `scripts/hero-maps.mjs` rebuilds the hero relief and the character volume maps.

## The scroll story

`src/journey.js` defines a reversible 360vh sequence with 1.8-second scrub smoothing:

1. The title begins at 32% opacity and rises 34px into place over the opening scroll.
2. The composition holds before the character and opening copy gently leave.
3. “Tidak semua bisa dijelaskan” introduces the threshold as the bubble expands.
4. The film passes the camera; only then do the objects spread into the gallery.
5. A spacious “Ilmu lama. Dunia baru.” interlude connects the collection to services.

The gallery, interlude, and service rows use slow, scroll-linked reveals. Reduced motion removes pinning and makes content immediately visible.

- **The chamber** uses the existing candlelit room artwork, depth-dependent displacement, a damped pointer light, and two slowly drifting fog layers. The supplied Yakudoo Halloween shader informed these techniques. No full-screen lightning or flashing is used. The reference and MIT notice are retained in `references/halloween/`; the deployed notice is in `public/licenses/`.
- **The figure** is a 2.5D alpha plate with analytic volume/normal maps, restrained light response, and soft alpha edges. The camera framing and bubble position derive from the same measured hand anchor.
- **The bubble** uses thin-film interference, softened studio reflections, and restrained Fresnel edges. Its environment is captured once, avoiding repeated six-pass scene captures and reflected duplicates of the objects. Hover and click responses are damped; there is no elastic scaling or outward impulse.
- **The four objects remain inside the film**. Each has a small local float offset, a conservative model bounding sphere, and a clamped distance from the shared bubble center. Props read that center after the bubble updates, avoiding independent smoothing lag on reverse scroll or resize. They spread toward gallery anchors only after the camera enters the film.

The hero sits above the canvas in the stacking order — ScrollTrigger's pin makes
it its own context — so its type crosses the render. That means the hero, and
the pin spacer GSAP wraps it in, both give pointer events back to the canvas.

Original supplied assets remain untouched in `Dukun.png` and `Probs/`. The deployed models use DRACO geometry and KTX2 textures, with local decoders in `public/draco` and `public/basis`. KTX2 preload waits for the renderer because GPU format support must be detected first. Failed models use `placeholder.glb`.

## Artwork

The character and four models were supplied with the project. The room was generated using the built-in image generation tool and copied to `public/textures/scene-source.png`; optimized web versions are `scene.jpg` and `scene-mobile.jpg`. The hero chamber (`hero-field*.jpg`) and the character volume maps (`character-depth.jpg`, `character-normal.jpg`) are generated procedurally by `scripts/hero-maps.mjs`.

Generation prompt: “A very dark Indonesian heritage room with warm black #140A08 dominant, a worn wooden floor, batik cloth barely visible in the shadows on the far walls, faint low candlelight at the extreme edges and beautiful thin incense smoke in muted coral #E05A4E. Room is empty of foreground objects, no people, no text, no symbols, no ritual instructions. Main central 80 percent must remain very dark and quiet for floating product models to overlay. Cinematic photorealism, restrained light, deep atmospheric spatial perspective.”

## Implementation notes

- Four supplied objects are used rather than inventing additional models.
- The room depth and normal maps are analytic approximations of its floor and walls, not Depth Anything inference. `scripts/room-maps.mjs` rebuilds them. The character maps are the same kind of approximation. Lightning is omitted.
- Both hero plates skip tone mapping. They are pre-authored artwork, and ACES desaturates the batik and greys the skin.
- The hero light is read against how a flat facing surface would respond, so moving the cursor sculpts the relief instead of dimming and brightening the whole plate.
- Desktop gallery dragging uses tightly constrained OrbitControls on a virtual camera; the render camera still has one owner in the frame loop. OrbitControls is never created on touch devices.
- Desktop and mobile use the same low-vertex fullscreen shader; there is no separate 0.6-resolution mobile FBO. DPR adapts downward through PerformanceMonitor.
- Reduced motion removes the pinned zoom and entrance timeline and freezes ambient motion. Gallery content remains usable.
- The DOM gallery buttons are intentionally visible as an additional discovery and keyboard path. Dialogs lock scrolling, trap focus, close with Escape, and restore focus.
- WebGL failure/context loss swaps in the static bubble and a content-complete gallery grid.
- Google Fonts serves Archivo at width 125 / weight 800, Inter, and Bitter. System fallbacks apply offline.

## Validation

With the dev server running, `npm test` runs the smoke suite using installed Chrome (`PLAYWRIGHT_CHANNEL` overrides the browser channel). Production build and automated Chromium checks cover desktop and mobile rendering, booking simulation, prop panels, Escape dismissal, mobile horizontal overflow, focus trapping/restoration, scroll locking, context loss, no-WebGL content, and the absence of pinning under reduced motion. Screenshots are stored in the ignored `artifacts/` folder. Frame-rate targets still need profiling on physical mobile hardware.

`node scripts/journey-check.mjs` checks progressive text reveal, object containment, fast reverse scrolling, responsive resize, and browser errors against the running dev server. It saves story-beat screenshots in `artifacts/`.

### Editorial story and living film
The hero uses slow scroll-scrubbed type reveals, a breathing thin-film shell and restrained moving spectral haze. Each prop tumbles independently inside a conservative sphere bound; containment is preserved through fast reverse scrolling. The interactive collection leads into two asymmetric editorial chapters: the keris on warm black, then tarot on chalk. Their staggered timelines follow scroll and respect reduced motion. Both featured objects open the existing accessible detail panel.

`public/editorial` contains transparent portraits rendered from the supplied models. Regenerate them with the dev server running using `node scripts/render-portraits.mjs`. `node scripts/journey-check.mjs` verifies reveal timing, containment and reverse scrolling; `node scripts/chapter-check.mjs` verifies editorial panels and mobile width.
