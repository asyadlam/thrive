import { useEffect, useRef, useState, type ReactNode } from 'react';
import { listEntriesBetween, todayKey } from '../lib/journal';
import { loadSettings, type PetKind } from '../lib/settings';
import { KIND_MESSAGES } from '../data/kindMessages';

/*
  The ONE place companion art is defined. `src` is each pet's default (normal) picture, `pickerImage` is the
  picture shown in the Settings picker, and `poses` are the still images swapped in by situation. Any pose a pet
  doesn't have falls back to its default picture.
*/
export type PetPose = 'default' | 'thinking' | 'winking' | 'listening' | 'celebrating' | 'comforting' | 'eating';

type PetArt = {
  label: string;
  src: string;
  pickerImage: string;
  poses?: Partial<Record<Exclude<PetPose, 'default'>, string>>;
};

const pet = (file: string) => `/pets/${file}-cutout.png`;

export const PET_ART: Record<PetKind, PetArt> = {
  hippo: {
    label: 'Hippo',
    src: pet('yoshi-default-heart'), // holding the heart is his normal picture
    pickerImage: pet('yoshi-default-heart'),
    poses: {
      thinking: pet('yoshi-thinking'),
      winking: pet('yoshi-winking'),
      listening: pet('yoshi-listening'),
      celebrating: pet('yoshi-celebrating'),
      comforting: pet('yoshi-comforting-hug'), // eyes closed, hugging the heart (new name, so no phone shows an old cached copy)
      eating: pet('yoshi-eating'),
    },
  },
  cat: {
    label: 'Cat',
    src: pet('cat-default-calm'),
    pickerImage: pet('cat-winking'),
    poses: {
      thinking: pet('cat-thinking'),
      winking: pet('cat-winking'),
      listening: pet('cat-listening'),
      celebrating: pet('cat-celebrating'),
      comforting: pet('cat-comforting'),
      eating: pet('cat-eating'),
    },
  },
  platypus: {
    label: 'Platypus',
    src: pet('platypus-default-calm'),
    pickerImage: pet('platypus-celebrating'),
    poses: {
      thinking: pet('platypus-thinking'),
      winking: pet('platypus-winking'),
      listening: pet('platypus-listening'),
      celebrating: pet('platypus-celebrating'),
      comforting: pet('platypus-comforting'),
      eating: pet('platypus-eating'),
    },
  },
  panda: {
    label: 'Panda',
    src: pet('panda-default-calm'),
    pickerImage: pet('panda-thinking'),
    poses: {
      thinking: pet('panda-thinking'),
      winking: pet('panda-winking'),
      listening: pet('panda-listening'),
      celebrating: pet('panda-celebrating'),
      comforting: pet('panda-comforting'),
      eating: pet('panda-eating'),
    },
  },
  dog: {
    label: 'Dog',
    src: pet('dog-default-calm'),
    pickerImage: pet('dog-listening'),
    poses: {
      thinking: pet('dog-thinking'),
      winking: pet('dog-winking'),
      listening: pet('dog-listening'),
      celebrating: pet('dog-celebrating'),
      comforting: pet('dog-comforting'),
      eating: pet('dog-eating'),
    },
  },
};

/** The image for this pet in this pose, or the pet's default image when it has no such pose. */
export function petImage(kind: PetKind, pose: PetPose = 'default'): string {
  const art = PET_ART[kind];
  return (pose !== 'default' && art.poses?.[pose]) || art.src;
}

/** Load a pet's pose images once in the background, so a pose change shows straight away. */
const preloaded = new Set<PetKind>();
function preloadPoses(kind: PetKind) {
  if (preloaded.has(kind)) return;
  preloaded.add(kind);
  for (const src of Object.values(PET_ART[kind].poses ?? {})) {
    const img = new Image();
    img.decoding = 'async';
    img.src = src;
  }
}

