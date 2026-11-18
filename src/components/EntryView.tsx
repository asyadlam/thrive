import { formatTime, type QuickEntry } from '../lib/journal';

type Props = { entry: QuickEntry; onEdit: () => void };

export default function EntryView({ entry, onEdit }: Props) {
  return (
    <article className="card saved-entry" aria-label="Today's quick entry">
      <div className="saved-row">
        <span className="saved-label">Mood</span>
        <span className="mood-pill">{entry.mood}</span>
      </div>

      {entry.positives.length > 0 && (
        <div className="saved-block">
          <span className="saved-label">One positive</span>
          <ul>
            {entry.positives.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      {entry.note && (
        <div className="saved-block">
          <span className="saved-label">Short note</span>
          <p className="saved-note">{entry.note}</p>
        </div>
      )}

      {entry.intention && (
        <div className="saved-block">
          <span className="saved-label">Tomorrow's intention</span>
          <p>{entry.intention}</p>
        </div>
      )}

      <div className="saved-footer">
        <span className="hint">Last saved at {formatTime(entry.updatedAt)}</span>
        <button type="button" className="btn-secondary" onClick={onEdit}>
          Edit
        </button>
      </div>
    </article>
  );
}
