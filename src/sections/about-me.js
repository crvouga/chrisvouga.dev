// @ts-check

import { CONTENT } from "../content/content.js";
import { viewSection } from "../shared/section.js";
import { THEME } from "../ui/theme.js";
import { viewTypography } from "../ui/typography.js";
import { viewYouTubeVideo } from "../ui/youtube-video.js";

/**
 * @type {import("../library/html/index.js").View}
 */
export const viewAboutMeSection = (a, _) => {
  return viewSection({
    title: CONTENT.ABOUT_ME_SECTION_TITLE,
  })(
    {
      ...a,
      style: {
        "max-width": THEME.breakpoints.md,
      },
    },
    [
      viewTypography({ level: "body-md", text: CONTENT.ABOUT_ME })(),
      viewYouTubeVideo({
        src: CONTENT.ABOUT_YOUTUBE_EMBED_URL,
        title: "Cursor AI gift video",
      })(),
    ]
  );
};
