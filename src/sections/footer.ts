import { CONTENT } from "../content/content";
import { tag, text } from "../library/html/index";
import type { View } from "../library/html/index";
import { viewContactLink } from "../shared/contact-link/index";
import { viewGithubButton } from "../shared/github-button";
import { viewLinkedInButton } from "../shared/linkedin-button";
import { viewResumeButton } from "../shared/resume-button";
import { viewLink } from "../ui/link";
import { HEAD } from "../ui/head";
import { unit, THEME } from "../ui/theme";

export const viewFooterSection: View = () => {
  return tag(
    "footer",
    {
      class: "footer",
      style: {
        width: "100%",
        padding: `${unit(8)} 0`,
      },
    },
    [
      tag(
        "div",
        {
          class: "footer-content",
        },
        [
          tag(
            "div",
            {
              class: "footer-column",
            },
            [
              viewContactLink({
                label: "Email",
                value: CONTENT.EMAIL_ADDRESS,
              })(),
            ]
          ),
          tag(
            "div",
            {
              class: "footer-column",
            },
            [
              tag(
                "div",
                {
                  class: "footer-buttons",
                },
                [
                  viewGithubButton({})(),
                  viewLinkedInButton({})(),
                  viewResumeButton({})(),
                ]
              ),
            ]
          ),
          tag(
            "div",
            {
              class: "footer-column",
            },
            [
              viewLink(
                {
                  target: "_blank",
                  rel: "noopener noreferrer",
                  href: CONTENT.SITE_SOURCE_CODE_URL,
                  style: {
                    color: THEME.colors.neutralMuted,
                    display: "flex",
                    "align-items": "center",
                    gap: unit(1),
                  },
                },
                [text("Source code")]
              ),
            ]
          ),
        ]
      ),
    ]
  );
};

HEAD.push(
  tag("style", {}, [
    text(`
    .footer {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      max-width: 1150px;
      margin: auto;
    }
    
    .footer-content {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: ${unit(4)};
      width: 100%;
      padding: 0 ${unit(3)};
    }
    
    .footer-column {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: ${unit(2)};
    }
    
    .footer-buttons {
      display: flex;
      align-items: center;
      gap: ${unit(2)};
      flex-wrap: wrap;
      justify-content: center;
    }
    
    @media (min-width: ${THEME.breakpoints.sm}) {
      .footer-content {
        flex-direction: row;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        padding: 0 ${unit(4)};
      }
      
      .footer-column {
        align-items: center;
        justify-content: center;
        flex: 0 1 auto;
      }
      
      .footer-column:nth-child(2) {
        flex: 1;
        justify-content: center;
      }
      
      .footer-buttons {
        justify-content: center;
      }
    }
    
    @media (min-width: 1200px) {
      .footer-content {
        padding: 0;
      }
    }
    `),
  ])
);
