# Thrive 🌱

Hi, I'm Asya. I designed Thrive and directed its build, feature by feature, with an AI coding agent doing the typing. It's the journal app I wanted for myself.

Thrive is a calm place to write about your day, keep the good moments, and work on things gently at your own pace. Everything you write stays on your device. There are no accounts. If you talk to the companion, it only ever sees the one page you show it, and it only remembers things you approved first.

**Live app:** https://thrive-psi-nine.vercel.app

![Thrive logo](public/logo-wordmark.png)

<!-- Screenshots to add: Home, a Journal entry, Talk about this, a Journey page -->

## Why I made it

A programme called "The Thrive Program" helped me a lot emotionally, more than therapy ever did, and writing has always been the thing that helps me most. So I named the app after it, and built the journal I wished I had back then.

It's also my portfolio project for learning how to direct AI coding agents well. I write the specs, the privacy rules and the prompts, and I check every step live before moving on to the next one.

## What is inside

**Home** is kept very simple on purpose. Your pet says hello, there is one quick check in button, todays affirmation, and a positive to remember.

**Journal** has quick entries with a mood, positives, a short note and an intention for tomorrow, and longer pages for when you need to talk about it. There is a calendar to look back on past days, and a Time Capsule where you can seal a letter to your future self and open it on a date, or when something happens, like getting your first job.

**Talk about this** is a chat with a companion about a journal page. It listens first, and it will rant with you when that is what you need. Solutions come later, and only if you want them. Chats are not saved unless you save a short summary to the entry, and each saved summary keeps its transcript on your device with a download button. The companion can remember small notes between talks, but only notes it suggests and you approve. You can read them, edit them or delete them any time in Settings.

**Growth** is for positives and journeys. A journey is one thing you are working on, all in one place: the goal, the small steps toward it, and the habits you want to change along the way.

**My Life** is the profile tab. About me, measurements if you want them (you add your own kinds, and lengths and weights show both units), a wishlist with a "got it" moment, a bucket list, and your own lists (like for groceries, to-do, packing, ...). If you couldn't tell... I loooove lists.

**Learn** has six short lessons, about two minutes each, based on some of the beliefs that helped me. They are not medical suggestions.
The content shared in the Learn section is based on personal experiences and practices that have helped me. It is intended for personal growth purposes only and should not be considered medical or professional advice. Mostly because they were made for me.

You can also pick a companion pet: Hippo, Cat, Platypus, Panda, Dog, or none at all. The pet sits in the page headers, and tapping it gives you little hearts, sparkles and kind messages. A Get Help button is always in the header, just in case. Right now it is empty because the web app is just for me. It is there in case I ever wanted to make it more publicly available.

## Privacy, because it matters

• Your entries, journeys, summaries, transcripts and memory notes live in a database on your device. No Thrive server holds your data.
• Backups are yours. You can download one, restore one, or merge one into your data without overwriting what you already have. There is also a readable copy you can export.
• Dictation sends only your audio clip to be transcribed, and the audio is never stored. A talk sends only the entry you approved, plus memory notes only if you turned memory on and left it on for that chat.
• The server functions log nothing. API keys live only as secret settings on the host, never in the code.
• The AI provider is just configuration, so I can switch providers later by changing settings instead of code.

## Tech, briefly

Vite, React and TypeScript. It is an installable web app, and data is stored locally in IndexedDB. Vercel hosts it and runs two small server functions, one for dictation and one for talks. Dictation uses Whisper through Groq, and talks use an open chat model through Groq as well. The design is one font (Nunito), a cream background, sage colors and soft white cards on every page.

## Status

I use Thrive every day, and it does everything from my original concept, plus a few things I thought of while using it. My family can try it too, since every phone keeps its own data. The next step, when I am ready for it, is optional accounts with cloud backup, so moving to a new device stops being a manual restore job. Real phone widgets would need a native app step, so those are just thoughts as of now.

## License

Personal project, all rights reserved for now.
