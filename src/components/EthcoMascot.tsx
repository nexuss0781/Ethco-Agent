import React, { useRef, useEffect, useState, useCallback } from 'react';
import { motion, useAnimationControls } from 'motion/react';

type Behavior = 'walk' | 'run' | 'jump' | 'sit' | 'eat' | 'sleep' | 'hibernate';

const RABBIT_SIZE = 44; // px
const GROUND_EDGE = 96; // px above bottom

const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

const nap = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Viewport rects of "tangible" places the rabbit can land on. */
function getTargets(): DOMRect[] {
  const rects: DOMRect[] = [];
  document
    .querySelectorAll<HTMLElement>(
      '[id^="chip-prompt-"], #btn-submit-message, #chat-textarea, h1.font-serif, #model-select-trigger'
    )
    .forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width > 8 && r.height > 8 && r.bottom > 0 && r.top < innerHeight) {
        rects.push(r);
      }
    });
  return rects;
}

interface EthcoMascotProps {
  className?: string;
}

/** Ethco mascot: a rabbit that walks, runs, jumps, sits, eats and naps
 *  around the live interface, landing on real buttons and headers. */
export const EthcoMascot: React.FC<EthcoMascotProps> = ({ className }) => {
  const controls = useAnimationControls();
  const [behavior, setBehavior] = useState<Behavior>('sit');
  const [facing, setFacing] = useState<'left' | 'right'>('right');

  const pos = useRef({ x: 0, y: 0 });
  const cancelled = useRef(false);

  const groundY = () => innerHeight - GROUND_EDGE;

  const setPos = useCallback((x: number, y: number) => {
    pos.current.x = Math.min(Math.max(x, 12), innerWidth - RABBIT_SIZE - 12);
    pos.current.y = y;
  }, []);

  const face = useCallback(
    (dx: number) => {
      if (dx > 1 && facing !== 'right') {
        setFacing('right');
        controls.start({ scaleX: 1, transition: { duration: 0.1 } });
      } else if (dx < -1 && facing !== 'left') {
        setFacing('left');
        controls.start({ scaleX: -1, transition: { duration: 0.1 } });
      }
    },
    [controls, facing]
  );

  /** Hop between [x1,y1] and [x2,y2] with `bounces` arcs peaked at `peak`. */
  const hop = useCallback(
    async (
      x1: number,
      y1: number,
      x2: number,
      y2: number,
      bounces: number,
      peak: number,
      duration: number
    ) => {
      const way = bounces + 1;
      const xs: number[] = [];
      const ys: number[] = [];
      for (let i = 0; i <= way; i++) {
        xs.push(x1 + ((x2 - x1) * i) / way);
        ys.push(i === way ? y2 : Math.min(y1, y2) - peak);
      }
      setPos(x2, y2);
      face(x2 - x1);
      await controls.start({
        x: xs,
        y: ys,
        transition: { duration, ease: 'linear' },
      });
    },
    [controls, face, setPos]
  );

  const walkTo = useCallback(
    async (dist: number) => {
      const x = pos.current.x;
      const tx = Math.min(Math.max(x + dist, 12), innerWidth - RABBIT_SIZE - 12);
      const dur = Math.max(0.7, Math.abs(tx - x) / 90);
      setBehavior('walk');
      setPos(tx, pos.current.y);
      face(tx - x);
      await controls.start({
        x: [
          x,
          x + (tx - x) * 0.2,
          x + (tx - x) * 0.4,
          x + (tx - x) * 0.6,
          x + (tx - x) * 0.8,
          tx,
        ],
        y: [
          pos.current.y,
          pos.current.y - 13,
          pos.current.y,
          pos.current.y - 13,
          pos.current.y - 13,
          pos.current.y,
        ],
        transition: { duration: dur, ease: 'linear' },
      });
    },
    [controls, face, setPos]
  );

  const runTo = useCallback(
    async (dist: number) => {
      const x = pos.current.x;
      const tx = Math.min(Math.max(x + dist, 12), innerWidth - RABBIT_SIZE - 12);
      const dur = Math.max(0.5, Math.abs(tx - x) / 340);
      setBehavior('run');
      setPos(tx, pos.current.y);
      face(tx - x);
      await controls.start({
        x: [x, tx],
        y: [pos.current.y, pos.current.y - 8, pos.current.y],
        rotate: [0, 10, -8, 0],
        transition: { duration: dur, ease: 'linear' },
      });
    },
    [controls, face, setPos]
  );

  const sit = useCallback(async (ms: number) => {
    setBehavior('sit');
    const y = pos.current.y;
    const t = Date.now() + ms;
    while (Date.now() < t) {
      await controls.start({
        y: [y, y - 5, y],
        rotate: [0, 2, -2, 0],
        transition: { duration: 1.4, ease: 'easeInOut' },
      });
    }
  }, [controls]);

  const eat = useCallback(async () => {
    setBehavior('eat');
    const y = pos.current.y;
    for (let i = 0; i < 4; i++) {
      await controls.start({
        y: [y, y - 7, y],
        rotate: [0, -5, 3, 0],
        transition: { duration: 0.6, ease: 'easeInOut' },
      });
    }
    setBehavior('sit');
  }, [controls]);

  const sleepLong = useCallback(
    async (ms: number) => {
      setBehavior(ms > 6000 ? 'hibernate' : 'sleep');
      await controls.start({
        y: [pos.current.y, pos.current.y - 3, pos.current.y],
        rotate: -9,
        transition: { duration: 1 },
      });
      await nap(ms);
      await controls.start({ rotate: 0, transition: { duration: 0.5 } });
      setBehavior('sit');
    },
    [controls]
  );

  /** Jump onto a real UI element, sit there a moment, then drop back down. */
  const jumpToTarget = useCallback(async () => {
    const targets = getTargets();
    if (!targets.length) {
      await eat();
      return;
    }
    const r = pick(targets);
    const x = Math.min(Math.max(r.left + r.width / 2 - RABBIT_SIZE / 2, 12), innerWidth - RABBIT_SIZE - 12);
    const y = Math.max(8, r.top - RABBIT_SIZE - 8);
    const fromY = pos.current.y;
    const fromX = pos.current.x;

    setBehavior('jump');
    await hop(fromX, fromY, x, y, 2, 70, 0.85);
    setBehavior('sit');
    await nap(2400 + Math.random() * 1400);

    const gy = groundY();
    setBehavior('jump');
    await controls.start({
      x: [x, x, x],
      y: [y, y - 24, gy],
      transition: { duration: 0.55, ease: 'easeInOut' },
    });
    setPos(x, gy);
    setBehavior('sit');
  }, [controls, eat, groundY, hop, setPos]);

  useEffect(() => {
    let isMounted = true;

    (async () => {
      try {
        await nap(900);
        if (!isMounted) return;
        // Entrance: hop in from the right edge onto the ground line
        const gy = groundY();
        controls.set({ x: innerWidth + 40, y: gy, scaleX: -1 });
        controls.start({ opacity: 1 });
        await hop(innerWidth + 40, gy, Math.min(innerWidth * 0.78, innerWidth - 80), gy, 3, 28, 1.4);

        while (isMounted) {
          const roll = Math.random();
          if (roll < 0.26) {
            await walkTo(pick([260, 400, 300, -280, -420, 350]));
            await sit(800 + Math.random() * 1200);
          } else if (roll < 0.44) {
            await runTo(pick([480, 700, 620, -500, -760]));
            await sit(700 + Math.random() * 1000);
          } else if (roll < 0.62) {
            await jumpToTarget();
          } else if (roll < 0.78) {
            await eat();
          } else if (roll < 0.93) {
            await sit(2200 + Math.random() * 2600);
          } else {
            await sleepLong(Math.random() < 0.5 ? 5200 : 10500);
          }
        }
      } catch {
        /* animation interrupted */
      }
    })();

    return () => {
      isMounted = false;
      cancelled.current = true;
      controls.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dim = behavior === 'sleep' || behavior === 'hibernate';

  return (
    <motion.div
      className={`fixed inset-0 pointer-events-none select-none z-50 ${className || ''}`}
      aria-hidden
    >
      <motion.div
        animate={controls}
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: RABBIT_SIZE,
          height: RABBIT_SIZE,
          opacity: 0,
        }}
      >
        <motion.img
          src="/assets/rabbit.svg"
          alt="Ethco rabbit"
          className="w-full h-full object-contain"
          style={{
            opacity: dim ? 0.55 : 1,
            filter: dim ? 'saturate(0.45)' : 'none',
            transformOrigin: 'bottom center',
          }}
        />

        {/* Carrot the rabbit nibbles */}
        <motion.img
          src="/assets/Todo.png"
          alt="carrot"
          className="absolute w-7 h-7 object-contain"
          style={{ left: 40, top: 4 }}
          animate={
            behavior === 'eat'
              ? { opacity: [0, 1, 1], x: [0, 3, -2] }
              : { opacity: 0.9, x: 0 }
          }
          transition={
            behavior === 'eat'
              ? { opacity: { duration: 0.2 }, x: { duration: 0.4, repeat: 2 } }
              : {}
          }
        />

        {/* Zzz when sleeping or hibernating */}
        {(behavior === 'sleep' || behavior === 'hibernate') && (
          <motion.span
            className="absolute -top-3 -right-1 text-fg-muted font-bold text-sm"
            animate={{ opacity: [0, 1, 0], y: [-2, -10, -18], x: [0, 6, 12] }}
            transition={{ duration: 1.8, repeat: Infinity }}
          >
            z
          </motion.span>
        )}
      </motion.div>
    </motion.div>
  );
};