# Thrive 🌱

A calm, private mental-state journal — designed, directed, and built by Asya.

Thrive is a personal wellbeing app that lives entirely on your device: daily journaling, positives worth remembering, gentle goal and habit support, and an AI companion you can talk through a journal entry with — one that listens first, rants with you when that's what's needed, and only remembers what you explicitly approve.

**Live app:** https://thrive-psi-nine.vercel.app

![Thrive logo](public/logo-wordmark.png)

<!-- Add 3–4 screenshots here: Home, a Journal entry, Talk about this, Growth -->

## What it does

**Home** — a deliberately minimal start screen: your companion pet with a time-of-day greeting, one Quick check-in pill, today's affirmation, and a positive to remember.

**Journal**
- *Quick entry* — mood, up to three positives, a short note, tomorrow's intention
- *Need to talk about it* — a long-form page with AI dictation and **Talk about this**
- Calendar look-back: dots on entry days, tap any day to revisit, edit, or delete
- **Time Capsule** — sealed letters to your future self, opened on a date *or* "when something happens" (e.g. "I got my first job")

**Talk about this** — a per-entry AI companion chat
- Opens only after an explicit consent sheet, and reads *only that entry*
- Listens first: reflects your own words back, asks specific questions, rants *with* you about the situation — solutions only when you ask
- Varied openings, a kind closing with a word for tomorrow
- Chats are **not saved** by default. You may save a short summary to the entry (multiple talks = multiple summaries, stacked under "From your talk"), and each saved summary keeps its full transcript on-device with a **Download transcript** button
- **Companion memory** (opt-in, off by default): short notes the companion may remember between talks. Notes are *proposed* after a talk and saved only if you approve them; you can view, edit, delete, or forget them all at any time in Settings

**Growth** — Positives Tracker (auto-collects the positives from your quick entries), Affirmations (built-ins + your own), and a Fear & Confidence Journey: a ladder of small steps toward something that feels hard, at your pace

**My Life** — Goals (with your "why"), Habits as gentle swaps ("When this happens… instead, I can…"), and personal Lists

**Learn** — six short, beliefs-based lessons (about 2 minutes each)

**Companion pets** — an optional companion (Hippo, Cat, Platypus, Sprout, or None) that lives in each page header and reacts to taps with little hearts, sparkles, and kind messages. Never guilt-based: a missed day is always "welcome back"

**Always there** — a Get Help button in the header, and Settings that let you show/hide sections without deleting anything

## Privacy by design

Thrive was built privacy-first, and the architecture enforces it rather than promising it:

- **Local-first.** All entries, goals, summaries, transcripts, and memory notes live in IndexedDB on your device. There are no accounts and no Thrive server storing your data.
- **Backups you own.** One-tap backup export/import, including a *merge* import that adds what's missing and never overwrites or deletes. Readable-copy export included.
- **AI calls are narrow and consented.** Dictation sends only your audio clip; a talk sends only the one entry you approved (plus memory notes, only if memory is on and you leave it on for that chat). Audio is never stored; the serverless functions log nothing — no keys, no entry text, no conversations.
- **Keys stay server-side.** API keys exist only as Vercel environment secrets, are never in the codebase (verified: the key's fingerprint appears nowhere in this repo), and the functions accept requests only from the app's own domain, with per-visitor rate limits.
- **Provider-swappable.** The AI provider is configuration, not code: base URL, model, and key are environment variables (currently Groq's free tier — Whisper for dictation, an open chat model for talks), so switching providers is a settings change.

## Tech

- **Frontend:** Vite + React + TypeScript, installable PWA, IndexedDB storage
- **Hosting/functions:** Vercel (static app + `/api/transcribe` and `/api/talk` serverless functions)
- **AI:** Groq API (OpenAI-compatible) — Whisper large-v3-turbo for dictation; `openai/gpt-oss-120b` for the companion
- **Design:** one font (Nunito), cream `#FAF6EF`, sage palette, soft cards — one consistent design language across every page

## Building it

Thrive is also a portfolio project in **directing AI coding agents**: the app was specified feature-by-feature (privacy rules, consent flows, tone guidelines for the companion, data-merging backup rules), and every build step was verified live before the next began. The codebase is the output; the spec, the prompts, and the verification discipline are the portfolio.

The name is a tribute to the Thrive programme, which helped the author more than traditional therapy did — this app is the journal she wished she'd had alongside it.

## Status

Feature-complete against the original concept (November 2026) and in daily personal use. Parked for later, deliberately: real home-screen widgets (needs a native-app step) and optional cloud sync (only if Thrive ever opens to other users — the local-first data layer, record IDs, and backup format are already the migration path).

## License

Personal project — all rights reserved for now. (A license may be chosen if Thrive is ever released publicly.)
