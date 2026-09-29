// Hero relief + character volume maps.
//
// Two data sets are produced here, both consumed by the 2.5D parallax shader in
// src/Hero3D.jsx (the technique is the depth + normal + noise displacement from
// the supplied Halloween pen):
//
//   hero-field{,-mobile}.jpg          coral chamber, colour only
//   hero-field-depth{,-mobile}.jpg    R = surface height, G = large-scale depth
//   hero-field-normal{,-mobile}.jpg   tangent-space normal of the relief
//   character-depth.jpg               R = body volume, G = interior mask
//   character-normal.jpg              tangent-space normal of the body volume
//
// The character maps are an analytic approximation: a chamfer distance
// transform of the cutout alpha, shaped into a rounded cross-section. It is not
// learned monocular depth, it just needs to read as a body under a moving light.
import sharp from "sharp";

const SRC = "public/character.png";
const OUT = "public/textures/";

let seed = 20260909;
const random = () => {
  seed = (1664525 * seed + 1013904223) >>> 0;
  return seed / 4294967296;
};
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
const mix = (a, b, t) => a + (b - a) * t;
const byte = (v) => Math.max(0, Math.min(255, Math.round(v * 255)));

/* Value noise ---------------------------------------------------------- */
const GRID = 256;
const lattice = new Float32Array(GRID * GRID);
for (let i = 0; i < lattice.length; i++) lattice[i] = random();
const latticeAt = (x, y) =>
  lattice[(((y % GRID) + GRID) % GRID) * GRID + (((x % GRID) + GRID) % GRID)];
function valueNoise(x, y) {
  const xi = Math.floor(x),
    yi = Math.floor(y);
  const xf = x - xi,
    yf = y - yi;
  const u = xf * xf * (3 - 2 * xf),
    v = yf * yf * (3 - 2 * yf);
  return mix(
    mix(latticeAt(xi, yi), latticeAt(xi + 1, yi), u),
    mix(latticeAt(xi, yi + 1), latticeAt(xi + 1, yi + 1), u),
    v,
  );
}
function fbm(x, y, octaves = 4) {
  let sum = 0,
    amp = 0.5,
    norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += valueNoise(x, y) * amp;
    norm += amp;
    x *= 2.03;
    y *= 2.03;
    amp *= 0.5;
  }
  return sum / norm;
}

/* Normal map from a height field --------------------------------------- */
function normalsFrom(height, w, h, strength) {
  const out = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const l = height[y * w + Math.max(0, x - 1)],
        r = height[y * w + Math.min(w - 1, x + 1)],
        t = height[Math.max(0, y - 1) * w + x],
        b = height[Math.min(h - 1, y + 1) * w + x];
      const dx = (r - l) * strength,
        dy = (b - t) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 3;
      out[i] = byte((-dx / len) * 0.5 + 0.5);
      out[i + 1] = byte((-dy / len) * 0.5 + 0.5);
      out[i + 2] = byte((1 / len) * 0.5 + 0.5);
    }
  return out;
}

/* Separable box blur --------------------------------------------------- */
function blur(src, w, h, radius, passes = 2) {
  let a = Float32Array.from(src),
    b = new Float32Array(w * h);
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++) {
      let sum = 0;
      for (let x = -radius; x <= radius; x++) sum += a[y * w + clamp(x, 0, w - 1)];
      for (let x = 0; x < w; x++) {
        b[y * w + x] = sum / (radius * 2 + 1);
        sum -= a[y * w + clamp(x - radius, 0, w - 1)];
        sum += a[y * w + clamp(x + radius + 1, 0, w - 1)];
      }
    }
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let y = -radius; y <= radius; y++) sum += b[clamp(y, 0, h - 1) * w + x];
      for (let y = 0; y < h; y++) {
        a[y * w + x] = sum / (radius * 2 + 1);
        sum -= b[clamp(y - radius, 0, h - 1) * w + x];
        sum += b[clamp(y + radius + 1, 0, h - 1) * w + x];
      }
    }
  }
  return a;
}

