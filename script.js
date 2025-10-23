// ===== Slider (autoplay + Pfeile) — ENDLOS, OHNE SICHTBAREN SPRUNG =====
(function(){
  const sliders = document.querySelectorAll('.slider');
  sliders.forEach(setup);

  function setup(el){
    const track  = el.querySelector('.slides');
    const orig   = [...el.querySelectorAll('.slide')];
    const count  = orig.length;
    if (count <= 1) return;

    // Klone für nahtloses Loopen (vorne & hinten)
    const firstClone = orig[0].cloneNode(true);
    const lastClone  = orig[count - 1].cloneNode(true);
    track.appendChild(firstClone);
    track.insertBefore(lastClone, orig[0]);

    // State
    let index = 1; // wir starten auf der ersten "echten" Slide
    let timer = null, hover = false;
    let isTransitioning = false;
    let isAdjusting = false;
    const SPEED = 4000;

    // Transition helpers
    const enableTransition  = () => { track.style.transition = 'transform .5s ease'; };
    const disableTransition = () => { track.style.transition = 'none'; };

    // Innenbreite (ohne linkes/rechtes Padding der .slider-Box)
    function innerWidth(){
      const cs = getComputedStyle(el);
      const padL = parseFloat(cs.paddingLeft) || 0;
      const padR = parseFloat(cs.paddingRight) || 0;
      return Math.max(0, Math.round(el.clientWidth - padL - padR));
    }

    // Allen Slides exakt die Innenbreite geben (Pixel, keine %)
    function sizeSlides(){
      const w = innerWidth();
      [...track.children].forEach(sl => { sl.style.flex = `0 0 ${w}px`; sl.style.width = `${w}px`; });
    }

    function render(){
      const w = innerWidth();
      const x = -index * w; // ganze Pixel
      track.style.transform = `translate3d(${x}px,0,0)`;
    }

    // Sichtbaren/kommenden Zustand bekanntmachen (für Lazy-Loader Preload)
    function announcePrime(){
      // nächste 1–2 echten Slides (ohne Klone) bestimmen
      const n1 = ((index) % count) + 1;      // next
      const n2 = ((index + 1) % count) + 1;  // next+1
      const img1 = orig[n1 - 1].querySelector('img,picture img');
      const img2 = orig[n2 - 1].querySelector('img,picture img');
      el.dispatchEvent(new CustomEvent('slider:prime', { detail: { next: [img1, img2].filter(Boolean), index, count }}));
    }

    // Initial sizing + position ohne Animation
    sizeSlides();
    disableTransition(); render();
    void track.offsetWidth; // Reflow
    enableTransition();
    announcePrime();

    // Navigation (Blocken während Transition/Adjust)
    function goTo(newIndex){
      if (isTransitioning || isAdjusting) return;
      isTransitioning = true;
      index = newIndex;
      enableTransition();
      render();
      announcePrime();   // <- bei Navigation gleich Preload für nächste Slides anstoßen
      restart();
    }
    function next(){ goTo(index + 1); }
    function prev(){ goTo(index - 1); }

    // Nahtlos korrigieren, ohne sichtbare Transition
    function silentJump(targetIndex){
      isAdjusting = true;
      disableTransition();
      index = targetIndex;
      render();
      void track.offsetWidth; // Reflow
      enableTransition();
      isAdjusting = false;
      announcePrime();
    }

    track.addEventListener('transitionend', (e)=>{
      if (e.propertyName !== 'transform') return;
      isTransitioning = false;

      // Echte Slides liegen bei 1..count
      if (index === 0){
        silentJump(count);     // vom left-Clone auf echte letzte
      } else if (index === count + 1){
        silentJump(1);         // vom right-Clone auf echte erste
      }
    });

    // Controls
    const btnPrev = document.createElement('button'); btnPrev.className='prev'; btnPrev.textContent='‹';
    const btnNext = document.createElement('button'); btnNext.className='next'; btnNext.textContent='›';
    el.append(btnPrev, btnNext);
    btnPrev.addEventListener('click', prev);
    btnNext.addEventListener('click', next);

    // Autoplay
    function step(){ if(!hover && document.visibilityState==='visible' && !isTransitioning && !isAdjusting) next(); }
    function start(){ timer = setInterval(step, SPEED); }
    function stop(){ if (timer) clearInterval(timer); }
    function restart(){ stop(); start(); }
    start();

    // Hover stop/start
    el.addEventListener('mouseenter', ()=>{ hover = true; stop(); });
    el.addEventListener('mouseleave', ()=>{ hover = false; start(); });

    // Sichtbarkeit
    document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState==='visible') start(); else stop(); });

    // Keyboard
    window.addEventListener('keydown', e=>{
      if(document.activeElement && ['INPUT','TEXTAREA','SELECT','BUTTON'].includes(document.activeElement.tagName)) return;
      if(e.key==='ArrowLeft')  prev();
      if(e.key==='ArrowRight') next();
    });

    // Resize: Slides neu bemessen + Position halten
    window.addEventListener('resize', ()=>{
      const wasTransition = track.style.transition;
      sizeSlides();
      disableTransition();
      render();
      void track.offsetWidth;
      track.style.transition = wasTransition;
    });
  }
})();

