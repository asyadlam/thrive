import { useState } from 'react';
import PageShell from '../components/PageShell';
import MyDataSection from '../components/MyDataSection';
import { PET_ART, PetThumb } from '../components/PetCompanion';
import { PET_KINDS, PET_NAME_MAX, loadSettings, saveSettings, type AppSettings, type Companion } from '../lib/settings';

const OPTIONS: Companion[] = [...PET_KINDS, 'none'];

export default function Settings() {
  const [settings, setSettings] = useState<AppSettings>(loadSettings);
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle');

  function update(next: Partial<AppSettings>) {
    const merged = { ...settings, ...next };
    setSettings(merged);
    setStatus(saveSettings(merged) ? 'saved' : 'error');
  }

  return (
    <PageShell title="Settings" subtitle="Make Thrive your own.">
      <section className="card settings-section" aria-labelledby="companion-heading">
        <h2 id="companion-heading" className="settings-heading">
          Companion
        </h2>
        <p className="hint">An optional little friend on your Home screen.</p>

        <fieldset className="field">
          <legend className="sr-only">Choose a companion</legend>
          <div className="pet-options">
            {OPTIONS.map((option) => (
              <label key={option} className="pet-option">
                <input
                  type="radio"
                  name="companion"
                  value={option}
                  checked={settings.companion === option}
                  onChange={() => update({ companion: option })}
                />
                <span className="pet-option-card">
                  {option === 'none' ? (
                    <span className="pet-none" aria-hidden="true">
                      —
                    </span>
                  ) : (
                    <PetThumb kind={option} />
                  )}
                  <span className="pet-option-label">{option === 'none' ? 'None' : PET_ART[option].label}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {settings.companion !== 'none' && (
          <div className="field">
            <label htmlFor="pet-name">
              Name <span className="optional">(optional)</span>
            </label>
            <input
              id="pet-name"
              type="text"
              className="input"
              value={settings.petName}
              maxLength={PET_NAME_MAX}
              autoComplete="off"
              placeholder="e.g. Pip"
              onChange={(e) => update({ petName: e.target.value })}
            />
          </div>
        )}

        <p className={status === 'error' ? 'form-error' : 'save-status'} role="status">
          {status === 'saved' && 'Saved on this device.'}
          {status === 'error' && "Couldn't save settings in this browser."}
        </p>
      </section>

      <MyDataSection
        onRestored={() => {
          setSettings(loadSettings());
          setStatus('idle');
        }}
      />
    </PageShell>
  );
}
