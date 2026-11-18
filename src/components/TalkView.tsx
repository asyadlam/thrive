import { formatTime, talkEntryLabel, type TalkEntry } from '../lib/journal';

type Props = { entry: TalkEntry; onEdit: () => void; onDelete: () => void };

export default function TalkView({ entry, onEdit, onDelete }: Props) {
  return (
    <article className="card saved-entry" aria-label="Journal page">
      <h2 className={`talk-view-title${entry.title ? '' : ' untitled'}`}>{talkEntryLabel(entry)}</h2>
      <p className="talk-view-body">{entry.body}</p>
      <div className="saved-footer">
        <span className="hint">Last saved at {formatTime(entry.updatedAt)}</span>
        <div className="entry-actions">
          <button type="button" className="btn-danger-outline" onClick={onDelete}>
            Delete
          </button>
          <button type="button" className="btn-secondary" onClick={onEdit}>
            Edit
          </button>
        </div>
      </div>
    </article>
  );
}
