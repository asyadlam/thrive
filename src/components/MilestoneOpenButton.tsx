import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ConfirmDialog from './ConfirmDialog';
import { confirmMilestone } from '../lib/letters';

/** "This happened — open it" for milestone letters only. Unseals only after a gentle confirmation. */
export default function MilestoneOpenButton({ id, milestone }: { id: string; milestone: string }) {
  const navigate = useNavigate();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function handleConfirm() {
    setBusy(true);
    try {
      if (await confirmMilestone(id)) {
        navigate(`/journal/time-capsule/${id}`);
        return;
      }
      setFailed(true);
    } catch {
      setFailed(true);
    }
    setBusy(false);
    setAsking(false);
  }

  return (
    <>
      <button type="button" className="btn-secondary btn-small milestone-open" onClick={() => setAsking(true)}>
        This happened — open it
      </button>
      {failed && (
        <span className="form-error milestone-error" role="alert">
          Couldn't open this letter. Please try again.
        </span>
      )}
      {asking && (
        <ConfirmDialog
          title="Has this happened?"
          message={`“${milestone}” Once opened, the letter can't be sealed again.`}
          confirmLabel="Yes, open it"
          busy={busy}
          busyLabel="Opening…"
          tone="gentle"
          onConfirm={handleConfirm}
          onCancel={() => setAsking(false)}
        />
      )}
    </>
  );
}
