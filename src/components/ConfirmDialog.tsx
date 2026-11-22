import { useEffect, useRef } from 'react';

type Props = {
  title: string;
  message: string;
  confirmLabel: string;
  /** Text for the safe choice (default "Cancel"). */
  cancelLabel?: string;
  busy?: boolean;
  /** Button text while busy (default "Deleting…"). */
  busyLabel?: string;
  /** "danger" (default) for deletes and replacing; "gentle" for a calm yes. */
  tone?: 'danger' | 'gentle';
  onConfirm: () => void;
  onCancel: () => void;
};

/** Small in-app "are you sure?" dialog. Render it only while it should be open. */
export default function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancel',
  busy,
  busyLabel = 'Deleting…',
  tone = 'danger',
  onConfirm,
  onCancel,
}: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus(); // safest choice gets focus first
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [onCancel]);

  return (
    <div className="dialog-backdrop" onClick={busy ? undefined : onCancel}>
      <div
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="confirm-title">{title}</h2>
        <p id="confirm-message">{message}</p>
        <div className="dialog-actions">
          <button ref={cancelRef} type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button type="button" className={tone === 'gentle' ? 'btn-primary' : 'btn-danger'} onClick={onConfirm} disabled={busy}>
            {busy ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
