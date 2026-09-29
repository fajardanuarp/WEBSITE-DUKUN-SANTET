// Analytic room-depth approximation. These are data maps, not learned depth inference.
import sharp from "sharp";
let seed = 9328;
const random = () => {
  seed = (1664525 * seed + 1013904223) >>> 0;
  return seed / 4294967296;
};
for (const size of [1024, 2048]) {
  const h = Math.round((size * 2) / 3),
    depth = new Float32Array(size * h),
    rgb = Buffer.alloc(size * h * 3),
    normal = Buffer.alloc(size * h * 3);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < size; x++) {
      const u = x / (size - 1),
        v = y / (h - 1);
      const d = Math.max(
        Math.max(0, (v - 0.6) / 0.4) * 0.85,
        Math.pow(Math.abs(u - 0.5) * 2, 4) * 0.65,
      );
      depth[y * size + x] = d;
      for (let c = 0; c < 3; c++)
        rgb[(y * size + x) * 3 + c] = Math.round(d * 255);
    }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < size; x++) {
      const dx =
          depth[y * size + Math.min(size - 1, x + 1)] -
          depth[y * size + Math.max(0, x - 1)],
        dy =
          depth[Math.min(h - 1, y + 1) * size + x] -
          depth[Math.max(0, y - 1) * size + x];
      const l = Math.hypot(dx * 100, dy * 100, 1);
      normal[(y * size + x) * 3] = Math.round(
        (((-dx * 100) / l) * 0.5 + 0.5) * 255,
      );
      normal[(y * size + x) * 3 + 1] = Math.round(
        (((-dy * 100) / l) * 0.5 + 0.5) * 255,
      );
      normal[(y * size + x) * 3 + 2] = Math.round(((1 / l) * 0.5 + 0.5) * 255);
    }
  const suffix = size === 1024 ? "-mobile" : "";
  await sharp(rgb, { raw: { width: size, height: h, channels: 3 } })
    .jpeg({ quality: 95 })
    .toFile("public/textures/scene-depth" + suffix + ".jpg");
  await sharp(normal, { raw: { width: size, height: h, channels: 3 } })
    .jpeg({ quality: 95 })
    .toFile("public/textures/scene-normal" + suffix + ".jpg");
}
const noise = Buffer.alloc(128 * 128 * 3);
for (let i = 0; i < noise.length; i += 3) {
  const v = random() * 255;
  noise[i] = noise[i + 1] = noise[i + 2] = v;
}
await sharp(noise, { raw: { width: 128, height: 128, channels: 3 } })
  .jpeg({ quality: 95 })
  .toFile("public/textures/noise.jpg");
