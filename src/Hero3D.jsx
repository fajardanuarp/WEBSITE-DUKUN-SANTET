import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";
import { JOURNEY, range } from "./journey";
import { scrollState as s } from "./scrollState";

const lerp = THREE.MathUtils.lerp;
const smoothstep = THREE.MathUtils.smoothstep;

/* ---------------------------------------------------------------------- */
/* Stage geometry                                                          */
/* ---------------------------------------------------------------------- */
// Measured off public/character.png: the file has a lot of empty margin, so
// centring the *file* leaves the figure off-centre. These are the fractions of
// the file the figure actually occupies, and the point on the open right hand
// the bubble is conjured above.
const CHAR_ASPECT = 2278 / 4082;
const BODY = { x0: 0.1172, y0: 0.0816, x1: 0.7946, y1: 0.9618 };
const BODY_H = BODY.y1 - BODY.y0;
const BODY_MID_X = (BODY.x0 + BODY.x1) / 2;
const PALM = { u: 0.7195, v: 0.4358 };

export const FIELD_Z = -14;
export const CHAR_Z = 0;
export const BUBBLE_Z = 1.05;

// Framing: how much empty room sits above the head, and how far down the body
// the bottom of the screen cuts. Cropping at the knee keeps the figure large
// without the composition turning into a full-length product shot.
const FRAME = {
  desktop: {
    headroom: 0.08,
    crop: 0.7,
    bubble: 0.139,
    lift: 1.0,
    sideways: -0.06,
  },
  mobile: {
    headroom: 0.33,
    crop: 0.76,
    bubble: 0.105,
    lift: 1.07,
    sideways: -0.18,
  },
};

/**
 * Everything downstream — character plane, palm, bubble anchor, orbit radii —
 * derives from this one function, so the pieces cannot drift apart.
 */
export function heroLayout(viewportWidth, viewportHeight, cameraZ, mobile) {
  const f = mobile ? FRAME.mobile : FRAME.desktop;
  const planeH = (viewportHeight * (1 - f.headroom)) / (BODY_H * f.crop);
  const planeW = planeH * CHAR_ASPECT;
  // Centred on the figure's own bounding box. No nudge on top of it: the title
  // now flanks the figure instead of sitting to one side of it, so anything
  // added here reads as a lean.
  const centerX = (0.5 - BODY_MID_X) * planeW;
  const centerY =
    viewportHeight * (0.5 - f.headroom) - planeH * (0.5 - BODY.y0);

  const palmX = centerX + (PALM.u - 0.5) * planeW;
  const palmY = centerY + (0.5 - PALM.v) * planeH;

  // The bubble floats on a nearer plane than the cutout, so the palm has to be
  // re-projected onto it before the hover offset is added — otherwise the
  // bubble drifts off the hand as the viewport changes.
  const toBubble = (cameraZ - BUBBLE_Z) / (cameraZ - CHAR_Z);
  const radius = viewportHeight * f.bubble;

  return {
    planeW,
    planeH,
    centerX,
    centerY,
    radius,
    // Palm in world units on the character plane (z = CHAR_Z). The camera
    // dollies here on scroll and the doll is showcased just above it.
    palmX,
    palmY,
    bubbleX: Math.min(
      palmX * toBubble + radius * f.sideways,
      viewportWidth * toBubble * 0.5 - radius * 1.08,
    ),
    bubbleY: palmY * toBubble + radius * f.lift,
    viewportWidth,
    viewportHeight,
  };
}

export function useHeroLayout() {
  const { camera, size } = useThree();
  return useMemo(() => {
    // Measured against the camera's resting position, not its live one: the
    // scroll journey walks the camera into the bubble and the framing must not
    // move with it.
    const rest = 6;
    const vh = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * rest;
    return heroLayout(
      vh * (size.width / size.height),
      vh,
      rest,
      size.width < 700,
    );
  }, [camera.fov, size.width, size.height]);
}

/* ---------------------------------------------------------------------- */
/* Shared GLSL                                                             */
/* ---------------------------------------------------------------------- */
const NOISE3 = `
float hash3(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float noise3(vec3 p){
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash3(i), hash3(i + vec3(1,0,0)), f.x), mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
    mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x), mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y),
    f.z);
}`;

