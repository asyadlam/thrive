# Thrive 🌱

Hi, I'm Asya. I designed Thrive and directed its build, feature by feature, with an AI coding agent doing the typing. It's the journal app I wanted for myself.

Thrive is a calm place to write about your day, keep the good moments, and work on things gently at your own pace. Everything you write lives on your device first. An account is optional, and it only adds a cloud backup. If you talk to the companion, it only ever sees the one page you show it, and it only remembers things you approved first.

**Live app:** https://thrive-psi-nine.vercel.app

![Thrive logo](public/logo-wordmark.png)

## Why I made it

A programme called "The Thrive Program" helped me a lot emotionally, more than therapy ever did, and writing has always been the thing that helps me most. So I named the app after it, and built the journal I wished I had back then.

It's also my portfolio project for learning how to direct AI coding agents well. I write the specs, the privacy rules and the prompts, and I check every step live before moving on to the next one.

## What is inside

**Home** is kept very simple on purpose. Your pet says hello, there is one button that takes you to today's Daily Sprout page, todays affirmation, and a positive to remember.

**Daily Sprout** is my daily page. At the top I write one little intention for the day, then the page holds my food with a calorie ring, my steps and exercise, water, medications and my to dos. The quick entry lives at the bottom of this page, with a mood, positives and a short note. There is also a microphone button, Ask Thrive, so I can just say what I ate or did and it fills the page in for me.

**Journal** is for the longer pages, when a quick entry is not enough and you need to talk about it. The calendar lets you look back on past days, and your quick entries from Daily Sprout show up there too. There is also a Time Capsule where you can seal a letter to your future self and open it on a date, or when something happens, like getting your first job.

**Talk about this** is a chat with a companion about a journal page. It listens first, and it will rant with you when that is what you need. Solutions come later, and only if you want them. Chats are not saved unless you save a short summary to the entry, and each saved summary keeps its transcript on your device with a download button. The companion can remember small notes between talks, but only notes it suggests and you approve. You can read them, edit them or delete them any time in Settings.

**Growth** is for positives and journeys. A journey is one thing you are working on, all in one place: the goal, the small steps toward it, and the habits you want to change along the way. Learn lives inside Growth now too.

**My Life** is the profile tab. About me, measurements if you want them (you add your own kinds, and lengths and weights show both units), a wishlist with a "got it" moment, a bucket list, and your own lists (like for groceries, packing, ...). If you couldn't tell... I loooove lists.

**Learn**, which lives inside Growth now, has six short lessons, about two minutes each, based on some of the beliefs that helped me. They are not medical suggestions.
The content shared in the Learn section is based on personal experiences and practices that have helped me. It is intended for personal growth purposes only and should not be considered medical or professional advice. Mostly because they were made for me.

You can also pick a companion pet: Hippo, Cat, Platypus, Panda, Dog, or none at all. The pet sits in the page headers, and tapping it gives you little hearts, sparkles and kind messages. Each pet has different poses now, so it can listen while you talk, celebrate a good moment, or hold a heart on a rough day. A Get Help button is always in the header, just in case. It has the crisis lines on it, and a note that Thrive is a journal, not a crisis service.

<img width="499" height="691" alt="Screenshot 2026-11-25 at 8 59 01 PM" src="https://github.com/user-attachments/assets/0fa555d0-17ff-4be1-932d-d82e64772925" />

<img width="499" height="690" alt="Screenshot 2026-11-25 at 9 00 03 PM" src="https://github.com/user-attachments/assets/fc61e894-4c00-4e70-a63f-f6547332c76d" />

## Privacy, because it matters

• Your entries, journeys, summaries, transcripts and memory notes live in a database on your device. If you make an account, a copy of your backup is kept in the cloud too, so you can get everything back on a new device. That only happens if you make an account.
• Backups are yours. You can download one, restore one, or merge one into your data without overwriting what you already have. There is also a readable copy you can export. With an account, a cloud backup is saved when you open the app, and there is a Back up to cloud button for when you want it done right away. It is a snapshot, not live sync.
• Dictation sends only your audio clip to be transcribed, and the audio is never stored. A talk sends only the entry you approved, plus memory notes only if you turned memory on and left it on for that chat.
• The server functions log nothing. API keys live only as secret settings on the host, never in the code.
• The AI provider is just configuration, so I can switch providers later by changing settings instead of code.

## Tech, briefly

Vite, React and TypeScript. It is an installable web app, and data is stored locally in IndexedDB. Vercel hosts it and runs two small server functions, one for dictation and one for talks. Dictation uses Whisper through Groq, and talks use an open chat model through Groq as well. Supabase handles the optional accounts and keeps the cloud backups. The design is one font (Nunito), a cream background, sage colors and soft white cards on every page.

## Status

I use Thrive every day, and it does everything from my original concept, plus a few things I thought of while using it. My family is trying it too. The newest parts are the optional accounts with cloud backup and signing in with Google, so moving to a new device is not a manual restore job anymore, and a forgot password flow for email accounts. Real phone widgets would need a native app step, so those are just thoughts as of now.

## License

Personal project, all rights reserved for now.