/* ===== NEU: Bild-Lazy-Loader + Adjacent-Preload + Idle-Warming ===== */
(function(){
  // ---- Utilities ----
  function onLoad(img){
    img.classList.remove('lazy');
    img.classList.add('is-loaded');
    img.removeAttribute('data-src');
    img.removeAttribute('data-srcset');
    img.removeAttribute('data-sizes');
  }

  function reveal(img){
    // <picture>: data-srcset/sizes auf <source> ist optional – wir unterstützen data-Attr. auf <img> selbst
    if (img.dataset.srcset){
      if (!img.hasAttribute('fetchpriority')) img.setAttribute('fetchpriority', 'low');
      img.srcset = img.dataset.srcset;
      if (img.dataset.sizes) img.sizes = img.dataset.sizes;
    }
    if (img.dataset.src){
      if (!img.hasAttribute('fetchpriority')) img.setAttribute('fetchpriority', 'low');
      img.src = img.dataset.src;
    }
    if (img.complete) onLoad(img);
  }

  // ---- Bilder einsammeln ----
  const allLazy = new Set(document.querySelectorAll('img[data-src], img[data-srcset]'));
  if (!allLazy.size) return;

  // ---- Lade-Queue (damit nichts verhungert) ----
  const queue = [];
  let inFlight = 0;
  const MAX_CONCURRENCY = 3;

  function enqueue(img){
    // Schon geladen/gestartet?
    if (!(img.dataset && (img.dataset.src || img.dataset.srcset))) return;
    // Doppelte vermeiden
    if (queue.includes(img)) return;
    queue.push(img);
    pump();
  }

  function pump(){
    while (inFlight < MAX_CONCURRENCY && queue.length){
      const img = queue.shift();
      // falls zwischenzeitlich schon geladen:
      if (!(img.dataset && (img.dataset.src || img.dataset.srcset))) continue;

      inFlight++;
      const done = ()=>{ inFlight--; pump(); };
      const once = ()=>{ img.removeEventListener('load', once); img.removeEventListener('error', once); onLoad(img); done(); };
      img.addEventListener('load',  once, { once:true });
      img.addEventListener('error', once, { once:true });
      reveal(img);
    }
  }

  // ---- Haupt-Observer (früher anfangen, je nach Verbindung) ----
  const conn = (navigator.connection && navigator.connection.effectiveType) || '4g';
  const rootMarginY = (conn === '2g' || conn === 'slow-2g') ?  '200px' : '900px';
  const io = new IntersectionObserver((entries)=>{
    for (const e of entries){
      if (e.isIntersecting){
        const img = e.target;
        io.unobserve(img);
        enqueue(img);
      }
    }
  }, { root: null, rootMargin: `${rootMarginY} 0px`, threshold: 0.01 });

  // Bereits sichtbare sofort enqueuen, andere beobachten
  allLazy.forEach(img => {
    const r = img.getBoundingClientRect();
    if (r.top < window.innerHeight + 50) enqueue(img);
    else io.observe(img);
  });

  // ---- Adjacent-Preload: Slider meldet nächste Bilder -> wir enqueuen sie ----
  document.querySelectorAll('.slider').forEach(slider => {
    // wenn Slider sichtbar wird, minimale Vorwärmung aller Galerien
    const sliderIO = new IntersectionObserver((ents)=>{
      for (const e of ents){
        if (!e.isIntersecting) continue;
        sliderIO.unobserve(slider);
        // gute Verbindungen: 2 Bilder, sonst 1
        const warmCount = (conn === '4g') ? 2 : 1;
        // nimm die ersten lazy-Bilder in der Galerie
        const imgs = slider.querySelectorAll('.slides .slide img');
        let warmed = 0;
        for (const im of imgs){
          if (im.dataset && (im.dataset.src || im.dataset.srcset)){
            enqueue(im);
            if (++warmed >= warmCount) break;
          }
        }
      }
    }, { root: null, rootMargin: '0px', threshold: 0.25 });
    sliderIO.observe(slider);

    // Reagiere auf Wechsel/Navigation (Event kommt aus dem Slider oben)
    slider.addEventListener('slider:prime', (ev)=>{
      const nextImgs = ev.detail && ev.detail.next || [];
      // lade next/next+1 vor
      nextImgs.forEach(im => enqueue(im));
    });
  });

  // ---- Idle-Warming: je OFFSCREEN-Galerie mindestens das erste Bild vorziehen ----
  function warmOffscreenGalleries(){
    document.querySelectorAll('.slider').forEach(sl=>{
      const rect = sl.getBoundingClientRect();
      const offscreen = rect.top > window.innerHeight * 1.3;
      if (!offscreen) return;
      const firstLazy = sl.querySelector('.slides img[data-src], .slides img[data-srcset]');
      if (firstLazy) enqueue(firstLazy);
    });
  }
  if ('requestIdleCallback' in window){
    requestIdleCallback(warmOffscreenGalleries, { timeout: 2500 });
  } else {
    setTimeout(warmOffscreenGalleries, 1800);
  }
})();

