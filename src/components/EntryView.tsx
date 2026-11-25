import { Link } from 'react-router-dom';
import { formatTime, type QuickEntry } from '../lib/journal';

/**
 * A saved quick entry. On Daily Sprout it has Edit (and Delete); elsewhere it's read-only with "Open in Daily
 * Sprout" (`openInSprout`), since quick entries are created and edited only there.
 */
type Props = { entry: QuickEntry; onEdit?: () => void; onDelete?: () => void; openInSprout?: boolean };

export default function EntryView({ entry, onEdit, onDelete, openInSprout }: Props) {
  return (
    <article className="card saved-entry" aria-label="Quick entry">
      <div className="saved-row">
        <span className="saved-label">Mood</span>
        <span className="mood-pill">{entry.mood}</span>
      </div>

      {entry.positives.length > 0 && (
        <div className="saved-block">
          <span className="saved-label">Positive</span>
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
        <div className="entry-actions">
          {onDelete && (
            <button type="button" className="btn-danger-outline" onClick={onDelete}>
              Delete
            </button>
          )}
          {onEdit && (
            <button type="button" className="btn-secondary" onClick={onEdit}>
              Edit
            </button>
          )}
          {openInSprout && (
            <Link to={`/sprout/${entry.date}`} className="btn-secondary">
              Open in Daily Sprout
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}
