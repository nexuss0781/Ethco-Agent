import React, { useRef, useEffect, useState, useCallback } from 'react';

type Mode =
  | 'walk'
  | 'run'
  | 'jump'
  | 'sit'
  | 'erect'
  | 'eat'
  | 'sleep'
  | 'hibernate';

// ---- Character rig (SVG-local units; world px == char units) ----
const L1 = 16; // thigh
const L2 = 19; // shin
const SHOULDER_X = 13; // chest offset from hip (char +x = forward)
const GROUND_LOCAL = 95;
const SW_WALK = 0.38; // swing share of gait
const SW_RUN = 0.30;
const STRIDE = { walk: 34, run: 47 };
const SPEED = { walk: 130, run: 340 };
const ACCEL = 460;
const DECEL = 900;
const GRAV = 1300;
const GROUND_EDGE = 96;
const AIR = 26; // hover above a landed-upon element

const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const nap = (ms: number) => new Promise((r) => setTimeout(r, ms));
const clamp = (v: number, a: number, b: number) => Math.min(Math.max(v, a), b);
const toDeg = (r: number) => (r * 180) / Math.PI;

function getTargets(): DOMRect[] {
  const rects: DOMRect[] = [];
  document
    .querySelectorAll<HTMLElement>(
      '[id^="chip-prompt-"], #btn-submit-message, #chat-textarea, h1.font-serif'
    )
    .forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width > 8 && r.height > 8 && r.bottom > 0 && r.top < innerHeight) {
        rects.push(r);
      }
    });
  return rects;
}

/** 2-bone IK. Places the foot at (fx,fy) from hip (hx,hy). */
function ik(
  hx: number,
  hy: number,
  fx: number,
  fy: number,
  bend: -1 | 1
): { hipA: number; kneeA: number } {
  let dx = fx - hx;
  let dy = fy - hy;
  let d = Math.hypot(dx, dy);
  const max = L1 + L2 - 0.5;
  if (d > max) {
    dx = (dx / d) * max;
    dy = (dy / d) * max;
    d = max;
  } else if (d < Math.abs(L1 - L2) + 0.5) {
    d = Math.abs(L1 - L2) + 0.5;
  }
  const v = clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1);
  const a = Math.acos(v);
  const base = Math.atan2(dy, dx);
  const hipA = base - a * bend;
  const kx = hx + Math.cos(hipA) * L1;
  const ky = hy + Math.sin(hipA) * L1;
  const kneeA = Math.atan2(fy - ky, fx - kx);
  return { hipA, kneeA };
}

interface EthcoMascotProps {
  className?: string;
}

interface Sim {
  mode: Mode;
  x: number; // hip screen x
  y: number; // hip screen y
  vx: number;
  vy: number;
  face: 1 | -1; // char forward mapped to screen x
  p: number; // gait phase
  lhind: number; // last landed foot x (screen)
  lfront: number;
  prevHindPh: number;
  prevFrontPh: number;
  t: number;
}

