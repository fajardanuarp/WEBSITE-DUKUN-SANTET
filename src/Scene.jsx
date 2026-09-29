import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  Environment,
  Lightformer,
  PerformanceMonitor,
  useGLTF,
  useProgress,
  useTexture,
} from "@react-three/drei";
import * as THREE from "three";
import { KTX2Loader } from "three-stdlib";
import { JOURNEY, range } from "./journey";
import { scrollState as s } from "./scrollState";
import {
  Bubble,
  HeroCharacter,
  HeroField,
  useHeroLayout,
  usePointerTracking,
} from "./Hero3D";
const lerp = THREE.MathUtils.lerp;

// KTX2 support must be detected against the live renderer before preloading.
function configureLoader(loader, gl) {
  loader.setKTX2Loader(
    new KTX2Loader().setTranscoderPath("/basis/").detectSupport(gl),
  );
}
class ModelBoundary extends React.Component {
  constructor(p) {
    super(p);
    this.state = { bad: false };
  }
  static getDerivedStateFromError() {
    return { bad: true };
  }
  render() {
    return this.state.bad ? <FallbackModel /> : this.props.children;
  }
}
function FallbackModel() {
  const { scene } = useGLTF("/props/placeholder.glb");
  return <primitive object={scene.clone()} />;
}
function Model({ item }) {
  const { gl } = useThree();
  const { scene } = useGLTF("/props/" + item.file, "/draco/", true, (loader) =>
    configureLoader(loader, gl),
  );
  const clone = useMemo(() => {
    const obj = scene.clone(true);
    const box = new THREE.Box3().setFromObject(obj),
      size = box.getSize(new THREE.Vector3()),
      center = box.getCenter(new THREE.Vector3());
    obj.position.sub(center);
    const container = new THREE.Group();
    container.add(obj);
    container.scale.setScalar(1.6 / Math.max(size.x, size.y, size.z));
    obj.traverse((n) => {
      if (n.isMesh) {
        if (!n.geometry.attributes.normal) n.geometry.computeVertexNormals();
        n.layers.enable(1);
        n.material = n.material.clone();
        if (item.id !== "keris") {
          n.material.metalness = 0;
          n.material.roughness = 0.85;
          n.material.normalScale?.setScalar(0.12);
        }
        n.material.envMapIntensity = 1.2;
        n.userData.rim = { value: 0 };
        n.material.onBeforeCompile = (shader) => {
          shader.uniforms.uRim = n.userData.rim;
          shader.fragmentShader =
            "uniform float uRim;\n" + shader.fragmentShader;
          shader.fragmentShader = shader.fragmentShader.replace(
            "#include <emissivemap_fragment>",
            "#include <emissivemap_fragment>\n totalEmissiveRadiance += vec3(0.91,0.70,0.24) * pow(1.0-abs(dot(normal,normalize(vViewPosition))),3.0) * uRim;",
          );
        };
      }
    });
    return container;
  }, [scene]);
  return <primitive object={clone} />;
}
// Which prop is showcased above the hand at the end of the zoom, and where it
// sits relative to the palm (in bubble-radius units, tuned against the render).
const SHOWCASE = { up: 1.15, side: -0.12, z: 0.5, scale: 0.62, upMobile: 1.15 };

