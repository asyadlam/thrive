/*
  Thrive's Learn library.

  This is the ONLY file you need to edit to change or add lessons.
  - `id` must be unique and use only lowercase letters, numbers and dashes (it's used in the web address).
  - `description` is the one line shown on the lesson card.
  - Each section has a heading and one or more paragraphs.
  - Read time is worked out automatically from the length of the text.

  Keep lessons general wellbeing information: no diagnoses and no treatment instructions.
*/

export type LessonSection = {
  heading: string;
  paragraphs: string[];
};

export type Lesson = {
  id: string;
  title: string;
  description: string;
  sections: LessonSection[];
};

export const LESSONS: Lesson[] = [
  {
    id: 'feelings-arent-facts',
    title: "Feelings aren't facts",
    description: 'Feelings are real signals, but they are not always accurate reports.',
    sections: [
      {
        heading: 'Real, but not always right',
        paragraphs: [
          "Every feeling you have is real. If you feel nervous, you really are nervous. But a feeling is not the same thing as a fact about the world. Feeling sure that a conversation went badly doesn't mean it did. Feeling like you don't belong somewhere doesn't prove that you don't.",
          'Feelings are fast. They are your mind and body making a quick guess, and quick guesses are useful, but they can be wrong.',
        ],
      },
      {
        heading: 'Where feelings come from',
        paragraphs: [
          'Feelings are shaped by many things that have nothing to do with the situation in front of you: how much you slept, whether you have eaten, how stressed the week has been, and what happened the last time something similar happened.',
          'That is why the same text message can feel harmless one day and alarming the next.',
        ],
      },
      {
        heading: 'Holding both',
        paragraphs: [
          'You don\'t have to argue with a feeling or push it away. You can make a little room around it instead. Try putting it into words: "I notice I\'m feeling like a failure right now." That is different from "I am a failure," and the difference matters.',
          'Then gently ask: what else might be true? Is there anything this feeling is leaving out?',
        ],
      },
      {
        heading: 'A small step',
        paragraphs: [
          'Next time a strong feeling shows up, try three things: notice it, name it, and think of one other possible explanation. The feeling may not go away, and that is okay. The goal is simply to let it be one voice in the room, not the only one.',
        ],
      },
      {
        heading: 'When a feeling is loud',
        paragraphs: [
          'Some feelings arrive with a lot of force. A strong feeling deserves care, and it can still be checked. If you can, it may help to wait before making a big decision while a feeling is at its loudest, and come back to it once things have settled a little.',
        ],
      },
    ],
  },
  {
    id: 'urges-rise-and-pass',
    title: 'Urges rise, peak, and pass',
    description: 'Strong urges can feel endless, but they usually move like a wave.',
    sections: [
      {
        heading: 'The shape of an urge',
        paragraphs: [
          "Whether it is the urge to check your phone, snack, send a message, or avoid something, urges tend to follow a shape. They build, they reach a peak, and then they ease off. Often this happens over minutes rather than hours, though it varies from person to person and moment to moment.",
        ],
      },
      {
        heading: 'Why it feels permanent',
        paragraphs: [
          'At the top of the wave, your mind tends to say that the only way to feel better is to act on the urge right now. It can feel like the discomfort will keep growing forever if you don\'t.',
          'But the peak is usually the hardest part, not the start of something that never ends.',
        ],
      },
      {
        heading: 'Riding the wave',
        paragraphs: [
          'Instead of fighting the urge or giving in straight away, you can try simply watching it. Where do you feel it in your body? Is it getting stronger, staying the same, or starting to fade?',
          'It can help to give yourself a small delay: "I can wait five minutes and see." Slow breaths, a glass of water, or a short walk can keep you company while the wave passes.',
          'Each time an urge rises and falls without you acting on it, you learn something: that you can feel it and still be okay.',
        ],
      },
      {
        heading: 'Be gentle with yourself',
        paragraphs: [
          "Sometimes you will act on the urge anyway. That isn't failure. It's information. You can notice what happened, and try riding the wave again next time.",
        ],
      },
      {
        heading: 'Try this',
        paragraphs: [
          'Next time you notice an urge, give it a number from 1 to 10. Check again in a few minutes. You may find the number moves more than you expected, sometimes up and often down. Noticing that change is a way of seeing the wave for yourself.',
        ],
      },
    ],
  },
  {
    id: 'small-steps-count',
    title: 'Small steps count',
    description: 'Change usually happens in pieces too small to feel impressive.',
    sections: [
      {
        heading: 'Why small works',
        paragraphs: [
          'Big changes often depend on motivation, and motivation comes and goes. Some days you will have plenty. Some days you will have almost none.',
          'Small steps need less of it. A step small enough to take on a hard day is a step you can keep taking.',
        ],
      },
      {
        heading: 'Making a step smaller',
        paragraphs: [
          'If something keeps not happening, it may simply be too big for right now. Try shrinking it until it feels almost too easy. "Go for a run" might become "put on my shoes and step outside." "Clean my room" might become "clear one surface."',
          'Often, once you have started, a little more follows. And if it doesn\'t, the small step still counts.',
        ],
      },
      {
        heading: 'Noticing what you did',
        paragraphs: [
          'Our minds are quick to notice what is left undone and slow to notice what we managed. It can help to jot down small things you did, even ones that seem too minor to mention. Over time, they add up to a picture you might not otherwise see.',
        ],
      },
      {
        heading: 'When a day gets away from you',
        paragraphs: [
          'Missing a day doesn\'t erase the steps you have already taken. There\'s nothing to start over. You can simply pick up the next small step whenever you are ready.',
        ],
      },
      {
        heading: 'Try this',
        paragraphs: [
          "Pick one thing you have been putting off. Write down the smallest possible first step, one that would take less than two minutes. Do just that, and let it be enough for today. If you feel like doing more, that's a bonus, not the goal.",
        ],
      },
    ],
  },
  {
    id: 'the-reassurance-loop',
    title: 'The reassurance loop',
    description: 'Why asking "are you sure?" can bring relief that doesn\'t last.',
    sections: [
      {
        heading: 'What it looks like',
        paragraphs: [
          'Reassurance seeking is something everyone does sometimes. It can look like asking someone the same question again, rereading a message to check its tone, looking things up online over and over, or going back to check that something is really done.',
        ],
      },
      {
        heading: 'Why it\'s so tempting',
        paragraphs: [
          'Reassurance works, at first. When a worry is loud, hearing "it\'s fine" brings a wave of relief. It makes sense that we reach for it.',
        ],
      },
      {
        heading: 'How the loop tightens',
        paragraphs: [
          'The trouble is that the relief often doesn\'t last. The doubt comes back, sometimes a little sooner, and the reassurance has to be a little stronger to work. Without meaning to, the mind learns that a doubt is something that must be answered before you can feel okay.',
          'Over time, the loop can start to take up more and more space.',
        ],
      },
      {
        heading: 'Loosening it gently',
        paragraphs: [
          'You don\'t have to stop asking for support. Support from people you trust is a good thing. The aim is just to notice the loop when it starts.',
          'When you feel the pull to check or ask again, you might name it: "This is the reassurance loop." You could try waiting a little before checking, and see whether the worry softens on its own. Living with a bit of uncertainty is uncomfortable, and it usually gets easier with practice.',
          'If the loop is taking up a lot of your day, talking it through with someone you trust, or with a professional, can help.',
        ],
      },
      {
        heading: 'Try this',
        paragraphs: [
          "For one day, simply notice the moments you feel the pull to check or ask again. You don't need to change anything yet. Seeing the pattern clearly is a useful first step on its own.",
        ],
      },
    ],
  },
  {
    id: 'growing-a-comfort-zone',
    title: 'Growing a comfort zone, gently',
    description: 'Stretching a little at a time, instead of leaping all at once.',
    sections: [
      {
        heading: 'Three zones',
        paragraphs: [
          'It can help to picture three zones. The comfort zone is where things feel familiar and easy. The stretch zone is a little uncomfortable but manageable. The overwhelm zone is where things feel like too much.',
          'Growth tends to happen in the middle: in the stretch zone.',
        ],
      },
      {
        heading: 'Why stretch instead of leap',
        paragraphs: [
          'Jumping straight into something overwhelming can leave you feeling that it was just as hard as you feared. Small stretches tell a different story: "That was uncomfortable, and I handled it."',
          'Each time you handle a stretch, it becomes a little more familiar, and your comfort zone quietly grows.',
        ],
      },
      {
        heading: 'Building a ladder',
        paragraphs: [
          'If there is something you would like to feel more comfortable with, try writing a few steps from easiest to hardest. For speaking up in class, the first step might be asking a classmate a question, long before answering in front of everyone.',
          'Start with a step that feels a bit nervous but doable. Stay with it long enough to notice the discomfort settle a little before moving on.',
        ],
      },
      {
        heading: 'Your pace is the right pace',
        paragraphs: [
          'There is no deadline. Some steps take one try, others take many. Going back a step on a hard day is part of the process, not a sign that it isn\'t working.',
        ],
      },
      {
        heading: 'Try this',
        paragraphs: [
          'Think of one small thing just outside your comfort zone: saying hello first, trying a new café, or sending the message you have been drafting. Notice how it feels before, during and after. The "after" is often kinder than the "before" expected.',
        ],
      },
    ],
  },
  {
    id: 'rest-is-part-of-it',
    title: 'Rest is part of it',
    description: "Rest isn't a reward for finishing. It's part of how you keep going.",
    sections: [
      {
        heading: 'The idea of earning rest',
        paragraphs: [
          'Many of us carry a quiet rule: rest is something you earn once everything is done. But there is rarely a moment when everything is done, so rest keeps getting pushed back.',
          'Rest works better as part of the plan, not as a prize at the end of it.',
        ],
      },
      {
        heading: 'What rest can look like',
        paragraphs: [
          'Sleep is a big part of rest, but it isn\'t the only kind. Rest can be a few quiet minutes, a slow walk, time with someone who feels easy to be around, or something you enjoy just for its own sake.',
          'Some things feel restful but leave us more drained, like scrolling for a long time. It can be worth noticing what actually leaves you feeling a little more restored.',
        ],
      },
      {
        heading: 'Signs you might need it',
        paragraphs: [
          'Feeling more irritable than usual, finding it hard to focus, or noticing that small things feel unusually heavy can all be signs that you are running low.',
        ],
      },
      {
        heading: 'Resting without guilt',
        paragraphs: [
          'It may help to plan small rests into your day before you feel you have earned them. When guilt shows up, you might remind yourself: "I\'m recharging so I can keep going."',
          'Taking care of your energy is not falling behind. It is part of moving forward.',
        ],
      },
      {
        heading: 'Try this',
        paragraphs: [
          "Today, choose one five-minute rest and put it somewhere in your day before everything is finished. Afterwards, notice how you feel. Rest doesn't have to be long to count.",
        ],
      },
    ],
  },
];

/** Rough read time in whole minutes, at a calm reading pace (about 150 words a minute), worked out from the lesson text. */
export function readMinutes(lesson: Lesson): number {
  const words = lesson.sections
    .flatMap((s) => [s.heading, ...s.paragraphs])
    .join(' ')
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.round(words / 150));
}

export const findLesson = (id: string) => LESSONS.find((l) => l.id === id);