// ===== Ausrichtung: Oberkante ERSTER BLOCK = Oberkante "01 FREE PROJECTS" =====
// ===== Erster Caption-Block: Abstand analog Brand ↔ "01 FREE PROJECTS" =====
(function(){
  function findFirstCaptionAfter(el){
    let n = el ? el.nextElementSibling : null;
    while(n){
      if(n.classList.contains('media') && (n.querySelector('.caption-title') || n.querySelector('.prose'))) return n;
      n = n.nextElementSibling;
    }
    return null;
  }

  function align(){
    const content = document.querySelector('.content');
    const hero    = document.querySelector('.content .project-hero'); // erste Sektion (Galerie/Triple)
    const anchor  = document.querySelector('.nav a[href$="01_free_projects.html"]')
                 || document.querySelector('.nav a:first-child');
    const brand   = document.querySelector('.brand');
    const caption = findFirstCaptionAfter(hero);

    if(!content || !anchor) return;

    const c = content.getBoundingClientRect();
    const a = anchor.getBoundingClientRect();

    // 1) Oberkante erster Block = Oberkante "01 FREE PROJECTS"
    if (hero){
      const offsetTop = Math.max(0, Math.round(a.top - c.top));
      hero.style.marginTop = offsetTop + 'px';
    }

    // 2) Erster Caption-Block: Abstand analog Brand ↔ "01 FREE PROJECTS"
    if (brand && caption){
      const b = brand.getBoundingClientRect();
      const spacing = Math.max(0, Math.round(a.top - b.bottom));
      caption.style.marginTop = spacing + 'px';
    }
  }

  window.addEventListener('load', align);
  window.addEventListener('resize', align);
})();

// ===== Video-Autoplay (muted, loop) =====
(function(){
  const players = document.querySelectorAll('.video-player');
  players.forEach(v=>{
    v.muted = true;
    v.playsInline = true;
    v.autoplay = true;
    v.loop = true;
    const p = v.play();
    if (p && typeof p.catch === 'function') p.catch(()=>{ /* ignorieren */ });
  });
})();