/* ---------------------------------------------------------------------- */
/* 1. The coral chamber                                                    */
/* ---------------------------------------------------------------------- */
// The 2.5D technique from the supplied pen: the depth map displaces the sample
// point against the cursor so the relief has parallax, the normal map turns the
// cursor into a moving light, and looped noise carries incense and embers
// across the plate.
const FIELD_FRAGMENT = `
varying vec2 vUv;
uniform sampler2D uField, uDepth, uNormal, uNoise;
uniform vec2 uPointer;
uniform float uTime, uOpacity, uLight, uAmp, uPlaneAspect, uImageAspect;
uniform vec3 uEmber, uFogWarm, uFogCool;

vec2 cover(vec2 uv){
  vec2 scale = uPlaneAspect > uImageAspect
    ? vec2(1.0, uImageAspect / uPlaneAspect)
    : vec2(uPlaneAspect / uImageAspect, 1.0);
  return (uv - 0.5) * scale + 0.5;
}

void main(){
  vec2 base = cover(vUv);
  float depth = texture2D(uDepth, base).r - 0.55;

  float drift1 = texture2D(uNoise, base * 0.85 + uTime * 0.012).r - 0.5;
  float drift2 = texture2D(uNoise, base * 0.2 - uTime * 0.02).r - 0.5;
  float toCentre = pow(distance(vUv, vec2(0.5)), 3.0);
  float toPointer = 1.0 - smoothstep(0.0, 0.36, distance(uPointer * 0.5 + 0.5, vUv));

  vec2 uv = base
    + uPointer * depth * uAmp
    + vec2(drift1 * toCentre * 0.1, drift1 * toCentre * 0.06)
    + vec2(drift2 * 0.02 * toPointer);

  vec3 colour = texture2D(uField, uv).rgb;
  vec3 normal = vec3(1.0, -1.0, 1.0) * (texture2D(uNormal, uv).rgb * 2.0 - 1.0);

  // The cursor is the only light in the room; it finds the batik relief. Read
  // against a flat surface so moving the cursor sculpts rather than dims.
  vec3 light = normalize(vec3(uPointer * 1.15, 0.4));
  float shade = dot(normalize(normal), light) - light.z;
  colour *= .62 + shade * .22 * uLight;
  colour += vec3(.26,.16,.12) * max(shade,0.0) * toPointer * .12 * uLight;

  // Layered displaced fog from the supplied Yakudoo technique; using brand
  // uniforms instead of multiplying isolated red/blue channels.
  float smoke = texture2D(uNoise, uv*.065 + vec2(uTime*.0015,-uTime*.0025)).r;
  float smoke2 = texture2D(uNoise, uv*.032 - vec2(uTime*.001,uTime*.0018)).r;
  float floorFog=pow(1.-vUv.y,3.)*(.35+smoke*.65);
  float ceilingFog=pow(vUv.y,4.)*smoke2;
  colour+=uFogWarm*floorFog*.13+uFogCool*ceilingFog*.055;
  float veil=smoothstep(.30,.72,smoke*smoke2)*.065;
  colour+=mix(uFogCool,uFogWarm,vUv.x)*veil;
  float pools=exp(-dot((vUv-vec2(.63,.44))*vec2(2.,1.5),(vUv-vec2(.63,.44))*vec2(2.,1.5))*3.);
  colour+=uFogWarm*pools*.055;
  colour*=1.-smoothstep(.2,.85,distance(vUv,vec2(.56,.47)))*.65;

  gl_FragColor = vec4(colour, uOpacity);
  #include <colorspace_fragment>
  gl_FragColor.rgb *= uOpacity;
}`;

