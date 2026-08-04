/* ═══════════════════════════════════════════════════════════════
   wanxiang_mirror — Ink Rings Canvas & Scroll Interactions
   ═══════════════════════════════════════════════════════════════ */

// ─── Module: Ink Rings Canvas Engine ───
const InkRings = (() => {
  'use strict';

  const TAU = Math.PI * 2;
  const canvas = document.getElementById('c');
  if (!canvas) return { init() {} };

  const ctx = canvas.getContext('2d');

  let W = 1, H = 1, DPR = 1;
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  /* ─── Palette ─── */
  const PALETTE = {
    top: '#121008', bg: '#070604', bg2: '#020201',
    rgb: [232, 217, 160], mark: [250, 244, 220],
    units: {
      outer: { base: [232, 176, 88], spectrum: [[200, 140, 60], [232, 176, 88], [255, 210, 130], [255, 235, 180]] },
      mid:   { base: [184, 115, 51], spectrum: [[150, 90, 40],  [184, 115, 51], [210, 150, 90],  [235, 190, 140]] },
      inner: { base: [212, 165, 116], spectrum: [[180, 130, 80], [212, 165, 116], [235, 200, 160], [255, 230, 200]] }
    }
  };

  const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const clamp01 = (t) => t < 0 ? 0 : t > 1 ? 1 : t;
  const lerp = (a, b, t) => a + (b - a) * t;
  const lerpRgb = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

  const spectrumAt = (stops, t) => {
    if (!stops?.length) return [200, 200, 200];
    if (stops.length === 1) return [...stops[0]];
    const x = clamp01(t) * (stops.length - 1), i = Math.floor(x), f = x - i;
    if (i >= stops.length - 1) return [...stops[stops.length - 1]];
    return lerpRgb(stops[i], stops[i + 1], f);
  };

  const rgbToHsl = (r, g, b) => {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0; const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) { case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break; case g: h = ((b - r) / d + 2) / 6; break; default: h = ((r - g) / d + 4) / 6; break; }
    }
    return [h * 360, s, l];
  };

  const hue2rgb = (p, q, t) => { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1/6) return p + (q-p)*6*t; if (t < 1/2) return q; if (t < 2/3) return p + (q-p)*(2/3-t)*6; return p; };
  const hslToRgb = (h, s, l) => { h = ((h%360)+360)%360/360; if (s===0) return [l*255,l*255,l*255]; const q = l<0.5 ? l*(1+s) : l+s-l*s, p = 2*l-q; return [hue2rgb(p,q,h+1/3)*255, hue2rgb(p,q,h)*255, hue2rgb(p,q,h-1/3)*255]; };
  const shiftHue = (rgb, deg, satBoost = 1, lightBoost = 0) => { const hsl = rgbToHsl(rgb[0], rgb[1], rgb[2]); return hslToRgb(hsl[0]+deg, clamp01(hsl[1]*satBoost), clamp01(hsl[2]+lightBoost)); };
  const inkRgba = (rgb, a) => `rgba(${Math.round(rgb[0])},${Math.round(rgb[1])},${Math.round(rgb[2])},${a})`;
  const unitBase = (u) => u.base ?? u;

  const ringRgb = (p, name, index, max) => {
    const u = p.units[name], t = max <= 1 ? 0.5 : index / Math.max(1, max - 1);
    const wobble = (hash(index * 17.3 + name.length * 9.1) - 0.5) * 0.08;
    return spectrumAt(u.spectrum, clamp01(t + wobble));
  };

  const makeRingInk = (p, name, index, max) => { const base = ringRgb(p, name, index, max); return (a, angle) => { if (angle == null) return inkRgba(base, a); const shimmer = Math.sin(angle*3.2+index*0.7)*22 + Math.cos(angle*5.1+index)*12, lit = Math.sin(angle*2+index*1.3)*0.04; return inkRgba(shiftHue(base, shimmer, 1.08, lit), a); }; };
  const makeRingMark = (p, name, index, max) => { const base = ringRgb(p, name, index, max), mark = shiftHue(base, 18, 0.85, 0.18), pearl = lerpRgb(mark, p.mark, 0.45); return (a, angle) => { if (angle == null) return inkRgba(pearl, a); const shimmer = Math.sin(angle*4.1+index)*28; return inkRgba(shiftHue(pearl, shimmer, 1.05, 0.06), a); }; };

  const ringSpec = (unit, index, max) => { const seed = hash(unit*97+index*13.7+0.31), seed2 = hash(unit*41+index*19.3+2.17); return { unit, index, seed, ecc: 0.92+seed*0.12, wobble: (seed2-0.5)*0.035, spinRate: (0.04+seed*0.11)*(seed2>0.5?1:-1)*(1+index/(max+4)), phase0: seed*TAU, dashGap: 0.12+seed*0.35, dashLen: 0.35+seed2*0.55, blotCount: 2+Math.floor(seed*5), thickness: 0.55+seed2*0.9 }; };

  const BAND_RANGES = { outer: {inner:0.34, outer:0.46}, mid: {inner:0.2, outer:0.325}, inner: {inner:0.075, outer:0.185} };
  const bandRadii = (band, count, u) => { const r = BAND_RANGES[band]; const out = []; for (let i=0; i<count; i++) { const t = count===1 ? 0.5 : i/(count-1); out.push((r.inner+(r.outer-r.inner)*t)*u); } return out; };

  const drawLogogramRing = (c, cx, cy, radius, spec, color, mark, epoch) => {
    const spin = reducedMotion ? spec.phase0 : spec.phase0 + epoch * spec.spinRate;
    const rx = radius, ry = radius * spec.ecc, blotSteps = reducedMotion ? 0 : spec.blotCount;
    c.save(); c.translate(cx, cy); c.rotate(spin); c.rotate(spec.wobble);
    c.beginPath(); c.ellipse(0, 0, rx, ry, 0, 0, TAU); c.strokeStyle = color(0.14, 0); c.lineWidth = Math.max(2.8, radius*0.022); c.stroke();
    c.lineCap = 'round'; c.lineJoin = 'round';
    let a = 0;
    while (a < TAU - 0.02) {
      const len = spec.dashLen * (0.7 + hash(spec.seed + a*8)*0.6), gap = spec.dashGap * (0.45 + hash(spec.seed + a*11)*0.75);
      const a1 = Math.min(TAU, a + len), midA = (a + a1) * 0.5;
      c.beginPath(); c.ellipse(0,0,rx,ry,0,a,a1); c.strokeStyle = color(0.44+hash(spec.seed+a)*0.36, midA); c.lineWidth = Math.max(1.1, radius*0.0065*spec.thickness); c.stroke();
      if (hash(spec.seed*3+a) > 0.55) { const cos=Math.cos(midA), sin=Math.sin(midA), inward=1-(0.014+hash(midA)*0.024), outward=1+(0.01+hash(midA+1)*0.022); c.beginPath(); c.moveTo(cos*rx*inward, sin*ry*inward); c.lineTo(cos*rx*outward, sin*ry*outward); c.strokeStyle = color(0.68, midA); c.lineWidth = Math.max(0.9, radius*0.005); c.stroke(); }
      a = a1 + gap;
    }
    for (let b=0; b<blotSteps; b++) { const ba=(spec.phase0+b/Math.max(1,blotSteps)*TAU+hash(spec.index+b)*0.4)%TAU, bx=Math.cos(ba)*rx, by=Math.sin(ba)*ry, br=Math.max(1.1,radius*(0.008+hash(spec.seed+b)*0.014)); c.fillStyle=mark(0.5+hash(b+spec.seed)*0.35, ba); c.beginPath(); c.arc(bx,by,br,0,TAU); c.fill(); c.strokeStyle=color(0.72,ba); c.lineWidth=0.9; c.beginPath(); c.arc(bx,by,br*1.4,0.2,Math.PI*1.4); c.stroke(); }
    if (!reducedMotion) { const lead=(epoch*spec.spinRate*1.7+spec.phase0)%TAU; c.beginPath(); c.ellipse(0,0,rx,ry,0,lead,lead+0.7); c.strokeStyle=color(0.9,lead+0.35); c.lineWidth=Math.max(1.6,radius*0.009); c.stroke(); c.beginPath(); c.ellipse(0,0,rx,ry,0,lead+0.15,lead+0.45); c.strokeStyle=mark(0.62,lead+0.3); c.lineWidth=Math.max(0.8,radius*0.004); c.stroke(); c.beginPath(); c.ellipse(0,0,rx,ry,0,lead-0.55,lead); c.strokeStyle=color(0.28,lead-0.25); c.lineWidth=Math.max(1.0,radius*0.005); c.stroke(); }
    c.restore();
  };

  const drawNucleus = (c, cx, cy, u, epoch) => { const p=PALETTE, outerInk=unitBase(p.units.outer), midInk=unitBase(p.units.mid), innerInk=unitBase(p.units.inner); c.save(); const R=u*0.055, field=c.createRadialGradient(cx,cy,0,cx,cy,R*2.8); field.addColorStop(0,inkRgba(innerInk, reducedMotion?0.32:0.42)); field.addColorStop(0.35,inkRgba(midInk,0.16)); field.addColorStop(0.7,inkRgba(outerInk,0.08)); field.addColorStop(1,inkRgba(outerInk,0)); c.fillStyle=field; c.beginPath(); c.arc(cx,cy,R*2.8,0,TAU); c.fill(); const spin=reducedMotion?0:epoch*0.15, cores=[outerInk,midInk,innerInk]; for (let i=0;i<3;i++){const rr=R*(0.35+i*0.28),tint=shiftHue(cores[i],reducedMotion?0:epoch*(8+i*4),1.1,0.05);c.save();c.translate(cx,cy);c.rotate(spin*(i%2?-1:1)+i);c.beginPath();c.ellipse(0,0,rr,rr*0.9,0,0.2,TAU-0.4);c.strokeStyle=inkRgba(tint,0.5+i*0.16);c.lineWidth=1.4+i*0.4;c.stroke();c.restore();} c.fillStyle=inkRgba(p.mark,0.95); c.beginPath(); c.arc(cx,cy,Math.max(2,u*0.008),0,TAU); c.fill(); c.restore(); };

  const drawSpectrumBand = (c, cx, cy, inner, outer, spectrum, alpha) => { const mid=(inner+outer)*0.5, width=Math.max(10,(outer-inner)*0.95), stops=spectrum?.length?spectrum:[[180,180,180]]; c.beginPath(); c.arc(cx,cy,mid,0,TAU); if (typeof c.createConicGradient==='function'){const grad=c.createConicGradient(0,cx,cy),last=stops.length-1;for(let i=0;i<=last;i++)grad.addColorStop(last===0?0:i/last,inkRgba(stops[i],alpha));if(last>0)grad.addColorStop(1,inkRgba(stops[0],alpha));c.strokeStyle=grad;}else{c.strokeStyle=inkRgba(stops[Math.floor(stops.length/2)],alpha);} c.lineWidth=width; c.stroke(); };

  const resize = () => { const r=canvas.parentElement.getBoundingClientRect(); W=Math.max(1,Math.round(r.width)); H=Math.max(1,Math.round(r.height)); DPR=Math.min(window.devicePixelRatio||1,2); canvas.width=Math.round(W*DPR); canvas.height=Math.round(H*DPR); ctx.setTransform(DPR,0,0,DPR,0,0); };

  const OUTER_COUNT=8, MID_COUNT=12, INNER_COUNT=6;
  const draw = (epoch) => { ctx.clearRect(0,0,W,H); const p=PALETTE, u=Math.min(W,H), cx=W/2, cy=H/2, outerU=unitBase(p.units.outer), midU=unitBase(p.units.mid), innerU=unitBase(p.units.inner); const ground=ctx.createRadialGradient(cx,cy*0.2,0,cx,cy,Math.max(W,H)*0.75); ground.addColorStop(0,p.top); ground.addColorStop(0.55,p.bg); ground.addColorStop(1,p.bg2); ctx.fillStyle=ground; ctx.fillRect(0,0,W,H); const glow=ctx.createRadialGradient(cx,cy,0,cx,cy,u*0.52); glow.addColorStop(0,inkRgba(innerU,reducedMotion?0.12:0.18)); glow.addColorStop(0.35,inkRgba(midU,0.08)); glow.addColorStop(0.65,inkRgba(outerU,0.05)); glow.addColorStop(1,inkRgba(outerU,0)); ctx.fillStyle=glow; ctx.beginPath(); ctx.arc(cx,cy,u*0.52,0,TAU); ctx.fill(); drawSpectrumBand(ctx,cx,cy,u*0.34,u*0.46,p.units.outer.spectrum,0.09); drawSpectrumBand(ctx,cx,cy,u*0.2,u*0.325,p.units.mid.spectrum,0.09); drawSpectrumBand(ctx,cx,cy,u*0.075,u*0.185,p.units.inner.spectrum,0.1); const outerRadii=bandRadii('outer',OUTER_COUNT,u), midRadii=bandRadii('mid',MID_COUNT,u), innerRadii=bandRadii('inner',INNER_COUNT,u); for(let i=0;i<outerRadii.length;i++){const spec=ringSpec(1,i,OUTER_COUNT),ink=makeRingInk(p,'outer',i,OUTER_COUNT),mark=makeRingMark(p,'outer',i,OUTER_COUNT); drawLogogramRing(ctx,cx,cy,outerRadii[i],spec,ink,mark,epoch);} for(let i=0;i<midRadii.length;i++){const spec=ringSpec(2,i,MID_COUNT),ink=makeRingInk(p,'mid',i,MID_COUNT),mark=makeRingMark(p,'mid',i,MID_COUNT); drawLogogramRing(ctx,cx,cy,midRadii[i],spec,ink,mark,epoch);} for(let i=0;i<innerRadii.length;i++){const spec=ringSpec(3,i,INNER_COUNT),ink=makeRingInk(p,'inner',i,INNER_COUNT),mark=makeRingMark(p,'inner',i,INNER_COUNT); drawLogogramRing(ctx,cx,cy,innerRadii[i],spec,ink,mark,epoch);} drawNucleus(ctx,cx,cy,u,epoch); ctx.lineWidth=1.2; ctx.setLineDash([3,7]); [{frac:0.185,rgb:innerU},{frac:0.325,rgb:midU},{frac:0.46,rgb:outerU}].forEach(sep=>{ctx.strokeStyle=inkRgba(sep.rgb,0.28);ctx.beginPath();ctx.arc(cx,cy,u*sep.frac,0,TAU);ctx.stroke();}); ctx.setLineDash([]); };

  let raf = null, lastLoop = 0;
  const loop = (time) => { if (!reducedMotion || time - lastLoop >= 66) { lastLoop = time; draw(time / 1000); } raf = requestAnimationFrame(loop); };
  const init = () => { window.addEventListener('resize', resize); resize(); raf = requestAnimationFrame(loop); };
  const destroy = () => { if (raf) cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };

  return { init, destroy };
})();

