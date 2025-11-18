// @ts-check

import { CONTENT } from "../content/content.js";
import { tag } from "../library/html/index.js";
import { viewSection } from "../shared/section.js";
import { THEME, unit } from "../ui/theme.js";
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
      viewTypography({
        level: "body-md",
        text: CONTENT.ABOUT_ME,
      })(),
      tag(
        "div",
        {
          style: {
            "padding-top": unit(4),
            display: "flex",
            "flex-direction": "column",
            gap: unit(1),
          },
        },
        [
          viewTypography({
            level: "body-md",
            text: CONTENT.ABOUT_CURSOR_GIFT_TEXT,
          })(),
          viewYouTubeVideo({
            src: CONTENT.ABOUT_YOUTUBE_EMBED_URL,
            title: CONTENT.ABOUT_YOUTUBE_VIDEO_TITLE,
          })(),
        ]
      ),
    ]
  );
};
