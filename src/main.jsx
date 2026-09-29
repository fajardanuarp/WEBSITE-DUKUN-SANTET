import React, { Suspense, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { JOURNEY } from "./journey";
import Lenis from "@studio-freight/lenis";
import Scene, { SceneLoader } from "./Scene";
import { scrollState as state } from "./scrollState";
import "./style.css";
gsap.registerPlugin(ScrollTrigger, useGSAP);
function App() {
  const root = useRef(),
    lenis = useRef(),
    label = useRef(),
    origin = useRef(),
    dialog = useRef(),
    returningFocus = useRef(false),
    closeTimer = useRef(null);
  const swipeStart = useRef(null);
  const [selectedId, setSelectedId] = useState("boneka");
  const selectItem = (id) => { state.selectedId = id; setSelectedId(id); };
  const stepItem = (direction) => {
    if (!items.length) return;
    const index = items.findIndex(i => i.id === state.selectedId);
    selectItem(items[(index + direction + items.length) % items.length].id);
  };
  const [items, setItems] = useState([]),
    [panel, setPanel] = useState(null),
    [closing, setClosing] = useState(false),
    [booked, setBooked] = useState(false),
    [fallback, setFallback] = useState(false),
    [reduced, setReduced] = useState(
      matchMedia("(prefers-reduced-motion: reduce)").matches,
    );
  useEffect(() => {
    fetch("/props/props.json")
      .then((r) => r.json())
      .then(setItems);
    const q = matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setReduced(q.matches);
    q.addEventListener("change", change);
    try {
      const c = document.createElement("canvas");
      if (!c.getContext("webgl2")) setFallback(true);
    } catch {
      setFallback(true);
    }
    return () => q.removeEventListener("change", change);
  }, []);
  // Clicking the bubble is the same journey as scrolling, just taken in one go:
  // the film ripples where it was touched and the page carries you inside.
  const enterBubble = () => {
    // Touching the film runs the same zoom a scroll would, in one motion — let
    // the ripple read first, then carry the page down through the pinned zoom.
    setTimeout(
      () =>
        lenis.current?.scrollTo((innerHeight * JOURNEY.scrollVh) / 100, {
          duration: 3.2,
        }),
      260,
    );
  };
  const close = () => {
    if (closeTimer.current) return;
    setClosing(true);
    closeTimer.current = setTimeout(
      () => {
        setPanel(null);
        setClosing(false);
        closeTimer.current = null;
        state.focusedId = null;
        state.phase = state.progress > 0.985 ? "INTERIOR" : "HERO";
      },
      reduced ? 0 : 480,
    );
  };
  useEffect(() => () => clearTimeout(closeTimer.current), []);
  const open = (item) => {
    clearTimeout(closeTimer.current);
    closeTimer.current = null;
    setClosing(false);
    origin.current = document.activeElement;
    setBooked(false);
    setPanel(item);
    if (item.id) {
      state.focusedId = item.id;
      state.phase = "FOCUSED";
    }
  };
  useEffect(() => {
    if (!panel) return;
    lenis.current?.stop();
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = setTimeout(
      () => dialog.current?.querySelector("button")?.focus(),
      30,
    );
    const key = (e) => {
      if (e.key === "Escape") close();
      if (e.key === "Tab") {
        const els = [...dialog.current.querySelectorAll("button,a,input")];
        const first = els[0],
          last = els.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", key);
    return () => {
      clearTimeout(focusTimer);
      document.body.style.overflow = old;
      lenis.current?.start();
      window.removeEventListener("keydown", key);
      returningFocus.current = true;
      origin.current?.focus?.({ preventScroll: true });
      requestAnimationFrame(() => (returningFocus.current = false));
    };
  }, [panel]);
  useGSAP(
    () => {
      state.reduced = reduced;
      state.progress = 0;
      state.outro = 0;
      state.entrance = 1;
      const smooth = new Lenis({ smoothWheel: !reduced, duration: 1.5 });
      lenis.current = smooth;
      smooth.on("scroll", ScrollTrigger.update);
      const tick = (t) => smooth.raf(t * 1000);
      gsap.ticker.add(tick);
      gsap.ticker.lagSmoothing(0);
      if (!reduced && !fallback) {
        gsap.from(".hero-top,.hero-bottom", {
          opacity: 0,
          y: 8,
          duration: 1.8,
          stagger: 0.12,
          ease: "power2.out",
        });
        const panel = root.current.querySelector(".zoom-panel");
        const tl = gsap.timeline({
          onUpdate() {
            const pr = this.progress();
            state.progress = pr;
            // The overlay only takes pointer events once it has faded in over
            // the hand.
            if (panel) {
              const live = pr > JOURNEY.panelStart;
              panel.classList.toggle("is-live", live);
              panel.inert = !live;
            }
          },
          scrollTrigger: {
            id: "dukun-journey",
            trigger: ".hero",
            start: "top top",
            end: () => "+=" + (innerHeight * JOURNEY.scrollVh) / 100,
            pin: true,
            scrub: JOURNEY.scrub,
            anticipatePin: 1,
            invalidateOnRefresh: true,
          },
          defaults: { ease: "none" },
        });
        tl.fromTo(
          ".lockup-left > span,.lockup-right > span",
          { opacity: 0.32, y: 34 },
          { opacity: 1, y: 0, duration: 0.12, stagger: 0.03 },
          0,
        )
          .fromTo(
            ".eyebrow,.tagline",
            { opacity: 0.22, y: 22 },
            { opacity: 1, y: 0, duration: 0.13, stagger: 0.03 },
            0.02,
          )
          // The intro copy clears out of the way as the camera starts to move.
          // The product overlay reveals itself off the `.is-live` class (CSS
          // transitions) so it is immune to the async item load reordering the
          // scrubbed tweens — see the onUpdate toggle above.
          .to(
            ".hero-copy,.hero-top,.hero-bottom",
            { opacity: 0, y: -30, duration: 0.14 },
            JOURNEY.zoomStart,
          )
          .to({}, { duration: 0.01 }, 1);
      }
      return () => {
        smooth.destroy();
        gsap.ticker.remove(tick);
      };
    },
    { scope: root, dependencies: [reduced, fallback], revertOnUpdate: true },
  );
  return (
    <div ref={root}>
      {!fallback && items.length > 0 && (
        <Scene
          items={items}
          onSelect={open}
          onEnterBubble={enterBubble}
          labelRef={label}
          onFail={() => setFallback(true)}
          reduced={reduced}
        />
      )}
      <SceneLoader />
      <div className="ambient-base" />
      <main>
        <section className="hero" id="home">
          {fallback && (
            <div className="hero-atmosphere" aria-hidden="true">
              <picture>
                <source
                  media="(max-width: 700px)"
                  srcSet="/textures/scene-mobile.jpg"
                />
                <img src="/textures/scene.jpg" alt="" fetchPriority="high" />
              </picture>
              <div className="hero-light" />
            </div>
          )}
          <div className="hero-top hero-fade">
            <a className="wordmark" href="#home" aria-label="Dukun home">
              Dukun<span className="brand-star">✳</span>
            </a>
          </div>
          {/* With WebGL the figure is a 2.5D plate inside the canvas so the
              bubble can reflect it and the props can pass behind it. */}
          {fallback && (
            <div className="character-wrap">
              <img
                className="character"
                src="/character.png"
                alt="Dukun Gen Z memakai batik merah, kacamata perak, dan membawa tongkat"
                fetchPriority="high"
              />
            </div>
          )}
          <div className="hero-copy hero-fade">
            <p className="eyebrow">
              <span className="eyebrow-rule" />
              Di antara dua dunia
            </p>
            <h1 className="lockup">
              <span className="lockup-left">
                <span className="line-solid">GEN Z</span>
                <span className="line-solid">Witch</span>
              </span>
              <span className="lockup-right">
                <span className="line-hollow">Dukun</span>
                <span className="line-hollow">Gen Z</span>
              </span>
            </h1>
            <p className="tagline">
              Ada yang tak terlihat.
              <br />
              Tapi selalu terasa.
            </p>
          </div>
          {fallback && (
            <img
              className="static-bubble"
              src="/bubble.png"
              alt=""
              aria-hidden="true"
            />
          )}
          <div className="hero-bottom hero-fade">
            <a
              href="#home"
              onClick={(e) => {
                e.preventDefault();
                lenis.current?.scrollTo((innerHeight * JOURNEY.scrollVh) / 100, {
                  duration: 3,
                });
              }}
            >
              <span className="scroll-icon">↓</span> Scroll pelan. Masuk ke
              dalam.
            </a>
            {!fallback && (
              <span className="bubble-hint">
                <span className="hint-dot" /> Gelembungnya bisa disentuh
              </span>
            )}
            <span>Est. di alam ini, 2026</span>
          </div>
          <div className={"zoom-panel" + (reduced || fallback ? " is-live static-collection" : "")} inert={!reduced && !fallback} aria-label="Koleksi Dukun" role="region" aria-roledescription="carousel"
            onPointerDown={e => { if(e.button === 0) swipeStart.current = [e.clientX,e.clientY]; }}
            onPointerCancel={() => { swipeStart.current = null; }}
            onPointerUp={e => { const start=swipeStart.current; swipeStart.current=null; if(start && Math.abs(e.clientX-start[0])>55 && Math.abs(e.clientX-start[0])>Math.abs(e.clientY-start[1])*1.4) stepItem(e.clientX<start[0]?1:-1); }}
            onKeyDown={e => { if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();stepItem(e.key==='ArrowRight'?1:-1);} }}>
            <div className="collection-swipe-surface" aria-hidden="true" />
            <div className="zoom-cards">
              {items.map((item, i) => (
                <button
                  key={item.id}
                  className={"zoom-card" + (selectedId === item.id ? " is-selected" : "")}
                  aria-pressed={selectedId === item.id}
                  onClick={() => selectItem(item.id)}
                  aria-label={item.name}
                >
                  <img className="zoom-card-thumb" src={`/editorial/${item.id}.png`} alt="" />
                  
                </button>
              ))}
            </div>
            <div className="zoom-text" aria-live="polite">
              {items.filter(item => item.id === selectedId).map(item => <div className="collection-copy" data-item={item.id} key={item.id}>
                <p className="collection-caption">Koleksi lintas dimensi</p>
                <h2>{item.name.split(' ').map((word,i) => <React.Fragment key={i}>{i>0 && <br />}{word}{i===item.name.split(' ').length-1?'.':''}</React.Fragment>)}</h2>
                <p className="zoom-lead">{item.blurb}</p>
                <button className="zoom-cta" onClick={() => open(item)}>Lihat detailnya <span aria-hidden="true">↗</span></button>
              </div>)}
              <div className="collection-controls"><button onClick={() => stepItem(-1)} aria-label="Benda sebelumnya">←</button><span>{String(items.findIndex(i=>i.id===selectedId)+1).padStart(2,'0')} / {String(items.length).padStart(2,'0')}</span><button onClick={() => stepItem(1)} aria-label="Benda berikutnya">→</button></div>
              <p className="swipe-hint">Geser untuk menemukan cerita lain</p>
            </div>
          </div>
        </section>
      </main>
      <div ref={label} className="prop-label" aria-live="polite">
        <strong />
        <span />
      </div>
      {panel && (
        <div
          className={"panel-backdrop" + (closing ? " is-closing" : "")}
          onClick={close}
        >
          <section
            ref={dialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="panel-title"
            className="detail-panel"
            onClick={(e) => e.stopPropagation()}
          >
            <button className="close" onClick={close} aria-label="Tutup panel">
              ✕
            </button>
            <p className="panel-caption">
              Dukun · {panel.id ? "Koleksi" : "Di alam ini"}
            </p>
            <h2 id="panel-title">{panel.name}</h2>
            <p className="english">{panel.nameEn}</p>
            <div className="panel-mark">✳</div>
            <p className="blurb">{panel.blurb}</p>
            {panel.price && <p className="panel-price">{panel.price}</p>}
            {!panel.info && (
              <button
                className="primary"
                onClick={() => setBooked(true)}
                disabled={booked}
              >
                {booked ? "Permintaan demo diterima" : "Booking"}
              </button>
            )}
            {panel.name === "Newsletter" && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setBooked(true);
                }}
              >
                <label htmlFor="email">Email kamu</label>
                <input
                  id="email"
                  type="email"
                  placeholder="nama@email.com"
                  required
                />
                <button className="primary">
                  {booked ? "Kamu masuk daftar demo" : "Ikut newsletter"}
                </button>
              </form>
            )}
            <p className="fiction" role="status">
              {booked
                ? "Tidak ada pembayaran atau data yang dikirim. Ini hanya simulasi."
                : "Situs fiksi. Energinya nyata, transaksinya tidak."}
            </p>
          </section>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