// During the hero hold the four props orbit inside the film. On scroll the
// showcased doll eases up over the open palm and grows; the rest dissolve.
function Prop({ item, index, count, progress }) {
  const ref = useRef();
  const offset = useMemo(() => new THREE.Vector3(), []);
  const target = useMemo(() => new THREE.Vector3(), []);
  const showcase = useMemo(() => new THREE.Vector3(), []);
  const bound = 1.39; // conservative bound for a model normalized to a 1.6-unit box
  const presence = useRef(item.id === s.selectedId ? 1 : 0);
  useFrame(({ clock }, dt) => {
    if (!ref.current) return;
    const p = progress.current;
    const time = s.reduced ? 0 : clock.elapsedTime;
    const mobile = innerWidth < 700;
    const angle = Math.PI / 2 + index * Math.PI * 2 / count;
    const a = [Math.cos(angle) * .31, Math.sin(angle) * .31, index % 2 ? -.06 : .04];
    const base = s.bubbleBase;
    const heroScale = base * (count > 4 ? .24 : .29);

    // Orbit pose inside the film (the resting hero state).
    offset
      .set(
        a[0] + Math.sin(time * 0.57 + index) * 0.10,
        a[1] + Math.sin(time * 0.68 + index * 1.7) * 0.11,
        a[2] + Math.cos(time * 0.43 + index) * 0.09,
      )
      .multiplyScalar(base);
    const maxOffset = Math.max(0, s.bubbleRadius * 0.84 - bound * heroScale);
    if (offset.length() > maxOffset) offset.setLength(maxOffset);
    target.copy(s.bubbleCenter).add(offset);

    const selected = item.id === s.selectedId;
    presence.current = s.reduced ? Number(selected) : lerp(presence.current, Number(selected), 1-Math.exp(-4.2*dt));
    if (p > JOURNEY.dollStart || selected) {
      // Ease the doll from the orbit up over the open palm and grow it into a
      // frontal showcase as the camera moves in.
      const rise = range(p, JOURNEY.dollStart, JOURNEY.dollEnd);
      const r = s.bubbleRadius;
      showcase.set(
        s.palmX + r * SHOWCASE.side - (mobile ? .22 : 0),
        s.palmY + r * (mobile ? SHOWCASE.upMobile : SHOWCASE.up),
        SHOWCASE.z,
      );
      // A small looping drift keeps the showcase alive without leaving the hand.
      if (!s.reduced) {
        showcase.x += Math.sin(time * .67 + index * .6) * r * (mobile ? .035 : .065);
        showcase.y += Math.sin(time * .93 + index * .7) * r * .11;
        showcase.z += Math.sin(time * .58 + index) * .045;
      }
      target.lerp(showcase, rise);
      const weight = presence.current;
      const scale = lerp(heroScale, (mobile ? .45 : SHOWCASE.scale) * (.72 + weight * .28), rise);
      target.x += (1-weight) * rise * .35;
      target.z -= (1-weight) * rise * .3;
      ref.current.position.copy(target);
      ref.current.scale.setScalar(scale);
      ref.current.rotation.set(
        lerp(Math.sin(time * .48) * .23, Math.sin(time * .81) * .15, rise),
        lerp(Math.sin(time * 0.37) * 0.48, Math.sin(time * .63) * .42 + (1-weight)*1.5, rise),
        lerp(Math.sin(time * .43) * .20, Math.sin(time * .74) * .13, rise),
      );
      ref.current.visible = s.outro < 0.999 && (rise < .999 || weight > .005);
      ref.current.traverse((n) => {
        if (n.isMesh && n.material) {
          n.material.transparent = true;
          n.material.opacity = lerp(1, weight, rise);
          n.material.envMapIntensity = 1.25;
        }
      });
      return;
    }

    // Loose props: keep orbiting so they return on reverse scroll, but dissolve
    // as the zoom begins.
    const fade = range(p, JOURNEY.propsFade[0], JOURNEY.propsFade[1]);
    ref.current.position.copy(target);
    ref.current.scale.setScalar(heroScale);
    ref.current.rotation.set(
      Math.sin(time * 0.48 + index) * 0.23,
      Math.sin(time * 0.37 + index) * 0.48,
      Math.sin(time * 0.43 + index) * 0.20,
    );
    ref.current.visible = fade < 0.999 && s.outro < 0.999;
    ref.current.traverse((n) => {
      if (n.isMesh && n.material) {
        n.material.transparent = true;
        n.material.opacity = 1 - fade;
        n.material.envMapIntensity = 1.25;
      }
    });
  });
  return (
    <group ref={ref}>
      <ModelBoundary>
        <Suspense fallback={null}>
          <Model item={item} />
        </Suspense>
      </ModelBoundary>
    </group>
  );
}
function FloatingPins() {
  const ref = useRef();
  useFrame(({clock}) => {
    if(!ref.current) return;
    const reveal=range(s.progress,JOURNEY.panelStart,.85);
    const t=s.reduced?0:clock.elapsedTime;
    ref.current.visible=reveal>.001;
    ref.current.children.forEach((pin,i)=>{
      const angle=i*Math.PI*2/5+t*.13;
      pin.position.set(s.palmX-(innerWidth<700?.22:0)+Math.cos(angle)*(innerWidth<700?.38:.72),s.palmY+s.bubbleRadius*1.00+Math.sin(angle)*(innerWidth<700?.32:.48),.05+Math.sin(angle)*.25);
      pin.rotation.set(Math.sin(t*.3+i)*.4,angle+.5,Math.cos(t*.2+i)*.5);
      pin.scale.setScalar((.095+(i%2)*.025)*reveal);
    });
  });
  return <group ref={ref}>{Array.from({length:5},(_,i)=><group key={i}><ModelBoundary><Suspense fallback={null}><Model item={{id:"pin",file:"push_pin.glb"}} /></Suspense></ModelBoundary></group>)}</group>;
}
function Atmosphere({ progress }) {
  const ref = useRef();
  const texture = useTexture(
    innerWidth < 700 ? "/textures/scene-mobile.jpg" : "/textures/scene.jpg",
  );
  texture.colorSpace = THREE.SRGBColorSpace;
  const suffix = innerWidth < 700 ? "-mobile" : "";
  const [depthMap, normalMap, noiseMap] = useTexture([
    "/textures/scene-depth" + suffix + ".jpg",
    "/textures/scene-normal" + suffix + ".jpg",
    "/textures/noise.jpg",
  ]);
  [depthMap, normalMap, noiseMap].forEach((t) => {
    t.colorSpace = THREE.NoColorSpace;
    t.minFilter = THREE.LinearFilter;
    t.magFilter = THREE.LinearFilter;
  });
  noiseMap.wrapS = noiseMap.wrapT = THREE.RepeatWrapping;
  const uniforms = useMemo(
    () => ({
      uScene: { value: texture },
      uDepth: { value: depthMap },
      uNormal: { value: normalMap },
      uNoise: { value: noiseMap },
      uFogStrength: { value: 0.1 },
      uParticleDensity: { value: 0.18 },
      uIntensity: { value: 0 },
      uTime: { value: 0 },
      uPointer: { value: new THREE.Vector2() },
      uFogWarm: { value: new THREE.Color("#E05A4E") },
      uFogCool: { value: new THREE.Color("#3B4A52") },
    }),
    [],
  );
  useFrame(({ clock }, dt) => {
    const live = ref.current.material.uniforms;
    live.uTime.value = s.reduced ? 0 : clock.elapsedTime;
    live.uIntensity.value = range(progress.current, 0.58, 0.81) * (1 - s.outro);
    live.uPointer.value.lerp(
      innerWidth < 700
        ? new THREE.Vector2(0, progress.current * 0.4)
        : s.pointer,
      1 - Math.pow(0.001, dt),
    );
  });
  return (
    <mesh ref={ref} frustumCulled={false} renderOrder={-100}>
      <planeGeometry args={[2, 2, 1, 1]} />
      <shaderMaterial
        depthTest={false}
        depthWrite={false}
        transparent={false}
        uniforms={uniforms}
        vertexShader={
          "varying vec2 vUv; void main(){vUv=uv; gl_Position=vec4(position.xy,0.999,1.); }"
        }
        fragmentShader={`varying vec2 vUv;uniform sampler2D uScene;uniform sampler2D uDepth;uniform sampler2D uNormal;uniform sampler2D uNoise;uniform float uFogStrength;uniform float uParticleDensity;uniform float uIntensity;uniform float uTime;uniform vec2 uPointer;uniform vec3 uFogWarm;uniform vec3 uFogCool;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}void main(){if(uIntensity<.001)discard;vec2 uv=vUv+uPointer*.025;float n=noise(uv*5.+vec2(uTime*.015,0.));n+=noise(uv*12.-uTime*.012)*.35;float fog=pow(1.-vUv.y,2.)*n*uFogStrength;float depth=texture2D(uDepth,vUv).r;vec3 normal=texture2D(uNormal,vUv).rgb*2.-1.;vec2 sceneUv=vUv+uPointer*.015*depth+normal.xy*.001;vec3 room=texture2D(uScene,sceneUv).rgb;vec3 c=room*.40+vec3(.015,.007,.005)+uFogWarm*fog+uFogCool*n*.035*vUv.y;float vignette=smoothstep(.2,.8,length(vUv-.5));c*=1.-vignette*.5;float dust=step(.998,texture2D(uNoise,vUv*2.+vec2(uTime*.002,0.)).r)*uParticleDensity;c+=dust*.08;gl_FragColor=vec4(c,uIntensity);
#include <tonemapping_fragment>
#include <colorspace_fragment>
gl_FragColor.rgb*=uIntensity;
}`}
      />
    </mesh>
  );
}
function World({ items, onEnterBubble, reduced }) {
  const { camera, gl, scene, size } = useThree();
  const layout = useHeroLayout();
  const mobile = size.width < 700;
  usePointerTracking();
  const cluster = useRef(),
    progress = useRef(0);
  const target = useMemo(() => new THREE.Vector3(), []),
    look = useMemo(() => new THREE.Vector3(), []),
    cameraLook = useMemo(() => new THREE.Vector3(), []);
  const heroEnv = useMemo(() => new THREE.Scene(), []);
  const lastPhase = useRef("");
  useEffect(() => {
    items.forEach((item) =>
      useGLTF.preload("/props/" + item.file, "/draco/", true, (loader) =>
        configureLoader(loader, gl),
      ),
    );
  }, [gl, items]);
  useFrame((_, dt) => {
    const k = 1 - Math.pow(0.001, Math.min(dt, 0.1));
    progress.current = s.progress;
    const p = progress.current;
    // One act now: hold, then dolly into the open hand. No interior room.
    const phase = p > JOURNEY.zoomStart ? "ZOOM" : "HERO";
    s.phase = phase;
    if (lastPhase.current !== phase) {
      // The hero always takes pointer events: the bubble is reachable at the
      // top, and the cards over the zoomed hand are reachable at the bottom.
      gl.domElement.closest(".canvas-container").style.pointerEvents = "auto";
      lastPhase.current = phase;
    }
    if (heroEnv.environment) scene.environment = heroEnv.environment;

    // Camera dolly. The palm sits to the figure's right; aiming there brings the
    // batik across the left of frame and leaves the right open for type — the
    // reference crop. The aim is scaled by K so the fully-zoomed frame lands on
    // the doll-over-palm composition rather than overshooting past it.
    const zoom = range(p, JOURNEY.zoomStart, JOURNEY.zoomEnd);
    const K = mobile ? 0.74 : 0.72;
    const aimX = s.palmX * (mobile ? 0.82 : 0.9) * K;
    const aimY = (layout.palmY + layout.radius * (mobile ? 0.5 : 0.42)) * K;
    const endZ = mobile ? 3.7 : 3.3;
    target.set(lerp(0, aimX, zoom), lerp(0, aimY, zoom), lerp(6, endZ, zoom));
    look.set(lerp(0, aimX, zoom), lerp(0, aimY, zoom), 0);
    camera.position.lerp(target, k);
    cameraLook.lerp(look, k);
    camera.lookAt(cameraLook);
    gl.domElement.style.opacity = 1 - s.outro;
  }, -2);
  return (
    <>
      <ambientLight intensity={0.9} />
      <directionalLight position={[2, 4, 5]} intensity={2.4} />
      <Atmosphere progress={progress} />
      <Suspense fallback={null}>
        <HeroField mobile={mobile} />
        <HeroCharacter layout={layout} mobile={mobile} />
      </Suspense>
      <Environment
        scene={heroEnv}
        resolution={256}
        frames={1}
        background={false}
      >
        <Lightformer
          form="rect"
          intensity={2.2}
          color="#E05A4E"
          scale={[14, 14, 1]}
          position={[0, 0, -6]}
        />
        <Lightformer
          form="rect"
          intensity={4}
          color="#FFF6EE"
          scale={[3, 8, 1]}
          position={[-4, 2, 3]}
          rotation={[0, Math.PI / 3, 0]}
        />
        <Lightformer
          form="ring"
          intensity={6}
          color="#FFFFFF"
          scale={1.2}
          position={[3.5, 3, 2]}
        />
        <Lightformer
          form="rect"
          intensity={0.15}
          color="#140A08"
          scale={[10, 10, 1]}
          position={[0, -5, 2]}
        />
      </Environment>
      <group ref={cluster}>
        {items.map((item, i) => (
          <Prop
            key={item.id}
            item={item}
            index={i}
            count={items.length}
            progress={progress}
          />
        ))}
      </group>
      <FloatingPins />
      <Bubble layout={layout} mobile={mobile} onEnter={onEnterBubble} />
    </>
  );
}
export default function Scene(props) {
  const [dpr, setDpr] = useState(innerWidth < 700 ? 1.5 : 1.75),
    [active, setActive] = useState(true);
  useEffect(() => {
    const onVisibility = () => setActive(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);
  return (
    <div className="canvas-container">
      <Canvas
        camera={{ position: [0, 0, 6], fov: 45, near: 0.05, far: 100 }}
        dpr={dpr}
        frameloop={active ? "always" : "never"}
        gl={{ alpha: true, antialias: true }}
        onCreated={({ gl }) => {
          gl.outputColorSpace = THREE.SRGBColorSpace;
          gl.domElement.addEventListener("webglcontextlost", props.onFail);
        }}
      >
        <PerformanceMonitor onDecline={() => setDpr(1)} />
        <Suspense fallback={null}>
          <World {...props} />
        </Suspense>
      </Canvas>
    </div>
  );
}

export function SceneLoader() {
  const { active, progress } = useProgress();
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    if (active) {
      setVisible(true);
      return;
    }
    const timer = setTimeout(
      () => setVisible(false),
      matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 1000,
    );
    return () => clearTimeout(timer);
  }, [active]);
  return visible ? (
    <div className="scene-loader" data-loading={active} role="status">
      <span>Dukun✳</span>
      <p>Menghubungkan dua dunia.</p>
      <div className="loading-rule">
        <i style={{ transform: `scaleX(${progress / 100})` }} />
      </div>
      <small>{Math.round(progress)}%</small>
    </div>
  ) : null;
}
