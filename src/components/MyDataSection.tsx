import { useRef, useState, type ChangeEvent } from 'react';
import ConfirmDialog from './ConfirmDialog';
import {
  BackupError,
  applyBackup,
  backupFileName,
  buildBackup,
  buildReadableText,
  downloadFile,
  readBackupFile,
  readableFileName,
  type CheckedBackup,
} from '../lib/backup';
import { formatLongDay, listAllEntries, todayKey } from '../lib/journal';
import { getLastBackupAt, setLastBackupAt } from '../lib/settings';
import { listAllGoals } from '../lib/goals';
import { listStandalonePositives } from '../lib/positives';
import { listAllLetterIds } from '../lib/letters';
import { listCustomAffirmations } from '../lib/affirmations';
import { listHabits } from '../lib/habits';
import { listLists } from '../lib/lists';
import { listJourneys } from '../lib/journeys';
import { listMemories } from '../lib/memory';
import { applyMerge, describeCounts, planMerge, totalAdded, type MergePlan } from '../lib/merge';

const DAY_MS = 24 * 60 * 60 * 1000;

type Message = { kind: 'ok' | 'error'; text: string } | null;
type Current = {
  currentCount: number;
  currentGoals: number;
  currentPositives: number;
  currentLetters: number;
  currentAffirmations: number;
  currentHabits: number;
  currentLists: number;
  currentJourneys: number;
  currentMemories: number;
};

