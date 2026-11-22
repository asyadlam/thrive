import { formatTalkSummaryDate, talkSummariesOf, type TalkEntry } from '../lib/journal';

/** "From your talk": every summary saved on this page, newest first, each as its own card. */
export default function TalkSummaries({ entry }: { entry: TalkEntry }) {
  const summaries = [...talkSummariesOf(entry)].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (summaries.length === 0) return null;
  return (
    <section className="talk-summaries" aria-labelledby={`from-talk-${entry.id}`}>
      <h3 id={`from-talk-${entry.id}`} className="saved-label">
        From your talk
      </h3>
      <ul className="talk-summary-list">
        {summaries.map((s) => (
          <li key={s.id} className="talk-summary">
            <span className="talk-summary-date">{formatTalkSummaryDate(s.createdAt)}</span>
            <p>{s.text}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