/**
 * Shows a "celebrating" pose for about 3 seconds, then goes back to `base`.
 * Returns the pose to show now and a function to start the celebration.
 */
export function useCelebration(base: PetPose = 'default'): [PetPose, () => void] {
  const [celebrating, setCelebrating] = useState(false);
  const timer = useRef<number>();
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const celebrate = () => {
    setCelebrating(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCelebrating(false), CELEBRATE_MS);
  };
  return [celebrating ? 'celebrating' : base, celebrate];
}

const CELEBRATE_MS = 3000;
// Tap surprise: about 1 tap in 3 (never twice in a row) briefly shows a playful pose, only from the normal pose.
const SURPRISE_POSES: PetPose[] = ['winking', 'celebrating', 'eating'];
const SURPRISE_CHANCE = 1 / 3;
const SURPRISE_MS = 2500;
const POSE_FADE_MS = 220; // the crossfade itself is ~200ms (CSS); this clears the old image just after

/** Small still preview (the pet's picker picture), used only by the Settings picker. */
export function PetThumb({ kind, size = 56 }: { kind: PetKind; size?: number }) {
  return (
    <img
      src={PET_ART[kind].pickerImage}
      width={size}
      height={size}
      alt=""
      className="pet-thumb"
      decoding="async"
      draggable={false}
    />
  );
}

type FxKind = 'heart' | 'hearts' | 'sparkles' | 'stars';
const FX_KINDS: FxKind[] = ['heart', 'hearts', 'sparkles', 'stars'];
const FX_MS = 800; // how long one floating effect lasts
const BUBBLE_MS = 3000; // how long a kind message stays

/** Random pick from `list`, never the same as `last`. */
function pickNew<T>(list: T[], last: T | null): T {
  const options = list.length > 1 ? list.filter((x) => x !== last) : list;
  return options[Math.floor(Math.random() * options.length)];
}

const reducedMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const HEART = 'M12 21s-7.5-4.6-9.5-9.2C1.2 8.6 3.3 5 6.8 5c2.1 0 3.6 1.2 5.2 3 1.6-1.8 3.1-3 5.2-3 3.5 0 5.6 3.6 4.3 6.8C19.5 16.4 12 21 12 21z';
const SPARKLE = 'M12 2c.6 6.4 3.6 9.4 10 10-6.4.6-9.4 3.6-10 10-.6-6.4-3.6-9.4-10-10 6.4-.6 9.4-3.6 10-10z';
const STAR = 'M12 3l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.8l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z';

/** One shape inside an effect; x/y/size are in em so the whole effect scales with the pet. */
function Shape({ d, color, x, y, size, rotate = 0, round = false }: { d: string; color: string; x: number; y: number; size: number; rotate?: number; round?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="pet-fx-shape"
      style={{ left: `${x}em`, top: `${y}em`, width: `${size}em`, height: `${size}em`, transform: `rotate(${rotate}deg)` }}
    >
      <path d={d} fill={color} stroke={round ? color : undefined} strokeWidth={round ? 1.5 : undefined} strokeLinejoin="round" />
    </svg>
  );
}

const TERRACOTTA = '#C47A62';
const TERRACOTTA_SOFT = '#D99A84';
const SAGE = '#6B9E7A';
const SAGE_SOFT = '#8FB89A';

