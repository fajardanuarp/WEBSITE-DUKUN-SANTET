// One reversible sequence, shared by the DOM and WebGL renderers.
//
// The whole page is now a single act: the hero holds, then scrolling dollies
// the camera into the open hand until the effigy doll fills the frame. There is
// nothing after it, so every phase below lives inside the pinned hero.
export const JOURNEY = Object.freeze({
  scrollVh: 220, // how much scroll the pinned zoom is stretched over
  scrub: 1.4,
  revealEnd: 0.16, // title settles
  zoomStart: 0.16, // camera starts moving toward the hand
  zoomEnd: 1.0, // fully framed on the doll
  bubbleFade: [0.18, 0.44], // the film clears as we move in
  propsFade: [0.2, 0.4], // the loose props leave; the doll stays
  dollStart: 0.24, // doll eases from orbit to its showcase pose
  dollEnd: 0.78,
  panelStart: 0.5, // left cards + right text fade in
  panelEnd: 0.82,
});

export function range(value, start, end) {
  const t = Math.max(0, Math.min(1, (value - start) / (end - start)));
  return t * t * (3 - 2 * t);
}

// Resting orbit anchors for the four props around the film, in bubble-radius
// units. Only the doll survives the zoom; the rest are here for the hero hold.
export const CONTAINED_ANCHORS = [
  [-0.29, 0.28, -0.06],
  [0.29, 0.25, -0.1],
  [-0.25, -0.29, 0.08],
  [0.28, -0.27, 0.03],
];
