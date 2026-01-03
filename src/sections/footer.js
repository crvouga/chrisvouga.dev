import { CONTENT } from "../content/content.js";
import { tag, text } from "../library/html/index.js";
import { viewContactLink } from "../shared/contact-link/index.js";
import { viewGithubButton } from "../shared/github-button.js";
import { viewLinkedInButton } from "../shared/linkedin-button.js";
import { viewResumeButton } from "../shared/resume-button.js";
import { viewLink } from "../ui/link.js";
import { HEAD } from "../ui/head.js";
import { unit, THEME } from "../ui/theme.js";

/**
 * @type {import("../library/html/index.js").View}
 */
export const viewFooterSection = () => {
  return tag(
    "footer",
    {
      style: {
        width: "100%",
        padding: `${unit(8)} 0`,
        display: "flex",
        "flex-direction": "column",
        "align-items": "center",
        "justify-content": "center",
        gap: unit(4),
      },
    },
    [
      tag(
        "div",
        {
          style: {
            display: "flex",
            "flex-direction": "column",
            "align-items": "center",
            gap: unit(4),
            "max-width": THEME.breakpoints.sm,
            width: "100%",
          },
        },
        [
          tag(
            "div",
            {
              style: {
                display: "flex",
                "flex-direction": "column",
                "align-items": "center",
                gap: unit(2),
              },
            },
            [
              viewContactLink({
                label: "Email",
                value: CONTENT.EMAIL_ADDRESS,
              })(),
              tag(
                "div",
                {
                  style: {
                    display: "flex",
                    "align-items": "center",
                    gap: unit(2),
                    "flex-wrap": "wrap",
                    "justify-content": "center",
                  },
                },
                [
                  viewGithubButton({})(),
                  viewLinkedInButton({})(),
                  viewResumeButton({})(),
                ]
              ),
            ]
          ),
          viewLink(
            {
              target: "_blank",
              rel: "noopener noreferrer",
              href: CONTENT.SITE_SOURCE_CODE_URL,
              style: {
                color: THEME.colors.neutralMuted,
                display: "flex",
                "align-items": "center",
                "justify-content": "center",
                gap: unit(1),
              },
            },
            [text("Source code")]
          ),
        ]
      ),
    ]
  );
};

HEAD.push(
  tag("style", {}, [
    text(`
    @media (min-width: ${THEME.breakpoints.xs}) {
      footer {
        flex-direction: row;
      }
    }
    `),
  ])
);