/* ===== LANDING: X-Ray + ZWEI Bälle (Kanten-Bounce, gegenseitige Kollision, leicht schräg) ===== */
(function () {
  const b1 = document.getElementById('ball1');
  const b2 = document.getElementById('ball2');
  const xr = document.querySelector('.xr');
  const rect = document.getElementById('xrRect');
  const c1 = document.getElementById('xrCircle1');
  const c2 = document.getElementById('xrCircle2');
  const titleBase = document.querySelector('.xr-title.xr-base');
  if (!b1 || !b2 || !xr || !rect || !c1 || !c2 || !titleBase) return;

  // ---- Headline-Fit: ~50vw * 1/6 größer ----
  function fitHeadline(){
    const targetW = Math.max(320, window.innerWidth * 0.5);
    const len = titleBase.getComputedTextLength();
    if (len > 0){
      const cur = parseFloat(getComputedStyle(titleBase).fontSize) || 100;
      const next = Math.max(24, Math.min(200, cur * (targetW/len) * 1.1667));
      xr.style.setProperty('--xr-font-size', next + 'px');
    }
  }

  // ---- Maske = Viewport in Pixel ----
  function sizeMask(){
    const vw = window.innerWidth, vh = window.innerHeight;
    xr.setAttribute('width',  String(vw));
    xr.setAttribute('height', String(vh));
    xr.setAttribute('viewBox', `0 0 ${vw} ${vh}`);
    rect.setAttribute('width',  String(vw));
    rect.setAttribute('height', String(vh));
    fitHeadline();
  }
  sizeMask();
  window.addEventListener('resize', sizeMask, { passive:true });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitHeadline);

  // ---- Ball-Setup ----
  const balls = [
    { el:b1, cx:0, cy:0, r:0, vx:0, vy:0, speed:0 },
    { el:b2, cx:0, cy:0, r:0, vx:0, vy:0, speed:0 },
  ];

  function initBall(b, preferRight=false){
    const s = b.el.getBoundingClientRect().width;
    b.r = s/2;
    const vw = window.innerWidth, vh = window.innerHeight;
    // Startposition: getrennt platzieren
    b.cx = (preferRight ? (vw*0.6 + Math.random()*vw*0.35) : (Math.random()*vw*0.35 + vw*0.05));
    b.cy = (vh*0.2 + Math.random()*vh*0.6);

    // Geschwindigkeit: 10% schneller als der vorletzte Stand (wir behalten 455–784 -> +10% = 501–862)
    const SPEED_MIN = 501, SPEED_MAX = 862;
    b.speed = SPEED_MIN + Math.random()*(SPEED_MAX - SPEED_MIN);

    // immer leicht schräg (nie exakt 0/90)
    const deg = d => d * Math.PI/180;
    const bases = [45,135,225,315];
    const base = bases[(Math.random()*bases.length)|0];
    const ang = deg(base + (Math.random()*16 - 8)); // ±8°
    b.vx = Math.cos(ang) * b.speed;
    b.vy = Math.sin(ang) * b.speed;
  }

  initBall(balls[0], false);
  initBall(balls[1], true);

  // Falls Start-Overlap: schieben
  function separateIfOverlapping(){
    const a = balls[0], b = balls[1];
    const dx = b.cx - a.cx, dy = b.cy - a.cy;
    const dist = Math.hypot(dx, dy);
    const minDist = a.r + b.r + 2;
    if (dist < minDist){
      const nx = dx / (dist || 1), ny = dy / (dist || 1);
      const overlap = (minDist - dist) / 2;
      a.cx -= nx * overlap; a.cy -= ny * overlap;
      b.cx += nx * overlap; b.cy += ny * overlap;
    }
  }
  separateIfOverlapping();

  // Wand-Bounce
  function bounceWalls(b){
    const vw = window.innerWidth, vh = window.innerHeight;
    const minX = b.r, maxX = vw - b.r;
    const minY = b.r, maxY = vh - b.r;

    if (b.cx <= minX){ b.cx = minX; b.vx = Math.abs(b.vx); }
    if (b.cx >= maxX){ b.cx = maxX; b.vx = -Math.abs(b.vx); }
    if (b.cy <= minY){ b.cy = minY; b.vy = Math.abs(b.vy); }
    if (b.cy >= maxY){ b.cy = maxY; b.vy = -Math.abs(b.vy); }

    // kleiner Jitter gegen perfekte Geraden
    const deg = d=>d*Math.PI/180;
    const jitter = deg((Math.random()*6 - 3));
    const sp = Math.hypot(b.vx, b.vy) || 1;
    const ang = Math.atan2(b.vy, b.vx) + jitter;
    b.vx = Math.cos(ang)*sp; b.vy = Math.sin(ang)*sp;
  }

  // Elastische Kollision (gleiche Masse)
  function collide(a,b){
    const dx = b.cx - a.cx, dy = b.cy - a.cy;
    const dist = Math.hypot(dx, dy);
    const minDist = a.r + b.r;
    if (dist === 0 || dist > minDist) return;

    const nx = dx / dist, ny = dy / dist;           // Normal
    const tx = -ny, ty = nx;                         // Tangente

    // Geschwindigkeiten zerlegen
    const vA_n = a.vx*nx + a.vy*ny;
    const vA_t = a.vx*tx + a.vy*ty;
    const vB_n = b.vx*nx + b.vy*ny;
    const vB_t = b.vx*tx + b.vy*ty;

    // gleiche Masse: Normalanteile tauschen, Tangente bleibt
    const vA_n_after = vB_n;
    const vB_n_after = vA_n;

    a.vx = vA_n_after*nx + vA_t*tx;
    a.vy = vA_n_after*ny + vA_t*ty;
    b.vx = vB_n_after*nx + vB_t*tx;
    b.vy = vB_n_after*ny + vB_t*ty;

    // sanft entflechten (direkt auf Kontakt schieben)
    const overlap = (minDist - dist) / 2 + 0.5;
    a.cx -= nx * overlap; a.cy -= ny * overlap;
    b.cx += nx * overlap; b.cy += ny * overlap;
  }

  // Resize-Handling
  function onResize(){
    const vw = window.innerWidth, vh = window.innerHeight;
    xr.setAttribute('width',  String(vw));
    xr.setAttribute('height', String(vh));
    rect.setAttribute('width',  String(vw));
    rect.setAttribute('height', String(vh));
    balls.forEach(b=>{
      b.r = b.el.getBoundingClientRect().width/2;
      b.cx = Math.min(Math.max(b.r, b.cx), vw - b.r);
      b.cy = Math.min(Math.max(b.r, b.cy), vh - b.r);
    });
  }
  window.addEventListener('resize', onResize, { passive:true });

  // Anfangsradius in Maske setzen
  c1.setAttribute('r', String(balls[0].r));
  c2.setAttribute('r', String(balls[1].r));

  let last = performance.now();
  function animate(now){
    const dt = (now - last) / 1000; last = now;

    balls.forEach(b=>{
      b.cx += b.vx * dt;
      b.cy += b.vy * dt;
      bounceWalls(b);
    });

    collide(balls[0], balls[1]);

    // sichtbare Bälle setzen
    b1.style.transform = `translate3d(${balls[0].cx - balls[0].r}px, ${balls[0].cy - balls[0].r}px, 0)`;
    b2.style.transform = `translate3d(${balls[1].cx - balls[1].r}px, ${balls[1].cy - balls[1].r}px, 0)`;

    // X-Ray Kreise folgen (in Pixel)
    c1.setAttribute('cx', String(balls[0].cx));
    c1.setAttribute('cy', String(balls[0].cy));
    c2.setAttribute('cx', String(balls[1].cx));
    c2.setAttribute('cy', String(balls[1].cy));

    requestAnimationFrame(animate);
  }

  // Initiale Position anwenden
  b1.style.transform = `translate3d(${balls[0].cx - balls[0].r}px, ${balls[0].cy - balls[0].r}px, 0)`;
  b2.style.transform = `translate3d(${balls[1].cx - balls[1].r}px, ${balls[1].cy - balls[1].r}px, 0)`;
  requestAnimationFrame(animate);
})();