export function HeroField({ mobile }) {
  const mesh = useRef();
  const { camera, size } = useThree();
  const suffix = mobile ? "-mobile" : "";
  const [field, depth, normal, noise] = useTexture([
    "/textures/scene" + suffix + ".jpg",
    "/textures/scene-depth" + suffix + ".jpg",
    "/textures/scene-normal" + suffix + ".jpg",
    "/textures/noise.jpg",
  ]);
  useMemo(() => {
    field.colorSpace = THREE.SRGBColorSpace;
    [depth, normal, noise].forEach((t) => (t.colorSpace = THREE.NoColorSpace));
    [field, depth, normal, noise].forEach((t) => {
      t.minFilter = THREE.LinearFilter;
      t.magFilter = THREE.LinearFilter;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
    });
  }, [field, depth, normal, noise]);

  const uniforms = useMemo(
    () => ({
      uField: { value: field },
      uDepth: { value: depth },
      uNormal: { value: normal },
      uNoise: { value: noise },
      uPointer: { value: new THREE.Vector2() },
      uTime: { value: 0 },
      uOpacity: { value: 1 },
      uLight: { value: 1 },
      uAmp: { value: mobile ? 0.012 : 0.026 },
      uPlaneAspect: { value: 1.78 },
      uImageAspect: { value: 1.5 },
      uEmber: { value: new THREE.Color("#C68E79") },
      uFogWarm: { value: new THREE.Color("#A5473D") },
      uFogCool: { value: new THREE.Color("#38444B") },
    }),
    [],
  );

  useFrame(({ clock }) => {
    const uniforms = mesh.current.material.uniforms;
    const distance = camera.position.z - FIELD_Z;
    const height =
      2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * distance * 1.12;
    const width = height * (size.width / size.height);
    mesh.current.scale.set(width, height, 1);
    uniforms.uPlaneAspect.value = width / height;
    uniforms.uTime.value = s.reduced ? 12 : clock.elapsedTime;
    mesh.current.material.uniforms.uPointer.value.copy(s.pointer);
    // Hands the stage over to the dark interior as the bubble swallows the camera.
    const out = range(s.progress, 0.52, 0.79);
    uniforms.uOpacity.value = (1 - out) * (1 - s.outro);
    uniforms.uLight.value = 1 - out;
    mesh.current.visible = uniforms.uOpacity.value > 0.002;
    mesh.current.position.set(
      -s.pointer.x * 0.55,
      -s.pointer.y * 0.35,
      FIELD_Z,
    );
  });

  return (
    <mesh ref={mesh} renderOrder={-90} frustumCulled={false}>
      <planeGeometry args={[1, 1, 1, 1]} />
      <shaderMaterial
        uniforms={uniforms}
        transparent
        premultipliedAlpha
        depthWrite={false}
        vertexShader="varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }"
        fragmentShader={FIELD_FRAGMENT}
      />
    </mesh>
  );
}

/* ---------------------------------------------------------------------- */
/* 2. The figure, as a 2.5D plate                                          */
/* ---------------------------------------------------------------------- */
// Same shader family as the chamber, one step nearer the camera: the analytic
// body volume gives the cutout parallax against the cursor and a rim that
// tracks it, so the figure stops reading as a sticker on a flat colour.
const CHARACTER_FRAGMENT = `
varying vec2 vUv;
uniform sampler2D uMap, uDepth, uNormal;
uniform vec2 uPointer;
uniform float uOpacity, uAmp, uLight, uGlow;
uniform vec3 uRim, uBounce;

void main(){
  vec3 maps = texture2D(uDepth, vUv).rgb;
  float volume = maps.r;
  float inside = maps.g;

  // Displacement has to fall off at the silhouette or the cutout eats its edge.
  vec2 uv = vUv + uPointer * (volume - 0.62) * uAmp * inside;
  vec4 texel = texture2D(uMap, uv);
  if (texel.a < 0.01) discard;

  vec3 normal = normalize(vec3(1.0, -1.0, 1.0) * (texture2D(uNormal, uv).rgb * 2.0 - 1.0));
  vec3 light = normalize(vec3(uPointer * 1.2, 0.5));
  // Measured against how a flat facing surface would respond, so the light
  // only ever sculpts curvature. Absolute lambert would wash the whole plate
  // up and down as the cursor crosses the screen.
  float shade = dot(normal, light) - light.z;
  // The volume map is a distance field, so a high power of its inverse is a
  // band a dozen pixels wide at the silhouette. Anything broader than that and
  // the warm light stops being a rim and starts bleaching the batik.
  float edge = pow(1.0 - volume, 6.0);

  vec3 colour = texel.rgb;
  colour *= .78 + shade * 0.18 * uLight;
  colour *= smoothstep(.03,.25,vUv.y);
  // Coral bouncing off the chamber floor, and a rim that follows the cursor.
  colour += uBounce * pow(1.0 - vUv.y, 4.0) * 0.045;
  colour += uRim * edge * max(shade, 0.0) * .18 * uLight;
  colour += uRim * edge * uGlow * .035;

  gl_FragColor = vec4(colour, texel.a * uOpacity);
  #include <colorspace_fragment>
}`;

