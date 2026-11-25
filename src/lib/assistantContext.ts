/*
  What the voice assistant needs to know about where the person is: the day the current page is showing.
  Daily Sprout sets it while it's open; every other page means today. Kept in memory only.
*/
let shownDay: string | null = null;

export const setAssistantDay = (day: string | null) => {
  shownDay = day;
};
export const getAssistantDay = () => shownDay;
