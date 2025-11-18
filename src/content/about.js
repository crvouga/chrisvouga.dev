import { a } from "./a.js";

const BAND_HREF = "https://www.instagram.com/tripolartheband/";
const BAND_A_TAG = a(BAND_HREF, "band");

export const ABOUT_ME = `
I'm a software developer based in the Phoenix Valley.
I graduated from ASU with a bachelor's degree in mathematics and statistics.
Beyond my professional work, I'm passionate about software development and regularly engage with technical content while building applications in my free time.
I specialize in web development and have a strong interest in expanding into embedded systems and robotics.
I leverage AI tools like Cursor AI to enhance my development workflow and productivity.
A fun fact about me is that I play the drums in a ${BAND_A_TAG}.`;

export const ABOUT_ME_ATTR_SAFE = ABOUT_ME.replace(BAND_A_TAG, "band");

export const ABOUT_YOUTUBE_VIDEO_ID = "7rHHSdnvX94";
export const ABOUT_YOUTUBE_EMBED_URL = `https://www.youtube.com/embed/${ABOUT_YOUTUBE_VIDEO_ID}`;
export const ABOUT_YOUTUBE_VIDEO_TITLE = "Cursor AI gift video";
export const ABOUT_CURSOR_GIFT_TEXT =
  "I received a gift from Cursor AI — a custom tab button — for being one of the top users of tab autocomplete.";
export const ABOUT_GITHUB_HEATMAP_TEXT =
  "This heatmap visualizes my GitHub contributions over the past year, demonstrating consistent coding activity and engagement. Each square represents a day, with darker colors indicating more contributions.";