export function HeroCharacter({ layout, mobile }) {
  const mesh = useRef();
  const material = useRef();
  const [map, depth, normal] = useTexture([
    "/character.png",
    "/textures/character-depth.jpg",
    "/textures/character-normal.jpg",
  ]);
  useMemo(() => {
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 8;
    [depth, normal].forEach((t) => {
      t.colorSpace = THREE.NoColorSpace;
      t.minFilter = THREE.LinearFilter;
      t.magFilter = THREE.LinearFilter;
    });
  }, [map, depth, normal]);

  const uniforms = useMemo(
    () => ({
      uMap: { value: map },
      uDepth: { value: depth },
      uNormal: { value: normal },
      uPointer: { value: new THREE.Vector2() },
      uOpacity: { value: 1 },
      uAmp: { value: mobile ? 0.006 : 0.011 },
      uLight: { value: 1 },
      uGlow: { value: 0 },
      uRim: { value: new THREE.Color("#FFD9A8") },
      uBounce: { value: new THREE.Color("#E05A4E") },
    }),
    [],
  );

  useFrame(({ clock }) => {
    const uniforms = mesh.current.material.uniforms;
    const time = s.reduced ? 0 : clock.elapsedTime;
    mesh.current.scale.set(layout.planeW, layout.planeH, 1);
    // A slow breath, and a nearer parallax than the chamber behind.
    mesh.current.position.set(
      layout.centerX + s.pointer.x * 0.075,
      layout.centerY + s.pointer.y * 0.045 + Math.sin(time * 0.55) * 0.022 - range(s.progress, JOURNEY.zoomStart, JOURNEY.zoomEnd) * (mobile ? 0.12 : 0.24),
      CHAR_Z,
    );
    mesh.current.rotation.y = s.pointer.x * 0.035;
    mesh.current.rotation.x = -s.pointer.y * 0.02;
    mesh.current.material.uniforms.uPointer.value.copy(s.pointer);
    // The bubble lights the hand that holds it.
    uniforms.uGlow.value = 0.12 + s.bubbleHover * 0.3;
    // Publish the palm so the camera can dolly to it and the doll can perch
    // above it. The character is the one component that owns the layout every
    // frame, so it is the single writer.
    s.palmX = layout.palmX;
    s.palmY = layout.palmY - range(s.progress, JOURNEY.zoomStart, JOURNEY.zoomEnd) * (mobile ? 0.12 : 0.24);
    // The figure is the subject of the zoom now, so it never leaves — it just
    // eases up to full as the title settles.
    const opacity = (0.72 + 0.28 * range(s.progress, 0, 0.18)) * (1 - s.outro);
    uniforms.uOpacity.value = opacity;
    uniforms.uLight.value = 1;
    mesh.current.visible = opacity > 0.01;
    material.current.transparent = true;
  });

  return (
    <mesh ref={mesh} renderOrder={0} frustumCulled={false}>
      <planeGeometry args={[1, 1, 1, 1]} />
      <shaderMaterial
        ref={material}
        uniforms={uniforms}
        transparent={false}
        depthWrite
        depthTest
        vertexShader="varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }"
        fragmentShader={CHARACTER_FRAGMENT}
      />
    </mesh>
  );
}

