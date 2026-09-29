import * as THREE from "three";

export const scrollState = {
  progress: 0,
  selectedId: "boneka",
  propBounds: {},
  phase: "HERO",
  focusedId: null,
  hoveredId: null,
  outro: 0,
  entrance: 0,
  reduced: false,

  // Hero stage. The frame loop writes these; every hero component reads them,
  // so the bubble, the props orbiting it and the parallax layers all agree on
  // one anchor instead of each guessing at a position.
  pointer: new THREE.Vector2(),
  pointerVelocity: 0,
  bubbleCenter: new THREE.Vector3(),
  bubbleRadius: 0.8,
  // The hero-phase radius, held flat while the bubble expands to swallow the
  // camera, so the orbiting props do not inflate with it.
  bubbleBase: 0.8,
  bubbleHover: 0,
  rippleAt: -10,
  rippleDir: new THREE.Vector3(0, 0, 1),

  // Open palm in world units (character plane). The character writes it each
  // frame; the camera dollies here on scroll and the doll is showcased above it.
  palmX: 0,
  palmY: 0,
};

if (import.meta.env.DEV) window.__dukunDebug = { state: scrollState };
