import { useState } from 'react';
import { TARGETS, type AppSettings, type TargetKey } from '../lib/settings';

const KEYS = Object.keys(TARGETS) as TargetKey[];

/** Settings → Daily Sprout targets: calories, protein, added sugar and water (whole numbers). */
export default function TargetsSection({ settings, update }: { settings: AppSettings; update: (next: Partial<AppSettings>) => void }) {
  const [text, setText] = useState<Record<TargetKey, string>>(() => Object.fromEntries(KEYS.map((k) => [k, String(settings[k])])) as Record<TargetKey, string>);
  const [error, setError] = useState<TargetKey | null>(null);

  function change(key: TargetKey, value: string) {
    setText((t) => ({ ...t, [key]: value }));
    const n = Number(value.trim());
    const { min, max } = TARGETS[key];
    if (!/^\d+$/.test(value.trim()) || n < min || n > max) return setError(key);
    setError(null);
    update({ [key]: n } as Partial<AppSettings>);
  }

  return (
    <section className="card settings-section" aria-labelledby="targets-heading">
      <h2 id="targets-heading" className="settings-heading">
        Daily Sprout targets
      </h2>
      <p className="hint">What the calorie ring, protein, added sugar and water glasses count toward each day.</p>
      <div className="targets-grid">
        {KEYS.map((key) => (
          <label key={key} className="field">
            <span>{TARGETS[key].label}</span>
            <span className="about-number">
              <input className="input" inputMode="numeric" value={text[key]} onChange={(e) => change(key, e.target.value)} />
              <span className="about-unit" aria-hidden="true">
                {TARGETS[key].unit}
              </span>
            </span>
          </label>
        ))}
      </div>
      {error && (
        <p className="form-error" role="alert">
          {TARGETS[error].label} should be a whole number from {TARGETS[error].min} to {TARGETS[error].max.toLocaleString()}.
        </p>
      )}
    </section>
  );
}