/* ---------------------------------------------------------------------- */
/* 3. The bubble                                                           */
/* ---------------------------------------------------------------------- */
// A soap film rather than a glass ball: a live cube camera supplies the
// reflection, thin-film interference supplies the colour, and Fresnel decides
// how much of each you see. The surface is displaced by 3D noise so it breathes
// and can carry a ripple outward from wherever it was clicked.
const BUBBLE_VERTEX = `
uniform float uTime, uWobble, uRipple, uRippleAge, uSwell;
uniform vec3 uRippleDir;
varying vec3 vNormalW, vWorld, vLocal;
${NOISE3}

float film(vec3 p){
  float n = noise3(p * 1.6 + vec3(0.0, uTime * 0.23, uTime * 0.12)) - 0.5;
  n += (noise3(p * 3.4 - vec3(uTime * 0.16, 0.0, uTime * 0.11)) - 0.5) * 0.45;
  float ripple = sin(dot(p, uRippleDir) * 8.5 - uRippleAge * 3.0) * uRipple;
  float wave = sin(p.y * 4.0 + p.x * 2.5 - uTime * 0.85) * 0.18;
  return (n + wave) * uWobble + ripple;
}
vec3 shift(vec3 p){ return p * (1.0 + uSwell + film(p)); }

void main(){
  vec3 displaced = shift(position);
  // Rebuild the normal from two neighbours so the wobble actually shades.
  vec3 axis = abs(normal.y) > 0.9 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
  vec3 t1 = normalize(cross(normal, axis));
  vec3 t2 = normalize(cross(normal, t1));
  vec3 a = shift(normalize(position + t1 * 0.05));
  vec3 b = shift(normalize(position + t2 * 0.05));
  vec3 n = normalize(cross(a - displaced, b - displaced));
  if (dot(n, normal) < 0.0) n = -n;

  vec4 world = modelMatrix * vec4(displaced, 1.0);
  vWorld = world.xyz;
  vLocal = displaced;
  vNormalW = normalize(mat3(modelMatrix) * n);
  gl_Position = projectionMatrix * viewMatrix * world;
}`;

