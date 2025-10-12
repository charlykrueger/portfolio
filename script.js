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

    // Render + initial position ohne Animation
    function render(){ track.style.transform = `translate3d(${-index*100}%,0,0)`; }
    disableTransition(); render();
    void track.offsetWidth; // Reflow
    enableTransition();

    // Navigation (Blocken während Transition/Adjust)
    function goTo(newIndex){
      if (isTransitioning || isAdjusting) return;
      isTransitioning = true;
      index = newIndex;
      enableTransition();
      render();
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

    // Resize: Position beibehalten (kein Sprung)
    window.addEventListener('resize', ()=>{
      const wasTransition = track.style.transition;
      disableTransition();
      render();
      void track.offsetWidth;
      track.style.transition = wasTransition;
    });
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
