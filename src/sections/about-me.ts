import { CONTENT } from "../content/content";
import { fragment, tag } from "../library/html/index";
import type { View } from "../library/html/index";
import { viewSection } from "../shared/section";
import { THEME, unit } from "../ui/theme";
import { viewTypography } from "../ui/typography";
import { viewYouTubeVideo } from "../ui/youtube-video";

export const viewAboutMeSection: View = (a, _) => {
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
      false
        ? tag(
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
                text: CONTENT.ABOUT_GITHUB_HEATMAP_TEXT,
              })(),
              tag(
                "github-contribution-heatmap",
                {
                  "data-username": "crvouga",
                },
                []
              ),
            ]
          )
        : fragment([]),
    ]
  );
};