/* ---------------------------------------------------------------------- */
/* 1. Coral chamber: colour, relief height, normal                         */
/* ---------------------------------------------------------------------- */
// Brand coral in linear-ish sRGB bytes, plus the two shades the relief moves
// between. Everything here stays inside the palette already in style.css.
const CORAL = [0xe0 / 255, 0x5a / 255, 0x4e / 255];
const CORAL_LIT = [0xf0 / 255, 0x74 / 255, 0x60 / 255];
const CORAL_DEEP = [0x8e / 255, 0x30 / 255, 0x2c / 255];

function heroField(w, h) {
  const colour = Buffer.alloc(w * h * 3);
  const relief = new Float32Array(w * h);
  const depth = new Float32Array(w * h);
  const aspect = w / h;
  // The figure stands here; the chamber is lit from behind their shoulders.
  const cx = 0.5,
    cy = 0.46;

  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const u = x / (w - 1),
        v = y / (h - 1);
      const px = (u - cx) * aspect,
        py = v - cy;
      const r = Math.hypot(px, py);
      const theta = Math.atan2(py, px);

      // Parang: the diagonal S-ribs of Javanese batik, at a low relief.
      const diag = (u * aspect * 0.86 + v * 0.51) * 26.0;
      const wave = Math.sin(diag + Math.sin(v * 7.0) * 0.55);
      const parang = Math.pow(Math.abs(wave), 0.7) * Math.sign(wave);

      // Concentric portal rings, fading out past the centre.
      const rings =
        Math.sin(r * 29.0 - 1.2) * Math.exp(-Math.pow(r * 1.45, 2.0)) * 0.75 +
        Math.sin(r * 8.5) * Math.exp(-Math.pow(r * 0.85, 2.0)) * 0.55;

      // Eight-point brand star, only where the aura is.
      const spokes =
        Math.pow(Math.abs(Math.cos(theta * 4.0)), 26.0) *
        smoothstep(0.62, 0.1, r) *
        smoothstep(0.02, 0.09, r);

      const grain = fbm(u * 150.0, v * 150.0, 3) - 0.5;
      const cloud = fbm(u * 3.1 + 11.0, v * 3.1 + 4.0, 5) - 0.5;

      const height =
        parang * 0.5 + rings * 0.34 + spokes * 0.42 + cloud * 0.45 + grain * 0.035;
      relief[y * w + x] = height;

      // Large-scale depth: a shallow dome so the chamber has a middle and
      // corners that fall away from the camera.
      depth[y * w + x] =
        0.5 +
        smoothstep(1.05, 0.0, r) * 0.26 -
        smoothstep(0.35, 1.15, r) * 0.2 +
        height * 0.05;

      // Colour: aura in the middle, deep coral in the corners, a whisper of
      // the relief so the pattern is felt before the light finds it.
      const aura = smoothstep(0.95, 0.05, r);
      const floorFall = smoothstep(0.55, 1.0, v);
      const vignette = smoothstep(0.34, 1.05, r);
      const i = (y * w + x) * 3;
      for (let c = 0; c < 3; c++) {
        let value = mix(CORAL[c], CORAL_LIT[c], aura * 0.75);
        value = mix(value, CORAL_DEEP[c], Math.max(vignette * 0.68, floorFall * 0.5));
        value *= 1.0 + height * 0.035 + grain * 0.05;
        colour[i + c] = byte(value);
      }
    }

  const smoothRelief = blur(relief, w, h, Math.max(2, Math.round(w / 420)), 2);
  const normal = normalsFrom(smoothRelief, w, h, w * 0.045);

  const depthMap = Buffer.alloc(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    depthMap[i * 3] = byte(depth[i]);
    depthMap[i * 3 + 1] = byte(clamp(smoothRelief[i] * 0.5 + 0.5));
    depthMap[i * 3 + 2] = byte(clamp(1.0 - depth[i]));
  }
  return { colour, depthMap, normal };
}