/** The small floating effect; the box is 2em wide x 1.4em tall, centered above the pet. */
function Effect({ kind }: { kind: FxKind }) {
  switch (kind) {
    case 'heart':
      return <Shape d={HEART} color={TERRACOTTA} x={0.5} y={0.2} size={1} />;
    case 'hearts':
      return (
        <>
          <Shape d={HEART} color={TERRACOTTA} x={0.2} y={0.35} size={0.72} rotate={-12} />
          <Shape d={HEART} color={TERRACOTTA_SOFT} x={1.05} y={0.15} size={0.72} rotate={12} />
        </>
      );
    case 'sparkles':
      return (
        <>
          <Shape d={SPARKLE} color={SAGE} x={0.55} y={0.3} size={0.8} />
          <Shape d={SPARKLE} color={SAGE_SOFT} x={0.05} y={0.05} size={0.45} />
          <Shape d={SPARKLE} color={TERRACOTTA_SOFT} x={1.45} y={0.75} size={0.45} />
        </>
      );
    case 'stars':
      return (
        <>
          <Shape d={STAR} color={TERRACOTTA_SOFT} x={0.1} y={0.5} size={0.5} round />
          <Shape d={STAR} color={SAGE} x={0.75} y={0.05} size={0.6} round />
          <Shape d={STAR} color={TERRACOTTA} x={1.45} y={0.55} size={0.45} round />
        </>
      );
  }
}

type CompanionProps = {
  /** "large" = Home (pet, name, greeting line). "small" = ~56px pet only, for page headers. */
  size?: 'large' | 'small';
  /** Large only: shown between the pet and its greeting line (e.g. Home's time-of-day greeting). */
  children?: ReactNode;
  /** Which pose to show (falls back to the pet's default image when it has no such pose). */
  pose?: PetPose;
};

