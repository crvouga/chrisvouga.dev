// @ts-check

import { CONTENT } from "../content/content.js";
import { tag, text } from "../library/html/index.js";
import { viewSection } from "../shared/section.js";
import { HEAD } from "../ui/head.js";
import { THEME } from "../ui/theme.js";
import { viewTypography } from "../ui/typography.js";

const YOUTUBE_VIDEO_ID = "7rHHSdnvX94";
const YOUTUBE_EMBED_URL = `https://www.youtube.com/embed/${YOUTUBE_VIDEO_ID}`;

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
      tag(
        "div",
        {
          class: "about-video-container",
        },
        [
          tag("iframe", {
            src: YOUTUBE_EMBED_URL,
            class: "about-video",
            allow:
              "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture",
            allowfullscreen: "true",
            frameborder: "0",
            title: "Cursor AI gift video",
          }),
        ]
      ),
    ]
  );
};

HEAD.push(
  tag("style", {}, [
    text(`
      .about-video-container {
        width: 100%;
        margin-top: 24px;
        position: relative;
        padding-bottom: 56.25%; /* 16:9 aspect ratio */
        height: 0;
        overflow: hidden;
      }
      .about-video {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        border: none;
      }
    `),
  ])
);
