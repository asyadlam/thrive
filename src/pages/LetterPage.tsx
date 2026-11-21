import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import PageShell from '../components/PageShell';
import ConfirmDialog from '../components/ConfirmDialog';
import { formatLongDay, todayKey } from '../lib/journal';
import { deleteLetter, openLetter, type OpenResult } from '../lib/letters';
import { letterTitle } from './TimeCapsulePage';

export default function LetterPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [result, setResult] = useState<OpenResult | null>(null);
  const [failed, setFailed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let active = true;
    openLetter(id)
      .then((r) => active && setResult(r))
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, [id]);

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteLetter(id);
      navigate('/journal/time-capsule', { replace: true });
    } catch {
      setDeleting(false);
      setConfirming(false);
    }
  }

  const back = { to: '/journal/time-capsule', label: 'Time Capsule' };

  if (failed) {
    return (
      <PageShell title="Letter" subtitle="" back={back}>
        <div className="card form-error" role="alert">
          Couldn't read this letter on this device.
        </div>
      </PageShell>
    );
  }
  if (!result) {
    return (
      <PageShell title="Letter" subtitle="" back={back}>
        <div className="card placeholder">Loading…</div>
      </PageShell>
    );
  }
  if (result.state === 'missing') {
    return (
      <PageShell title="Letter" subtitle="" back={back}>
        <div className="card placeholder">This letter isn't on this device anymore.</div>
      </PageShell>
    );
  }
  if (result.state === 'sealed') {
    // The text was never loaded: openLetter() leaves it out before the unlock date.
    return (
      <PageShell title={letterTitle(result.letter)} subtitle="Still sealed" back={back}>
        <div className="card placeholder">This letter opens on {formatLongDay(result.letter.unlockDate)}.</div>
      </PageShell>
    );
  }

  const { letter } = result;
  return (
    <PageShell
      title={letterTitle(letter)}
      subtitle={`Written ${formatLongDay(todayKey(new Date(letter.createdAt)))}`}
      back={back}
    >
      <article className="card letter-read">
        <p className="letter-read-body">{letter.body}</p>
        <div className="saved-footer">
          <span className="hint">Sealed until {formatLongDay(letter.unlockDate)}</span>
          <button type="button" className="btn-danger-outline" onClick={() => setConfirming(true)}>
            Delete
          </button>
        </div>
      </article>
      {confirming && (
        <ConfirmDialog
          title="Delete this letter?"
          message={`"${letterTitle(letter)}" will be removed from this device. This can't be undone.`}
          confirmLabel="Delete"
          busy={deleting}
          onConfirm={handleDelete}
          onCancel={() => setConfirming(false)}
        />
      )}
    </PageShell>
  );
}