export const EthcoMascot: React.FC<EthcoMascotProps> = ({ className }) => {
  const rootRef = useRef<HTMLDivElement>(null); // positioned body+legs (hip origin, no flip)
  const faceRef = useRef<HTMLDivElement>(null); // body/head/tail/carrot (flips for facing)
  const headRef = useRef<HTMLDivElement>(null);
  const earRef = useRef<HTMLDivElement>(null);
  const hindRef = useRef<SVGGElement>(null);
  const frontRef = useRef<SVGGElement>(null);
  const hindKneeRef = useRef<SVGGElement>(null);
  const frontKneeRef = useRef<SVGGElement>(null);
  const shadowRef = useRef<HTMLDivElement>(null);
  const alive = useRef(true);

  const [behavior, setBehavior] = useState<Mode>('sit');
  const [facing, setFacing] = useState<'right' | 'left'>('right');
  const [eating, setEating] = useState(false);

  const groundY = useCallback(() => innerHeight - GROUND_EDGE, []);
  const hipY = useCallback(
    (g: number) => g - (GROUND_LOCAL - 60),
    []
  );

  const s = useRef<Sim>({
    mode: 'sit',
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    face: 1,
    p: 0,
    lhind: 0,
    lfront: 0,
    prevHindPh: 0,
    prevFrontPh: 0,
    t: 0,
  });

  const cfg = useRef({
    targetX: 0,
    targetY: 0, // 0 = ground
    speed: SPEED.walk,
  });

  const setMode = useCallback((m: Mode) => {
    s.current.mode = m;
    setBehavior(m);
  }, []);

  // ---- Scene supervisor: string together realistic behaviors ----
  const supervise = useCallback(async () => {
    await nap(300);
    while (alive.current) {
      const roll = Math.random();
      if (roll < 0.26) {
        await walkTrick();
      } else if (roll < 0.44) {
        await runTrick();
      } else if (roll < 0.62 && getTargets().length) {
        await jumpToTarget();
      } else if (roll < 0.78) {
        await eatTrick();
      } else if (roll < 0.92) {
        setMode('sit');
        await nap(2400 + Math.random() * 2600);
      } else {
        setMode(Math.random() < 0.5 ? 'sleep' : 'hibernate');
        const long = s.current.mode === 'hibernate';
        await nap(long ? 9000 : 4800);
        setMode('sit');
        await nap(1600);
      }
    }
  }, []);

  const beginHustle = useCallback((dx: number, spd: number) => {
    const st = s.current;
    const face = (Math.sign(dx) || 1) as 1 | -1;
    st.face = face;
    setFacing(face === 1 ? 'right' : 'left');
    const nx = clamp(st.x + dx, 46, innerWidth - 60);
    cfg.current = { targetX: nx, targetY: 0, speed: spd };
    // initialize gait from a stand
    st.lhind = st.x;
    st.lfront = st.x + SHOULDER_X * face;
    st.p = st.face === 1 ? 0 : 0.25;
    st.prevHindPh = st.p % 1;
    st.prevFrontPh = (st.p + 0.5) % 1;
    setMode(spd > 250 ? 'run' : 'walk');
  }, []);

  const walkTrick = useCallback(async () => {
    const dx = pick([240, 380, 300, -260, -400, 330]);
    if ((s.current.x + dx < 60 || s.current.x + dx > innerWidth - 60) && Math.sign(dx) === s.current.face) {
      beginHustle(-dx, SPEED.walk);
    } else {
      beginHustle(dx, SPEED.walk);
    }
    const nx = cfg.current.targetX;
    while (s.current.mode === 'walk' && Math.abs(s.current.x - nx) > 26) {
      await nap(60);
    }
    await nap(400);
    setMode('sit');
    await nap(1500 + Math.random() * 1400);
  }, [beginHustle]);

  const runTrick = useCallback(async () => {
    const dx = pick([520, -560, 700, -640, 480]);
    beginHustle(dx, SPEED.run);
    const nx = cfg.current.targetX;
    while (s.current.mode === 'run' && Math.abs(s.current.x - nx) > 32) {
      await nap(40);
    }
    await nap(500);
    setMode('sit');
    await nap(1600 + Math.random() * 1400);
  }, [beginHustle]);

  const jumpToTarget = useCallback(async () => {
    const r = pick(getTargets());
    const st = s.current;
    const landX = clamp(r.left + r.width / 2, 50, innerWidth - 50);
    const landY = r.top - AIR - 60; // hip height above ground when hovering over element
    const dx = landX - st.x;
    const face = (Math.sign(dx) || 1) as 1 | -1;
    st.face = face;
    setFacing(face === 1 ? 'right' : 'left');

    const hopUp = async () => {
      st.t = 0;
      const userSt = s.current;
      const T1 = Math.max(0.55, Math.min(0.9, Math.abs(dx) / 260));
      userSt.vx = dx / T1;
      userSt.vy = ((landY - userSt.y) + 0.5 * GRAV * T1 * T1) / T1;
      cfg.current = { targetX: landX, targetY: landY, speed: SPEED.walk };
      setMode('jump');
      await nap(T1 * 1000 + 40);
      userSt.x = landX;
      userSt.y = landY;
      userSt.vx = 0;
      userSt.vy = 0;
    };

    await hopUp();
    setMode('erect'); // inspect what it landed on
    await nap(2400 + Math.random() * 1200);

    // hop back down
    const gx = clamp(st.x + (Math.random() < 0.5 ? -180 : 180), 60, innerWidth - 60);
    const gy = hipY(groundY());
    const dx2 = gx - st.x;
    const T2 = 0.75;
    st.t = 0;
    st.vx = dx2 / T2;
    st.vy = ((gy - st.y) + 0.5 * GRAV * T2 * T2) / T2;
    cfg.current = { targetX: gx, targetY: gy, speed: SPEED.walk };
    setMode('jump');
    await nap(T2 * 1000 + 40);
    st.x = gx;
    st.y = gy;
    st.vx = 0;
    st.vy = 0;
    setMode('sit');
    await nap(1400);
  }, [groundY, hipY]);

  const eatTrick = useCallback(async () => {
    const st = s.current;
    st.t = 0;
    setMode('eat');
    setEating(true);
    await nap(4800);
    setEating(false);
    setMode('sit');
    await nap(1100);
  }, []);

  // ---- Physics + render loop ----
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const g = groundY();
      rootRef.current!.style.transform = `translate(${innerWidth / 2 - 50}px, ${hipY(g)}px)`;
      (faceRef.current as HTMLDivElement).style.transform = 'scale(1)';
      shadowRef.current!.style.transform = `translate(${innerWidth / 2 - 22}px, ${g - 6}px)`;
      return;
    }
    let raf = 0;
    let last = performance.now();
    const st = s.current;
    st.x = innerWidth + 30;
    st.y = -50;
    st.face = -1;
    setFacing('left');
    const hy = hipY(groundY());
    const T = 1.15;
    cfg.current = { targetX: innerWidth * 0.72, targetY: hy, speed: SPEED.walk };
    st.vx = (cfg.current.targetX - st.x) / T;
    st.vy = ((cfg.current.targetY - st.y) + 0.5 * GRAV * T * T) / T;
    st.mode = 'jump';
    setBehavior('jump');

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const g = groundY();
      const hyc = hipY(g);

      switch (st.mode) {
        case 'walk':
        case 'run': {
          const spd = cfg.current.speed;
          const dir = Math.sign(cfg.current.targetX - st.x) as 1 | -1;
          const vTarget = dir * spd;
          const accel = Math.abs(vTarget) > Math.abs(st.vx) ? ACCEL : DECEL;
          const dv = vTarget - st.vx;
          st.vx += Math.abs(dv) < accel * dt ? dv : Math.sign(dv) * accel * dt;
          st.x += st.vx * dt;
          // approaching destination -> slow down
          const remain = cfg.current.targetX - st.x;
          if (Math.abs(remain) < spd * 0.5 && Math.sign(remain) === Math.sign(st.vx)) {
            st.vx *= 1 - Math.min(1, dt * 8);
          }
          // gait advance — per-leg footfall: when a foot's phase wraps,
          // that foot plants one stride ahead
          const strideC = st.mode === 'run' ? STRIDE.run : STRIDE.walk;
          const frq = Math.abs(st.vx) / strideC;
          st.p = (st.p + frq * dt) % 1;
          const hindPh = st.p % 1;
          const frontPh = (st.p + 0.5) % 1;
          const strideS = strideC * st.face;
          if (hindPh < st.prevHindPh) st.lhind += strideS;
          if (frontPh < st.prevFrontPh) st.lfront += strideS;
          st.prevHindPh = hindPh;
          st.prevFrontPh = frontPh;
          break;
        }
        case 'jump': {
          st.x += st.vx * dt;
          st.y += st.vy * dt;
          st.vy += GRAV * dt;
          st.t += dt;
          const floor = cfg.current.targetY > 0 ? Math.min(cfg.current.targetY, hyc) : hyc;
          if (st.vy > 0 && st.y >= floor) {
            st.y = floor;
            st.vx = 0;
            st.vy = 0;
            // supervisor handles what happens next (sit/erect) — but if
            // nothing set it, settle into sit.
            if (st.mode === 'jump') setMode('sit');
          }
          if (st.t > 3) {
            st.vx = 0;
            st.vy = 0;
            if (st.mode === 'jump') setMode('sit');
          }
          break;
        }
        case 'erect': {
          st.t += dt;
          st.vx *= 0.9;
          break;
        }
        case 'eat': {
          st.t += dt;
          st.vx *= 0.85;
          break;
        }
        default: {
          st.t += dt;
          st.vx *= 0.85;
          if (Math.abs(st.vx) < 4) st.vx = 0;
        }
      }

      render(g, hyc);
      raf = requestAnimationFrame(tick);
    };

    const render = (g: number, hyc: number) => {
      const r = rootRef.current;
      const f = faceRef.current;
      const sh = shadowRef.current;
      if (!r || !f || !sh) return;

      // --- placement (hip pivot, no flip — legs live in plain screen space) ---
      r.style.transform = `translate(${st.x}px, ${st.y}px)`;

      // --- gait: foot targets (screen coords) ---
      const isRun = st.mode === 'run';
      const sw = isRun ? SW_RUN : SW_WALK;
      const strideC = isRun ? STRIDE.run : STRIDE.walk;
      const strideS = strideC * st.face;
      const lift = isRun ? 9 : 10;

      const hindPh = st.p % 1;
      const frontPh = (st.p + 0.5) % 1;
      let hFoot = { x: st.lhind, y: g };
      let fFoot = { x: st.lfront, y: g };

      if (hindPh < sw) {
        const u = hindPh / sw;
        hFoot = { x: st.lhind + strideS * u, y: g - Math.sin(Math.PI * u) * lift };
      } else {
        hFoot = { x: st.lhind + strideS, y: g };
      }
      if (frontPh < sw) {
        const u = frontPh / sw;
        fFoot = { x: st.lfront + strideS * u, y: g - Math.sin(Math.PI * u) * lift - 2 };
      } else {
        fFoot = { x: st.lfront + strideS, y: g };
      }

      // reared up — front paws pulled up toward chest, weight on hind legs
      const chestX = st.x + SHOULDER_X * st.face;
      if (st.mode === 'erect') {
        fFoot = { x: chestX, y: g - 22 - (AIR * 0.4 + Math.sin(st.t * 3) * 3) };
        hFoot = { x: st.x - 6 * st.face, y: g };
      }
      if (st.mode === 'jump') {
        hFoot = { x: st.x - 2, y: g + 8 };
        fFoot = { x: chestX, y: g + 12 };
      }

      // --- body / head / ears ---
      const bob =
        st.mode === 'jump' ? 0 : (Math.abs(Math.sin(2 * Math.PI * st.p)) * (isRun ? 3.2 : 2.0));
      const breathe =
        st.mode === 'sit' || st.mode === 'sleep' || st.mode === 'hibernate'
          ? Math.sin(st.t * 2.1) * 1.4
          : 0;
      const peg = Math.abs(Math.sin(2 * Math.PI * st.p)) * (isRun ? 1.6 : 1);
      let tilt = 0;
      if (st.mode === 'run') tilt = clamp(Math.abs(st.vx) / SPEED.run, 0, 1) * 12;
      if (st.mode === 'erect') tilt = -50;
      if (st.mode === 'sleep' || st.mode === 'hibernate') tilt = 8;

      const faceX = st.face === 1 ? 1 : -1;
      f.style.transform = `scale(${faceX},1)`;
      f.style.opacity = st.mode === 'sleep' || st.mode === 'hibernate' ? '0.7' : '1';
      f.style.filter =
        st.mode === 'sleep' || st.mode === 'hibernate' ? 'saturate(0.5)' : 'none';

      if (faceRef.current!.style.transformOrigin !== '0px 0px') {
        f.style.transformOrigin = '0px 0px';
      }

      const chomp = st.mode === 'eat' ? Math.sin(st.t * 16) * 2.5 : 0;
      headRef.current!.style.transform =
        `translate(${30 + peg * 0.7}px, ${28 + bob * 0.4 + breathe * 0.3}px)` +
        ` rotate(${chomp}deg)`;
      earRef.current!.style.transform =
        `rotate(${-tilt * 0.6 + bob * 1.5 + (st.mode === 'sleep' ? 18 : 0)}deg)` +
        ` translate(-1px, 1px)`;

      // --- legs via IK ---
      applyLeg(hindRef.current!, hindKneeRef.current!, 0, 0, hFoot.x - st.x, hFoot.y - st.y, -1);
      applyLeg(frontRef.current!, frontKneeRef.current!, 0, 0, fFoot.x - st.x, fFoot.y - st.y, 1);

      // --- ground shadow (stays on the ground, shrinks with altitude) ---
      const alt = clamp((g - st.y - 60) / 200, 0, 1);
      const sc = (1 - alt * 0.55).toFixed(3);
      const op = (1 - alt * 0.7).toFixed(2);
      sh.style.transform = `translate(${st.x - 24}px, ${g - 8}px) scale(${sc})`;
      sh.style.opacity = op;
    };

    const applyLeg = (
      gEl: SVGGElement | null,
      kneeEl: SVGGElement | null,
      hx: number,
      hy: number,
      fx: number,
      fy: number,
      bend: -1 | 1
    ) => {
      if (!gEl || !kneeEl) return;
      const { hipA, kneeA } = ik(hx, hy, fx, fy, bend);
      gEl.setAttribute('transform', `translate(${hx.toFixed(2)} ${hy.toFixed(2)}) rotate(${toDeg(hipA).toFixed(2)})`);
      kneeEl.setAttribute('transform', `rotate(${toDeg(kneeA).toFixed(2)})`);
    };

    raf = requestAnimationFrame(tick);
    return () => {
      alive.current = false;
      cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groundY, hipY]);

  // Supervisor is separate from the render loop
  useEffect(() => {
    alive.current = true;
    const done = supervise();
    return () => {
      alive.current = false;
      void done;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className={`fixed inset-0 pointer-events-none select-none z-50 ${className || ''}`}
      aria-hidden
    >
      {/* ground shadow (screen-fixed, keeps footing anchored) */}
      <div
        ref={shadowRef}
        className="absolute"
        style={{
          opacity: 0,
          width: 48,
          height: 16,
          background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.28), transparent 70%)',
          transformOrigin: 'center',
        }}
      />

      {/* character — hip pivot at local (0,0) */}
      <div
        ref={rootRef}
        className="absolute left-0 top-0"
        style={{ width: 100, height: 100, transformOrigin: '0px 0px' }}
      >
        {/* legs (no flip — world/screen aligned) */}
        <svg width={100} height={100} viewBox="0 0 100 100" className="absolute inset-0">
          <g ref={hindRef}>
            <g ref={hindKneeRef}>
              <line x1={0} y1={0} x2={0} y2={L2} stroke="#DFC490" strokeWidth={7} strokeLinecap="round" />
              <ellipse cx={0} cy={L2 + 2} rx={5.2} ry={3} fill="#C9A96E" />
            </g>
            <line x1={0} y1={0} x2={0} y2={L1} stroke="#EBD39B" strokeWidth={7.5} strokeLinecap="round" />
          </g>
          <g ref={frontRef}>
            <g ref={frontKneeRef}>
              <line x1={0} y1={0} x2={0} y2={L2} stroke="#DFC490" strokeWidth={6.5} strokeLinecap="round" />
              <ellipse cx={0} cy={L2 + 2} rx={4.6} ry={2.8} fill="#C9A96E" />
            </g>
            <line x1={0} y1={0} x2={0} y2={L1} stroke="#EBD39B" strokeWidth={6.5} strokeLinecap="round" />
          </g>
        </svg>

        {/* face group — body, head, ears, tail, carrot; mirrors for facing */}
        <div
          ref={faceRef}
          className="absolute left-0 top-0"
          style={{ width: 100, height: 100, transformOrigin: '0px 0px' }}
        >
          {/* tail */}
          <div className="absolute rounded-full" style={{ left: -22, top: -8, width: 13, height: 11, background: '#EAD9A6' }} />
          {/* body */}
          <div
            className="absolute"
            style={{
              left: -18,
              top: -16,
              width: 44,
              height: 32,
              borderRadius: '50%',
              background: 'radial-gradient(circle at 40% 30%, #FBF3D5, #EFDCAB)',
            }}
          />
          {/* belly */}
          <div className="absolute" style={{ left: -10, top: -4, width: 26, height: 20, borderRadius: '50%', background: '#FFF9E8' }} />
          {/* carrot while eating */}
          {eating && (
            <img src="/assets/Todo.png" alt="carrot" className="absolute w-7 h-7 object-contain" style={{ left: 34, top: 2 }} />
          )}
          {/* head + ears */}
          <div
            ref={headRef}
            className="absolute"
            style={{ transformOrigin: '6px 14px', width: 0, height: 0 }}
          >
            <div
              className="absolute rounded-full"
              style={{
                left: -12,
                top: -14,
                width: 30,
                height: 26,
                borderRadius: '50%',
                background: '#FBF3D5',
              }}
            />
            {/* ears */}
            <div ref={earRef} className="absolute" style={{ left: -6, top: -34, transformOrigin: '8px 0px' }}>
              <div className="absolute rounded-full" style={{ left: 0, top: 0, width: 9, height: 26, background: '#E8B865' }} />
              <div className="absolute rounded-full" style={{ left: 9, top: 2, width: 9, height: 22, background: '#E8B865' }} />
            </div>
            {/* eye + nose */}
            <div className="absolute rounded-full" style={{ left: 4, top: -1, width: 3.5, height: 4.5, background: '#321B06' }} />
            <div className="absolute rounded-full" style={{ left: 12, top: 2, width: 3, height: 3, background: '#8E4C0A' }} />
          </div>
        </div>

        {/* sleep z's */}
        {(behavior === 'sleep' || behavior === 'hibernate') && (
          <span className="absolute left-8 top-2 font-bold text-sm text-fg-muted" style={{ animation: 'ethco-zzz 1.8s ease-in-out infinite' }}>
            z
          </span>
        )}
      </div>

      <style>{`
        @keyframes ethco-zzz {
          0%   { opacity: 0; transform: translate(0,0) scale(0.7); }
          35%  { opacity: 1; }
          100% { opacity: 0; transform: translate(9px,-18px) scale(1.4); }
        }
      `}</style>
    </div>
  );
};