export default function MyDataSection({ onRestored }: { onRestored: () => void }) {
  const [lastBackupAt, setLastBackup] = useState(getLastBackupAt);
  const [busy, setBusy] = useState<'backup' | 'readable' | 'reading' | 'restoring' | 'merge-reading' | 'merging' | null>(null);
  const [mergePlan, setMergePlan] = useState<MergePlan | null>(null);
  const mergeInput = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<Message>(null);
  const [pending, setPending] = useState<(CheckedBackup & Current) | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const overdue = lastBackupAt !== null && Date.now() - Date.parse(lastBackupAt) > 30 * DAY_MS;
  const lastBackupLabel = lastBackupAt ? formatLongDay(todayKey(new Date(lastBackupAt))) : 'Never';

  async function handleBackup() {
    setBusy('backup');
    setMessage(null);
    try {
      const backup = await buildBackup();
      downloadFile(backupFileName(), JSON.stringify(backup, null, 2), 'application/json');
      setLastBackupAt(backup.exportedAt);
      setLastBackup(backup.exportedAt);
      setMessage({ kind: 'ok', text: `Backup downloaded (${backup.entries.length} entries).` });
    } catch {
      setMessage({ kind: 'error', text: "Couldn't create a backup. Please try again." });
    } finally {
      setBusy(null);
    }
  }

  async function handleReadable() {
    setBusy('readable');
    setMessage(null);
    try {
      downloadFile(readableFileName(), await buildReadableText(), 'text/plain;charset=utf-8');
      setMessage({ kind: 'ok', text: 'Readable copy downloaded.' });
    } catch {
      setMessage({ kind: 'error', text: "Couldn't create the readable copy. Please try again." });
    } finally {
      setBusy(null);
    }
  }

  // Step 1: pick + check the file. Nothing in the app changes here.
  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow picking the same file again later
    if (!file) return;
    setBusy('reading');
    setMessage(null);
    try {
      const [checked, current, goals, positives, letters, affirmations, habits, lists, journeys, memories] = await Promise.all([
        readBackupFile(file),
        listAllEntries(),
        listAllGoals(),
        listStandalonePositives(),
        listAllLetterIds(),
        listCustomAffirmations(),
        listHabits(),
        listLists(),
        listJourneys(),
        listMemories(),
      ]);
      setPending({
        ...checked,
        currentCount: current.length,
        currentGoals: goals.length,
        currentPositives: positives.length,
        currentLetters: letters.length,
        currentAffirmations: affirmations.length,
        currentHabits: habits.length,
        currentLists: lists.length,
        currentJourneys: journeys.length,
        currentMemories: memories.length,
      });
    } catch (err) {
      setMessage({
        kind: 'error',
        text: err instanceof BackupError ? err.message : "That file couldn't be read as a Thrive backup.",
      });
    } finally {
      setBusy(null);
    }
  }

  // Step 2: only after you confirm.
  async function handleRestore() {
    if (!pending) return;
    setBusy('restoring');
    try {
      await applyBackup(pending);
      const total = pending.entries.length;
      setPending(null);
      const goalsText = pending.goals ? `, ${pending.goals.length} ${pending.goals.length === 1 ? 'goal' : 'goals'}` : '';
      const positivesText = pending.positives
        ? `, ${pending.positives.length} saved ${pending.positives.length === 1 ? 'positive' : 'positives'}`
        : '';
      const lettersText = pending.letters
        ? `, ${pending.letters.length} ${pending.letters.length === 1 ? 'letter' : 'letters'}`
        : '';
      setMessage({
        kind: 'ok',
        text: `Restored ${total} ${total === 1 ? 'entry' : 'entries'}${goalsText}${positivesText}${lettersText}${
          pending.affirmations
            ? `, ${pending.affirmations.length} ${pending.affirmations.length === 1 ? 'affirmation' : 'affirmations'} of your own`
            : ''
        }${pending.habits ? `, ${pending.habits.length} ${pending.habits.length === 1 ? 'habit' : 'habits'}` : ''}${
          pending.lists ? `, ${pending.lists.length} ${pending.lists.length === 1 ? 'list' : 'lists'}` : ''
        }${pending.journeys ? `, ${pending.journeys.length} ${pending.journeys.length === 1 ? 'journey' : 'journeys'}` : ''}${
          pending.memories ? `, ${pending.memories.length} memory ${pending.memories.length === 1 ? 'note' : 'notes'}` : ''
        } and your settings.`,
      });
      onRestored();
    } catch {
      setPending(null);
      setMessage({ kind: 'error', text: "Restoring didn't finish, so nothing was changed. Please try again." });
    } finally {
      setBusy(null);
    }
  }

  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

  // Merge step 1: pick + check the file and work out what would be added. Nothing changes here.
  async function handleMergeFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy('merge-reading');
    setMessage(null);
    try {
      const plan = await planMerge(await readBackupFile(file));
      if (totalAdded(plan.added) === 0) {
        setMessage({
          kind: 'ok',
          text: `Everything in this backup is already here, so there's nothing to add (${plural(
            plan.skipped,
            'item',
            'items',
          )} already present).`,
        });
      } else {
        setMergePlan(plan);
      }
    } catch (err) {
      setMessage({
        kind: 'error',
        text: err instanceof BackupError ? err.message : "That file couldn't be read as a Thrive backup.",
      });
    } finally {
      setBusy(null);
    }
  }

  // Merge step 2: only after you tap Add.
  async function handleMerge() {
    if (!mergePlan) return;
    setBusy('merging');
    try {
      await applyMerge(mergePlan);
      setMessage({
        kind: 'ok',
        text: `Added ${describeCounts(mergePlan.added)}. Skipped ${plural(mergePlan.skipped, 'item', 'items')} already here.`,
      });
      onRestored();
    } catch {
      setMessage({ kind: 'error', text: "Adding didn't finish, so nothing was changed. Please try again." });
    } finally {
      setMergePlan(null);
      setBusy(null);
    }
  }

  function restoreMessage(b: CheckedBackup & Current) {
    const has = [plural(b.quickCount, 'quick entry', 'quick entries'), plural(b.talkCount, 'journal page', 'journal pages')];
    if (b.goals) has.push(plural(b.goals.length, 'goal', 'goals'));
    if (b.positives) has.push(plural(b.positives.length, 'saved positive', 'saved positives'));
    if (b.letters) has.push(plural(b.letters.length, 'Time Capsule letter', 'Time Capsule letters'));
    if (b.affirmations) has.push(plural(b.affirmations.length, 'affirmation of your own', 'affirmations of your own'));
    if (b.habits) has.push(plural(b.habits.length, 'habit', 'habits'));
    if (b.lists) has.push(plural(b.lists.length, 'list', 'lists'));
    if (b.journeys) has.push(plural(b.journeys.length, 'Fear & Confidence journey', 'Fear & Confidence journeys'));
    if (b.memories) has.push(plural(b.memories.length, 'companion memory note', 'companion memory notes'));
    const saved = b.exportedAt ? `, saved ${formatLongDay(todayKey(new Date(b.exportedAt)))}` : '';
    const replaced = [plural(b.currentCount, 'entry', 'entries')];
    if (b.goals) replaced.push(plural(b.currentGoals, 'goal', 'goals'));
    if (b.positives) replaced.push(plural(b.currentPositives, 'saved positive', 'saved positives'));
    if (b.letters) replaced.push(plural(b.currentLetters, 'letter', 'letters'));
    if (b.affirmations) replaced.push(plural(b.currentAffirmations, 'affirmation of your own', 'affirmations of your own'));
    if (b.habits) replaced.push(plural(b.currentHabits, 'habit', 'habits'));
    if (b.lists) replaced.push(plural(b.currentLists, 'list', 'lists'));
    if (b.journeys) replaced.push(plural(b.currentJourneys, 'journey', 'journeys'));
    if (b.memories) replaced.push(plural(b.currentMemories, 'memory note', 'memory notes'));
    const missing = [
      !b.goals && 'goals',
      !b.positives && 'saved positives',
      !b.letters && 'Time Capsule letters',
      !b.affirmations && 'affirmations of your own',
      !b.habits && 'habits',
      !b.lists && 'lists',
      !b.journeys && 'Fear & Confidence journeys',
      !b.memories && 'companion memory notes',
    ]
      .filter(Boolean)
      .join(' or ');
    const goalsNote = missing ? ` This older backup has no ${missing}, so your current ones will stay as they are.` : '';
    return `This backup has ${has.join(', ')}${saved}. Restoring will replace everything currently in Thrive on this device — ${replaced.join(', ')} and your settings.${goalsNote} This can't be undone, so download a backup of what's here first if you might want it.`;
  }

  return (
    <section className="card settings-section" aria-labelledby="my-data-heading">
      <h2 id="my-data-heading" className="settings-heading">
        My data
      </h2>
      <p className="hint">Your journal lives only on this device. A backup keeps a copy you control.</p>

      <div className="backup-status">
        <span>
          Last backup: <strong>{lastBackupLabel}</strong>
        </span>
        {overdue && <span className="hint">It's been a while — a fresh backup takes a few seconds.</span>}
      </div>

      <div className="data-actions">
        <button type="button" className="btn-primary" onClick={handleBackup} disabled={busy !== null}>
          {busy === 'backup' ? 'Preparing…' : 'Download backup'}
        </button>
        <button type="button" className="btn-secondary" onClick={() => fileInput.current?.click()} disabled={busy !== null}>
          {busy === 'reading' ? 'Checking file…' : 'Restore from backup'}
        </button>
        <button type="button" className="btn-secondary" onClick={() => mergeInput.current?.click()} disabled={busy !== null}>
          {busy === 'merge-reading' ? 'Checking file…' : 'Add a backup to my data'}
        </button>
        <button type="button" className="btn-secondary" onClick={handleReadable} disabled={busy !== null}>
          {busy === 'readable' ? 'Preparing…' : 'Download readable copy'}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={handleFile}
        />
        <input
          ref={mergeInput}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={handleMergeFile}
        />
      </div>

      <p className={message?.kind === 'error' ? 'form-error' : 'save-status'} role={message?.kind === 'error' ? 'alert' : 'status'}>
        {message?.text ?? ''}
      </p>

      {pending && (
        <ConfirmDialog
          title="Replace everything with this backup?"
          message={restoreMessage(pending)}
          confirmLabel="Replace everything"
          busy={busy === 'restoring'}
          busyLabel="Restoring…"
          onConfirm={handleRestore}
          onCancel={() => setPending(null)}
        />
      )}

      {mergePlan && (
        <ConfirmDialog
          title="Add this backup to your data?"
          message={`This will ADD anything from the backup that isn't already here. Nothing will be deleted or overwritten. It would add ${describeCounts(
            mergePlan.added,
          )}, and skip ${plural(mergePlan.skipped, 'item', 'items')} that ${mergePlan.skipped === 1 ? 'is' : 'are'} already here. Your settings stay as they are.`}
          confirmLabel="Add"
          busy={busy === 'merging'}
          busyLabel="Adding…"
          tone="gentle"
          onConfirm={handleMerge}
          onCancel={() => setMergePlan(null)}
        />
      )}
    </section>
  );
}
