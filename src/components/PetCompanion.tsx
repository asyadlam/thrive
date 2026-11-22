import { useEffect, useState, type ReactNode } from 'react';
import { listEntriesBetween, todayKey } from '../lib/journal';
import { loadSettings, type PetKind } from '../lib/settings';

/*
  The ONE place companion art is defined. To switch to animated versions later,
  change only the `src` values here (animated GIF / APNG / WebP work as-is).
*/
export const PET_ART: Record<PetKind, { label: string; src: string }> = {
  hippo: { label: 'Hippo', src: '/pets/hippo.png' },
  cat: { label: 'Cat', src: '/pets/cat.png' },
  platypus: { label: 'Platypus', src: '/pets/platypus.png' },
};

/** Gentle lines shown one after another when you tap your companion. */
const TAP_LINES = [
  "I'm right here with you.",
  'Take a slow breath with me.',
  'Small steps still count.',
  "You're doing just fine.",
  'Thanks for spending a moment here.',
];

/** Small still preview, used only by the Settings picker. */
export function PetThumb({ kind, size = 56 }: { kind: PetKind; size?: number }) {
  return (
    <img
      src={PET_ART[kind].src}
      width={size}
      height={size}
      alt=""
      className="pet-thumb"
      decoding="async"
      draggable={false}
    />
  );
}

/**
 * The companion on Home: pet, optional name, and one gentle greeting line. Renders nothing for "None".
 * Optional `children` (e.g. Home's time-of-day greeting) are shown between the pet and its greeting line.
 */
export default function PetCompanion({ children }: { children?: ReactNode } = {}) {
  const [{ companion, petName }] = useState(loadSettings);
  const [showedUpToday, setShowedUpToday] = useState<boolean | null>(null);
  const [tapCount, setTapCount] = useState(0);
  const [bouncing, setBouncing] = useState(false);

  useEffect(() => {
    if (companion === 'none') return;
    let active = true;
    const today = todayKey();
    listEntriesBetween(today, today)
      .then((entries) => active && setShowedUpToday(entries.length > 0))
      .catch(() => active && setShowedUpToday(false));
    return () => {
      active = false;
    };
  }, [companion]);

  if (companion === 'none') return null;

  const art = PET_ART[companion];
  const name = petName.trim();

  const baseLine = showedUpToday ? 'You showed up today.' : "Hi there. I'm glad you're here.";
  const greeting =
    showedUpToday === null ? '' : tapCount === 0 ? baseLine : TAP_LINES[(tapCount - 1) % TAP_LINES.length];

  function handleTap() {
    setTapCount((n) => n + 1);
    setBouncing(false);
    // restart the bounce on the next frame so quick repeat taps still bounce
    requestAnimationFrame(() => setBouncing(true));
  }

  return (
    <section className="pet-companion" aria-label="Your companion">
      <button type="button" className="pet-companion-tap" aria-label={`Say hi to ${name || art.label}`} onClick={handleTap}>
        <span className="pet-companion-bob">
          <img
            src={art.src}
            alt=""
            className={`pet-companion-img${bouncing ? ' bounce' : ''}`}
            decoding="async"
            draggable={false}
            onAnimationEnd={() => setBouncing(false)}
          />
        </span>
      </button>
      {name && <span className="pet-companion-name">{name}</span>}
      {children}
      <p className="pet-companion-greeting" aria-live="polite">
        {greeting}
      </p>
    </section>
  );
}