const BUBBLE_FRAGMENT = `
uniform samplerCube uEnv;
uniform float uTime,uThickness,uOpacity,uHover,uFaceGain;
varying vec3 vNormalW,vWorld,vLocal;
vec3 interference(float thickness,float cosine){
  return .5+.5*cos(6.2831853*2.0*1.33*thickness*cosine/vec3(650.,510.,475.));
}
void main(){
  vec3 N=normalize(vNormalW),V=normalize(cameraPosition-vWorld);
  if(dot(N,V)<0.)N=-N;
  float c=clamp(dot(N,V),0.,1.);
  float fresnel=pow(1.-c,3.4),rim=pow(1.-c,12.);
  float thickness=uThickness*(.85+.13*vLocal.y+.04*sin(vLocal.y*3.+uTime*.06));
  vec3 pearl=mix(vec3(.91,.94,.98),interference(thickness,max(c,.18)),.32);
  vec3 R=reflect(-V,N);
  float key=exp(-pow((R.x+.48)/.12,2.)-pow((R.y-.28)/.65,2.))*smoothstep(-.1,.45,R.z);
  float fill=exp(-pow((R.x-.72)/.055,2.)-pow((R.y+.04)/.48,2.))*smoothstep(-.1,.4,R.z);
  vec3 radiance=textureCube(uEnv,R).rgb*.10+vec3(1.,.95,.88)*key*.95+vec3(.70,.78,.97)*fill*.45;
  float highlight=clamp(max(max(radiance.r,radiance.g),radiance.b),0.,1.);
  vec3 colour=radiance*pearl*.8+pearl*rim*.8+vec3(.18,.14,.17)*.09;
  float curl=sin(vLocal.x*7.+sin(vLocal.y*5.+uTime*.16)*1.7+uTime*.12);
  float mist=pow(.5+.5*curl,5.)*(1.-c*.55)*(.5+.5*sin(vLocal.y*4.-uTime*.13));
  colour+=mix(vec3(.24,.13,.18),vec3(.33,.40,.42),vLocal.y*.5+.5)*mist*.32;
  float alpha=(.015+mist*.055+fresnel*.33+rim*.27+highlight*.28+uHover*.012)*uOpacity*uFaceGain;
  gl_FragColor=vec4(colour,alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function Bubble({ layout, mobile, onEnter }) {
  const group = useRef(),
    front = useRef(),
    back = useRef(),
    hover = useRef(0);
  const { gl } = useThree();
  const target = useMemo(
    () => new THREE.WebGLCubeRenderTarget(128, { type: THREE.HalfFloatType }),
    [],
  );
  // An art-directed studio rig, captured once. No reflected duplicate props
  // and no six-pass scene capture every few frames during scrolling.
  useEffect(() => {
    const room = new THREE.Scene();
    room.background = new THREE.Color("#0c090b");
    const panels = [];
    function light(w, h, pos, color, intensity) {
      const material = new THREE.MeshBasicMaterial({
        color: new THREE.Color(color).multiplyScalar(intensity),
        side: THREE.DoubleSide,
        toneMapped: false,
      });
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
      panel.position.set(...pos);
      panel.lookAt(0, 0, 0);
      room.add(panel);
      panels.push(panel);
    }
    light(1.1, 6, [-3, 2, 4], "#fff4e9", 3.2);
    light(0.35, 4, [4, 0.5, 2], "#c9d0ef", 1.5);
    light(5, 3, [0, -4, -3], "#8e4034", 0.65);
    light(2, 0.5, [1, 4, -1], "#fff8ed", 1.8);
    const cube = new THREE.CubeCamera(0.1, 30, target);
    cube.update(gl, room);
    panels.forEach((p) => {
      p.geometry.dispose();
      p.material.dispose();
    });
    return () => target.dispose();
  }, [gl, target]);
  const uniforms = useMemo(
    () => ({
      uEnv: { value: target.texture },
      uTime: { value: 0 },
      uThickness: { value: 360 },
      uOpacity: { value: 1 },
      uHover: { value: 0 },
      uFaceGain: { value: 1 },
      uWobble: { value: 0.007 },
      uRipple: { value: 0 },
      uRippleAge: { value: 0 },
      uSwell: { value: 0 },
      uRippleDir: { value: new THREE.Vector3(0, 0, 1) },
    }),
    [target],
  );
  useFrame(({ clock }, dt) => {
    const time = s.reduced ? 8 : clock.elapsedTime;
    if (s.rippleAt === Infinity) s.rippleAt = time;
    hover.current = lerp(
      hover.current,
      s.bubbleHover,
      1 - Math.exp(-2.8 * Math.min(dt, 0.1)),
    );
    const breathe = s.reduced ? 0 : Math.sin(time * 0.7) * 0.016;
    const radius = layout.radius * (1 + breathe + hover.current * 0.009);
    // The film stays on the hand and simply clears as the camera moves in — it
    // no longer swells to swallow the view.
    group.current.position.set(
      layout.bubbleX + s.pointer.x * 0.045 + (s.reduced ? 0 : Math.sin(time * 0.43) * layout.radius * 0.025),
      layout.bubbleY +
        (s.reduced ? 0 : Math.sin(time * 0.58) * layout.radius * 0.035) +
        s.pointer.y * 0.03,
      BUBBLE_Z,
    );
    group.current.scale.setScalar(radius);
    group.current.rotation.set(
      s.pointer.y * 0.025,
      s.reduced ? 0 : Math.sin(time * 0.22) * 0.16,
      0,
    );
    s.bubbleCenter.copy(group.current.position);
    s.bubbleRadius = radius;
    s.bubbleBase = layout.radius;
    const opacity =
      (1 - range(s.progress, JOURNEY.bubbleFade[0], JOURNEY.bubbleFade[1])) *
      (1 - s.outro);
    group.current.visible = opacity > 0.001;
    [front.current, back.current].forEach((mat, i) => {
      const u = mat.uniforms;
      u.uTime.value = time;
      u.uHover.value = hover.current;
      u.uOpacity.value = opacity;
      u.uFaceGain.value = i === 0 ? 1 : 0.17;
      u.uWobble.value = s.reduced
        ? 0
        : 0.13 + Math.min(s.pointerVelocity, 0.3) * 0.025;
      const age = Math.max(0, time - s.rippleAt);
      u.uRippleAge.value = age;
      u.uRipple.value = s.reduced ? 0 : Math.exp(-age * 1.2) * 0.012;
      u.uRippleDir.value.copy(s.rippleDir);
    });
  }, -1);
  const interactive = {
    onPointerOver: (e) => {
      if (s.progress > JOURNEY.zoomStart) return;
      e.stopPropagation();
      s.bubbleHover = 1;
      gl.domElement.style.cursor = "pointer";
    },
    onPointerOut: () => {
      s.bubbleHover = 0;
      if (!s.hoveredId) gl.domElement.style.cursor = "default";
    },
    onClick: (e) => {
      if (s.progress > JOURNEY.zoomStart) return;
      e.stopPropagation();
      s.rippleAt = Infinity;
      s.rippleDir.copy(e.point).sub(group.current.position).normalize();
      onEnter?.();
    },
  };
  return (
    <group ref={group}>
      <mesh renderOrder={19}>
        <sphereGeometry args={[1, mobile ? 48 : 64, mobile ? 32 : 48]} />
        <shaderMaterial
          ref={back}
          uniforms={uniforms}
          transparent
          depthWrite={false}
          side={THREE.BackSide}
          vertexShader={BUBBLE_VERTEX}
          fragmentShader={BUBBLE_FRAGMENT}
        />
      </mesh>
      <mesh renderOrder={20} {...interactive}>
        <sphereGeometry args={[1, mobile ? 48 : 64, mobile ? 32 : 48]} />
        <shaderMaterial
          ref={front}
          uniforms={uniforms}
          transparent
          depthWrite={false}
          side={THREE.FrontSide}
          vertexShader={BUBBLE_VERTEX}
          fragmentShader={BUBBLE_FRAGMENT}
        />
      </mesh>
    </group>
  );
}

/* ---------------------------------------------------------------------- */
/* 4. Pointer                                                              */
/* ---------------------------------------------------------------------- */
// The canvas does not always take pointer events, and the parallax should keep
// working while the cursor is over the nav or the booking card, so the pointer
// is tracked on the window and damped here.
export function usePointerTracking() {
  const raw = useRef(new THREE.Vector2());
  const previous = useRef(new THREE.Vector2());
  useEffect(() => {
    const move = (e) => {
      if (e.pointerType === "touch" || e.touches) return;
      const touch = e.touches?.[0];
      const x = touch ? touch.clientX : e.clientX;
      const y = touch ? touch.clientY : e.clientY;
      if (x === undefined) return;
      raw.current.set((x / innerWidth) * 2 - 1, -((y / innerHeight) * 2 - 1));
    };
    // pointerout bubbles from every element transition, so it cannot be the
    // reset; only leaving the document or the window itself should recentre.
    const leave = () => raw.current.set(0, 0);
    addEventListener("pointermove", move, { passive: true });
    addEventListener("touchmove", move, { passive: true });
    addEventListener("blur", leave);
    document.documentElement.addEventListener("pointerleave", leave);
    return () => {
      removeEventListener("pointermove", move);
      removeEventListener("touchmove", move);
      removeEventListener("blur", leave);
      document.documentElement.removeEventListener("pointerleave", leave);
    };
  }, []);
  useFrame((_, dt) => {
    if (s.reduced) {
      s.pointer.set(0, 0);
      s.pointerVelocity = 0;
      return;
    }
    const k = 1 - Math.exp(-3.2 * Math.min(dt, 0.1));
    if (matchMedia("(pointer: coarse)").matches)
      raw.current.set(0, (s.progress - 0.5) * 0.15);
    previous.current.copy(s.pointer);
    s.pointer.lerp(raw.current, k);
    s.pointerVelocity = lerp(
      s.pointerVelocity,
      Math.min(
        previous.current.distanceTo(s.pointer) / Math.max(dt, 0.001),
        6,
      ) * 0.1,
      k,
    );
  }, -3);
}