// ─── Module: Scroll & Reveal Interactions ───
const UIInteractions = (() => {
  'use strict';

  const navbar = document.getElementById('navbar');
  const hero = document.getElementById('hero');
  if (!navbar || !hero) return { init() {} };

  const heroBottom = hero.offsetTop + hero.offsetHeight;

  /* ─── Scroll: nav theme + scroll spy ─── */
  const onScroll = () => {
    const y = window.scrollY;
    navbar.classList.toggle('on-dark', y < heroBottom - 100);

    const sections = document.querySelectorAll('section[id], div[id]');
    const links = document.querySelectorAll('.nav-link');
    let current = '';
    sections.forEach(sec => { if (y >= sec.offsetTop - 200) current = sec.getAttribute('id'); });
    links.forEach(link => { link.classList.toggle('active', link.getAttribute('href') === `#${current}`); });
  };

  /* ─── Intersection Observer for chapter & bridge reveals ─── */
  const initObserver = () => {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => { if (entry.isIntersecting) entry.target.classList.add('visible'); });
    }, { threshold: 0.12 });

    document.querySelectorAll('.chapter, .bridge-node, .quote-text, .quote-author').forEach(el => observer.observe(el));
  };

  /* ─── Stagger delays ─── */
  const initStagger = () => {
    document.querySelectorAll('.chapter').forEach((el, i) => { el.style.transitionDelay = `${i * 0.1}s`; });
    document.querySelectorAll('.bridge-node').forEach((el, i) => { el.style.transitionDelay = `${i * 0.06}s`; });
  };

  /* ─── Smooth nav link scrolling ─── */
  const initNavScroll = () => {
    document.querySelectorAll('.nav-link, .hero-cta[href^="#"]').forEach(link => {
      link.addEventListener('click', (e) => {
        const target = document.querySelector(link.getAttribute('href'));
        if (target) { e.preventDefault(); target.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      });
    });
  };

  const init = () => {
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    initObserver();
    initStagger();
    initNavScroll();
  };

  return { init };
})();

// ─── Boot ───
document.addEventListener('DOMContentLoaded', () => {
  InkRings.init();
  UIInteractions.init();
});
