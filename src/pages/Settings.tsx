import { useState } from 'react';
import AccountSection from '../components/AccountSection';
import { Link } from 'react-router-dom';
import PageShell from '../components/PageShell';
import MyDataSection from '../components/MyDataSection';
import { PET_ART, PetThumb } from '../components/PetCompanion';
import {
  PET_KINDS,
  PET_NAME_MAX,
  USER_NAME_MAX,
  loadSettings,
  saveSettings,
  type AppSettings,
  type Companion,
} from '../lib/settings';

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
      <section className="card settings-section" aria-labelledby="about-heading">
        <h2 id="about-heading" className="settings-heading">
          About you
        </h2>
        <div className="field">
          <label htmlFor="user-name">
            What should Thrive call you? <span className="optional">(optional)</span>
          </label>
          <input
            id="user-name"
            type="text"
            className="input"
            value={settings.userName}
            maxLength={USER_NAME_MAX}
            autoComplete="given-name"
            placeholder="Your first name or a nickname"
            onChange={(e) => update({ userName: e.target.value })}
          />
          <p className="hint">Used only for the greeting on Home. Leave it blank to be greeted without a name.</p>
        </div>
      </section>

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

      <section className="card settings-section" aria-labelledby="memory-heading">
        <h2 id="memory-heading" className="settings-heading">
          Companion memory
        </h2>
        <p className="hint">
          Let your Talk about this companion remember a few things between talks — short notes you approve, never your chats.
          Notes stay on this device and are only shared inside a talk you start.
        </p>
        <label className="switch-row">
          <span>Remember notes I approve</span>
          <input
            type="checkbox"
            role="switch"
            className="switch"
            checked={settings.companionMemory}
            onChange={(e) => update({ companionMemory: e.target.checked })}
          />
        </label>
        {settings.companionMemory ? (
          <Link to="/settings/memory" className="list-link">
            <span className="list-link-title">What your companion remembers</span>
            <span className="quick-action-arrow" aria-hidden="true">
              ›
            </span>
          </Link>
        ) : (
          <p className="hint">Off: nothing is remembered or suggested, and any notes you saved earlier aren't used.</p>
        )}
      </section>

      <section className="card settings-section" aria-labelledby="dreams-setting-heading">
        <h2 id="dreams-setting-heading" className="settings-heading">
          Dreams &amp; Nightmares
        </h2>
        <p className="hint">A place in your Journal to write down dreams that stay with you.</p>
        <label className="switch-row">
          <span>Show Dreams &amp; Nightmares</span>
          <input
            type="checkbox"
            role="switch"
            className="switch"
            checked={settings.showDreams}
            onChange={(e) => update({ showDreams: e.target.checked })}
          />
        </label>
        {!settings.showDreams && <p className="hint">Off: it doesn't appear anywhere. Any dreams you wrote earlier stay saved.</p>}
      </section>

      <section className="card settings-section" aria-labelledby="health-heading">
        <h2 id="health-heading" className="settings-heading">
          Health Journey
        </h2>
        <p className="hint">A small daily log in your Journal — calories, exercise, steps, water and medications/vitamins, all typed in by you.</p>
        <label className="switch-row">
          <span>Show Health Journey</span>
          <input
            type="checkbox"
            role="switch"
            className="switch"
            checked={settings.showHealth}
            onChange={(e) => update({ showHealth: e.target.checked })}
          />
        </label>
        {!settings.showHealth && <p className="hint">Off: it doesn't appear anywhere. Anything you logged earlier stays saved.</p>}
      </section>

      <MyDataSection
        onRestored={() => {
          setSettings(loadSettings());
          setStatus('idle');
        }}
      />

      <AccountSection />

      <footer className="quiet-footer">
        <Link to="/privacy">Privacy</Link>
      </footer>
    </PageShell>
  );
}