for (const [w, h, suffix] of [
  [2048, 1152, ""],
  [1024, 576, "-mobile"],
]) {
  const { colour, depthMap, normal } = heroField(w, h);
  const raw = { raw: { width: w, height: h, channels: 3 } };
  await sharp(colour, raw)
    .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
    .toFile(OUT + "hero-field" + suffix + ".jpg");
  await sharp(depthMap, raw)
    .jpeg({ quality: 94 })
    .toFile(OUT + "hero-field-depth" + suffix + ".jpg");
  await sharp(normal, raw)
    .jpeg({ quality: 88 })
    .toFile(OUT + "hero-field-normal" + suffix + ".jpg");
  console.log("hero-field" + suffix, w + "x" + h);
}

/* ---------------------------------------------------------------------- */
/* 2. Character volume from the cutout alpha                               */
/* ---------------------------------------------------------------------- */
const meta = await sharp(SRC).metadata();
const CW = 1024;
const CH = Math.round((CW * meta.height) / meta.width);
const alpha = await sharp(SRC)
  .resize(CW, CH)
  .extractChannel("alpha")
  .raw()
  .toBuffer();

// Chamfer distance transform: distance from every inside pixel to the cutout
// edge. Two sequential passes over a 3x4 neighbourhood, which is close enough
// to euclidean for a shading map.
const INF = 1e9;
const dist = new Float32Array(CW * CH);
for (let i = 0; i < CW * CH; i++) dist[i] = alpha[i] > 127 ? INF : 0;
const D1 = 1.0,
  D2 = Math.SQRT2;
const relax = (i, j, cost) => {
  const v = dist[j] + cost;
  if (v < dist[i]) dist[i] = v;
};
for (let y = 0; y < CH; y++)
  for (let x = 0; x < CW; x++) {
    const i = y * CW + x;
    if (dist[i] === 0) continue;
    if (x > 0) relax(i, i - 1, D1);
    if (y > 0) relax(i, i - CW, D1);
    if (x > 0 && y > 0) relax(i, i - CW - 1, D2);
    if (x < CW - 1 && y > 0) relax(i, i - CW + 1, D2);
  }
for (let y = CH - 1; y >= 0; y--)
  for (let x = CW - 1; x >= 0; x--) {
    const i = y * CW + x;
    if (dist[i] === 0) continue;
    if (x < CW - 1) relax(i, i + 1, D1);
    if (y < CH - 1) relax(i, i + CW, D1);
    if (x < CW - 1 && y < CH - 1) relax(i, i + CW + 1, D2);
    if (x > 0 && y < CH - 1) relax(i, i + CW - 1, D2);
  }

// A rounded cross-section: sqrt of the normalised distance reads as a limb or a
// torso rather than a flat card. Saturates at ~7% of the width so the body is
// full depth while an arm or the broom stays shallow.
const RADIUS = CW * 0.16;
const volume = new Float32Array(CW * CH);
const interior = new Float32Array(CW * CH);
for (let i = 0; i < CW * CH; i++) {
  const d = clamp(dist[i] / RADIUS);
  volume[i] = Math.pow(d, 0.55);
  // Displacement has to die at the silhouette or the cutout nibbles its own
  // edge; 18px of falloff is enough at this resolution.
  interior[i] = smoothstep(0, 18, dist[i]);
}
const smoothVolume = blur(volume, CW, CH, 9, 2);
const smoothInterior = blur(interior, CW, CH, 4, 1);

const charDepth = Buffer.alloc(CW * CH * 3);
for (let i = 0; i < CW * CH; i++) {
  charDepth[i * 3] = byte(smoothVolume[i]);
  charDepth[i * 3 + 1] = byte(smoothInterior[i]);
  charDepth[i * 3 + 2] = byte(alpha[i] / 255);
}
const charNormal = normalsFrom(smoothVolume, CW, CH, CW * 0.1);
const charRaw = { raw: { width: CW, height: CH, channels: 3 } };
await sharp(charDepth, charRaw)
  .jpeg({ quality: 94 })
  .toFile(OUT + "character-depth.jpg");
await sharp(charNormal, charRaw)
  .jpeg({ quality: 94 })
  .toFile(OUT + "character-normal.jpg");
console.log("character maps", CW + "x" + CH);