/** The companion pet. Renders nothing when the companion is set to "None". */
export default function PetCompanion({ size = 'large', children, pose = 'default' }: CompanionProps = {}) {
  const [{ companion, petName }] = useState(loadSettings);
  // A tap's playful pose surprise (null = none showing). Only ever starts while the page shows the normal pose.
  const [surprise, setSurprise] = useState<PetPose | null>(null);
  const lastTapSurprised = useRef(false);
  const lastSurprise = useRef<PetPose | null>(null);
  const surpriseTimer = useRef<number>();
  useEffect(() => {
    // a special pose (listening, thinking, a celebration, comforting…) always wins over a surprise
    if (pose !== 'default') {
      window.clearTimeout(surpriseTimer.current);
      setSurprise(null);
    }
  }, [pose]);
  useEffect(() => () => window.clearTimeout(surpriseTimer.current), []);
  // Pose crossfade: `shown` is the image on screen; `leaving` is the previous one, fading out underneath.
  const target = companion === 'none' ? '' : petImage(companion, pose === 'default' && surprise ? surprise : pose);
  const [shown, setShown] = useState(target);
  const [leaving, setLeaving] = useState<string | null>(null);
  const leaveTimer = useRef<number>();
  useEffect(() => {
    if (companion !== 'none') preloadPoses(companion);
  }, [companion]);
  useEffect(() => {
    if (target === shown) return;
    window.clearTimeout(leaveTimer.current);
    if (reducedMotion()) {
      setLeaving(null); // no crossfade: just swap
    } else {
      setLeaving(shown);
      leaveTimer.current = window.setTimeout(() => setLeaving(null), POSE_FADE_MS);
    }
    setShown(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);
  useEffect(() => () => window.clearTimeout(leaveTimer.current), []);
  const [showedUpToday, setShowedUpToday] = useState<boolean | null>(null);
  const [bouncing, setBouncing] = useState(false);
  const [fx, setFx] = useState<{ kind: FxKind } | null>(null);
  const lastFx = useRef<FxKind | null>(null);
  const fxTimer = useRef<number>();
  // the kind message: `n` changes on every tap so the bubble restarts its fade
  const [bubble, setBubble] = useState<{ text: string; n: number } | null>(null);
  const lastMessage = useRef<string | null>(null);
  const bubbleTimer = useRef<number>();

  useEffect(
    () => () => {
      window.clearTimeout(fxTimer.current);
      window.clearTimeout(bubbleTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (companion === 'none' || size === 'small') return; // the small pet has no greeting line
    let active = true;
    const today = todayKey();
    listEntriesBetween(today, today)
      .then((entries) => active && setShowedUpToday(entries.length > 0))
      .catch(() => active && setShowedUpToday(false));
    return () => {
      active = false;
    };
  }, [companion, size]);

  if (companion === 'none') return null;

  const art = PET_ART[companion];
  const name = petName.trim();

  const greeting = showedUpToday === null ? '' : showedUpToday ? 'You showed up today.' : "Hi there. I'm glad you're here.";

  function handleTap() {
    // a kind message every tap: a new one replaces the old and the 3-second fade starts over
    const text = pickNew(KIND_MESSAGES, lastMessage.current);
    lastMessage.current = text;
    setBubble((b) => ({ text, n: (b?.n ?? 0) + 1 }));
    window.clearTimeout(bubbleTimer.current);
    bubbleTimer.current = window.setTimeout(() => setBubble(null), BUBBLE_MS);

    // Pose surprise: only from the normal pose, about 1 tap in 3, never on two taps in a row.
    if (pose === 'default' && !surprise && !lastTapSurprised.current && Math.random() < SURPRISE_CHANCE) {
      const next = pickNew(SURPRISE_POSES, lastSurprise.current);
      lastSurprise.current = next;
      lastTapSurprised.current = true;
      setSurprise(next);
      window.clearTimeout(surpriseTimer.current);
      surpriseTimer.current = window.setTimeout(() => setSurprise(null), SURPRISE_MS);
    } else if (!surprise) {
      lastTapSurprised.current = false; // a plain tap: the next one may surprise again
    }

    if (reducedMotion()) return; // no bounce, no floating effect

    setBouncing(false);
    // restart the bounce on the next frame so quick repeat taps still bounce
    requestAnimationFrame(() => setBouncing(true));

    // one effect at a time: taps while one is still floating don't start another
    if (!fx) {
      const kind = pickNew(FX_KINDS, lastFx.current);
      lastFx.current = kind;
      setFx({ kind });
      fxTimer.current = window.setTimeout(() => setFx(null), FX_MS);
    }
  }

  const tap = (
    <button type="button" className="pet-companion-tap" aria-label={`Say hi to ${name || art.label}`} onClick={handleTap}>
      <span className="pet-companion-bob">
        {leaving && (
          <span key={`out-${leaving}`} className="pet-pose pet-pose-out" aria-hidden="true">
            <img src={leaving} alt="" className="pet-companion-img" decoding="async" draggable={false} />
          </span>
        )}
        <span key={shown} className={`pet-pose${leaving ? ' pet-pose-in' : ''}`}>
          <img
            src={shown}
            alt=""
            className={`pet-companion-img${bouncing ? ' bounce' : ''}`}
            decoding="async"
            draggable={false}
            onAnimationEnd={() => setBouncing(false)}
            onError={(e) => {
              // a missing pose image never shows as broken: use the pet's default instead
              if (e.currentTarget.src !== new URL(art.src, window.location.href).href) setShown(art.src);
            }}
          />
        </span>
      </span>
      {fx && (
        <span className={`pet-fx pet-fx-${fx.kind}`} aria-hidden="true">
          <Effect kind={fx.kind} />
        </span>
      )}
    </button>
  );

  const bubbleEl = (
    <>
      {bubble && (
        <span key={bubble.n} className="pet-bubble" aria-hidden="true">
          {bubble.text}
        </span>
      )}
      {/* read out by screen readers */}
      <span className="sr-only" aria-live="polite">
        {bubble?.text ?? ''}
      </span>
    </>
  );

  if (size === 'small') {
    return (
      <span className="pet-small">
        {tap}
        {bubbleEl}
      </span>
    );
  }

  return (
    <section className="pet-companion" aria-label="Your companion">
      <span className="pet-stage">
        {tap}
        {bubbleEl}
      </span>
      {name && <span className="pet-companion-name">{name}</span>}
      {children}
      <p className="pet-companion-greeting">{greeting}</p>
    </section>
  );
}