/* ===== ABOUT: Ball bounct an Navi & About-Text — ohne Layout-Änderungen ===== */
(function(){
  if (!document.body.classList.contains('page-about')) return;
  const ball = document.getElementById('aboutBall');
  if (!ball) return;

  // Viewport & Ball
  let vw = window.innerWidth, vh = window.innerHeight;
  const R = () => ball.getBoundingClientRect().width / 2;

  // Start random (überall, auch im Weißraum unter der Sidebar erlaubt)
  let cx = Math.random() * (vw - 2*R()) + R();
  let cy = Math.random() * (vh - 2*R()) + R();

  // Bewegung: nie exakt horizontal/vertikal
  const deg = d => d*Math.PI/180;
  const speed = 560 + Math.random()*180; // angenehm flott
  const base = [45,135,225,315][(Math.random()*4)|0] + (Math.random()*16 - 8);
  let ang = deg(base);

  // Nur echte Textzeilen als Hindernisse (keine leere Sidebarfläche)
  const TARGETS = [
    '.sidebar .brand span', '.sidebar .nav a',
    '.about-grid .caption-title', '.about-grid .prose',
    '.about-text .prose'
  ];
  let rects = [];
  const clamp = (v,min,max)=> Math.max(min, Math.min(max, v));

  function snapshotRects(){
    rects = [];
    document.querySelectorAll(TARGETS.join(',')).forEach(el=>{
      // pro Zeile ein enges Rechteck (keine großen Container!)
      for (const b of el.getClientRects()){
        if (b.width > 6 && b.height > 6){
          rects.push({left:b.left, top:b.top, right:b.right, bottom:b.bottom});
        }
      }
    });
  }

  function resize(){
    vw = window.innerWidth; vh = window.innerHeight;
    const r = R();
    cx = clamp(cx, r, vw - r);
    cy = clamp(cy, r, vh - r);
    snapshotRects();
  }
  window.addEventListener('resize', resize, {passive:true});
  window.addEventListener('scroll', snapshotRects, {passive:true});
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(snapshotRects);
  snapshotRects();

  function bounceWalls(){
    const r = R();
    let hit = false;
    if (cx <= r){ cx = r; ang = Math.PI - ang; hit = true; }
    if (cx >= vw - r){ cx = vw - r; ang = Math.PI - ang; hit = true; }
    if (cy <= r){ cy = r; ang = -ang; hit = true; }
    if (cy >= vh - r){ cy = vh - r; ang = -ang; hit = true; }
    if (hit){ ang += deg((Math.random()*10 - 5)); } // kleiner Jitter
  }

  function collideText(){
    const r = R();
    for (const b of rects){
      // nächster Punkt der Box zum Kreismittelpunkt
      const px = clamp(cx, b.left, b.right);
      const py = clamp(cy, b.top,  b.bottom);
      const dx = cx - px, dy = cy - py;
      if (dx*dx + dy*dy <= r*r){
        // Normalvektor bestimmen
        let nx, ny;
        if (cx > b.left && cx < b.right && cy > b.top && cy < b.bottom){
          // Mittelpunkt in der Box: nach außen entlang kleinster Penetration
          const left   = Math.abs(cx - b.left);
          const right  = Math.abs(b.right - cx);
          const top    = Math.abs(cy - b.top);
          const bottom = Math.abs(b.bottom - cy);
          const m = Math.min(left,right,top,bottom);
          if (m===left)   { nx=-1; ny=0;  cx=b.left  - r - .5; }
          else if (m===right){ nx=1; ny=0;  cx=b.right + r + .5; }
          else if (m===top){ nx=0; ny=-1; cy=b.top   - r - .5; }
          else             { nx=0; ny=1;  cy=b.bottom+ r + .5; }
        } else {
          const d = Math.max(0.0001, Math.hypot(dx,dy));
          nx = dx/d; ny = dy/d;
          // leicht aus der Box heraus schieben
          cx = px + nx*(r + .5);
          cy = py + ny*(r + .5);
        }
        // Reflexion v' = v - 2(v·n)n
        const vx = Math.cos(ang)*speed, vy = Math.sin(ang)*speed;
        const dot = vx*nx + vy*ny;
        const rx = vx - 2*dot*nx, ry = vy - 2*dot*ny;
        ang = Math.atan2(ry, rx) + deg((Math.random()*8 - 4)); // nie perfekt gerade
        return; // eine Kollision pro Frame reicht
      }
    }
  }

  let last = performance.now();
  function tick(now){
    const dt = (now - last)/1000; last = now;
    cx += Math.cos(ang)*speed*dt;
    cy += Math.sin(ang)*speed*dt;

    bounceWalls();
    collideText();

    const r = R();
    ball.style.transform = `translate3d(${cx - r}px, ${cy - r}px, 0)`;
    requestAnimationFrame(tick);
  }

  // Start (keine Layout-Änderung!)
  ball.style.transform = `translate3d(${cx - R()}px, ${cy - R()}px, 0)`;
  requestAnimationFrame(tick);
})();

