import { a } from "./a.js";

const BAND_HREF = "https://www.instagram.com/tripolartheband/";
const BAND_A_TAG = a(BAND_HREF, "band");

export const ABOUT_ME = `
I'm a full-stack software engineer based in the Phoenix Valley, specializing in building scalable web applications and leading development teams.
With a bachelor's degree in mathematics and statistics from ASU, I bring strong analytical thinking and problem-solving skills to software development.
I have extensive experience across the full stack, from modern frontend frameworks to robust backend systems, and I'm passionate about writing clean, maintainable code.
I continuously explore emerging technologies to stay at the forefront of software development.
When I'm not coding, I play the drums in a ${BAND_A_TAG}.`;

export const ABOUT_ME_ATTR_SAFE = ABOUT_ME.replace(BAND_A_TAG, "band");

export const ABOUT_YOUTUBE_VIDEO_ID = "7rHHSdnvX94";
export const ABOUT_YOUTUBE_EMBED_URL = `https://www.youtube.com/embed/${ABOUT_YOUTUBE_VIDEO_ID}`;
export const ABOUT_YOUTUBE_VIDEO_TITLE = "Cursor AI gift video";
export const ABOUT_CURSOR_GIFT_TEXT =
  "I was recognized by Cursor AI as one of their top tab users, receiving a custom tab button as a gift.";
export const ABOUT_GITHUB_HEATMAP_TEXT =
  "GitHub contribution heatmap showcasing consistent coding activity and engagement over the past year. Each square represents a day, with darker colors indicating higher contribution levels, demonstrating dedication to continuous learning and development.";