/* ===== ABOUT: exakt auf Höhe "01 FREE PROJECTS" ausrichten ===== */
(function alignAboutToNav(){
  if (!document.body.classList.contains('page-about')) return;

  const content = document.querySelector('.content');
  const hero    = document.querySelector('.content .project-hero.about'); // dein erster About-Block
  const anchor  = document.querySelector('.nav a[href$="01_free_projects.html"]')
                || document.querySelector('.nav a:first-child');

  if (!content || !hero || !anchor) return;

  function apply(){
    // Positionen im Dokument (nicht nur im Viewport)
    const contentTop = content.getBoundingClientRect().top + window.scrollY;
    const anchorTop  = anchor.getBoundingClientRect().top  + window.scrollY;

    const offset = Math.max(0, Math.round(anchorTop - contentTop));
    hero.style.marginTop = offset + 'px';
  }

  // initial + bei Resizes + nach Font-Laden (weil Aileron metrisch leicht schiebt)
  apply();
  window.addEventListener('resize', apply);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(apply);
})();
/* ===== ABOUT: exakt an "01 FREE PROJECTS" ausrichten (robust) ===== */
(function fixAboutAlign(){
  if (!document.body.classList.contains('page-about')) return;

  // 1) Ziele finden
  const content = document.querySelector('.content');
  // dein erster About-Block:
  const hero = document.querySelector('.content .project-hero.about')
             || document.querySelector('.content .project-hero');
  // der Referenz-Link in der Sidebar:
  const anchor = document.querySelector('.nav a[href$="01_free_projects.html"]')
               || document.querySelector('.nav a:first-child');

  if (!content || !hero || !anchor) return;

  // 2) Mess-/Apply-Funktion
  function apply() {
    // absolute Dokument-Koordinaten vermeiden Viewport-Scroll-Effekte
    const contentTop = content.getBoundingClientRect().top + window.scrollY;
    const anchorTop  = anchor.getBoundingClientRect().top  + window.scrollY;

    const offset = Math.max(0, Math.round(anchorTop - contentTop));
    // inline Style gewinnt zuverlässig gegen generische CSS-Regeln
    hero.style.marginTop = offset + 'px';
  }

  // 3) Stabil machen: mehrfach anwenden, wenn sich Schriften/Größen setzen
  function applyStable(){
    apply();
    // einmal in der nächsten Frame – falls die Sidebar noch reflowt
    requestAnimationFrame(apply);
    // und ganz kurz später noch einmal (Font-Metrics etc.)
    setTimeout(apply, 50);
  }

  // 4) Events/Observer
  window.addEventListener('load', applyStable);
  window.addEventListener('resize', applyStable);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(applyStable);

  // Änderungen an Sidebar/Navi oder Content beobachten
  const ro = new ResizeObserver(applyStable);
  const sidebar = document.querySelector('.sidebar');
  if (sidebar) ro.observe(sidebar);
  ro.observe(content);
  ro.observe(anchor);

  // initial
  applyStable();
})();
/* ===== ABOUT: Exakte Höhe wie "01 FREE PROJECTS" via CSS-Variable (ohne Margin-Collapsing) ===== */
(function alignAboutStable(){
  if (!document.body.classList.contains('page-about')) return;

  const content = document.querySelector('.content');
  const hero    = document.querySelector('.content .project-hero.about');
  const anchor  = document.querySelector('.nav a[href$="01_free_projects.html"]')
                || document.querySelector('.nav a:first-child');

  if (!content || !hero || !anchor) return;

  function apply(){
    // absolute Dokumentkoordinaten verhindern Scroll-Einfluss
    const contentTop = content.getBoundingClientRect().top + window.scrollY;
    const anchorTop  = anchor.getBoundingClientRect().top  + window.scrollY;
    const offset     = Math.max(0, Math.round(anchorTop - contentTop));

    // 1) KEIN margin-top mehr: wir nutzen top + CSS-Variable
    hero.style.marginTop = '0px';
    hero.style.setProperty('--about-offset', offset + 'px');
  }

  function applyStable(){
    apply();
    requestAnimationFrame(apply);
    setTimeout(apply, 50);
  }

  // reagieren auf Layout-/Font-Änderungen
  window.addEventListener('load', applyStable);
  window.addEventListener('resize', applyStable);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(applyStable);

  // falls Sidebar/Content sich noch reflowen
  const ro = new ResizeObserver(applyStable);
  const sidebar = document.querySelector('.sidebar');
  if (sidebar) ro.observe(sidebar);
  ro.observe(content);

  applyStable();
})();
