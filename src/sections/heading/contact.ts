import { CONTENT } from "../../content/content";
import { tag, text } from "../../library/html/index";
import type { ViewWithProps } from "../../library/html/index";
import { viewContactLink } from "../../shared/contact-link/index";
import { viewGithubButton } from "../../shared/github-button";
import { viewLinkedInButton } from "../../shared/linkedin-button";
import { viewResumeButton } from "../../shared/resume-button";
import { HEAD } from "../../ui/head";
import { THEME, unit } from "../../ui/theme";

export const viewHeadingContact: ViewWithProps<{}> = () => () => {
  return tag(
    "div",
    {
      class: "heading-contact",
    },
    [
      viewContactLink({ label: "Email", value: CONTENT.EMAIL_ADDRESS })(),
      tag(
        "div",
        {
          class: "heading-contact-button",
        },
        [
          viewGithubButton({})(),
          viewLinkedInButton({})(),
          viewResumeButton({})(),
        ]
      ),
    ]
  );
};

HEAD.push(
  tag("style", {}, [
    text(`
    .heading-contact {
      display: flex;
      gap: ${unit(3)};
      height: 100%;
      flex: 1;
      flex-wrap: wrap;
      flex-direction: column;
      justify-content: flex-start;
      align-items: flex-start;
      padding-bottom: ${unit(0.5)};
    }
    
    @media (max-width: ${THEME.breakpoints.sm}) {
      .heading-contact {
        flex-direction: column;
        justify-content: flex-start;
        align-items: flex-start;
      }
    }
    @media (min-width: ${THEME.breakpoints.md}) {
      .heading-contact {
        justify-content: flex-end;
        align-items: center;
        flex-direction: row;
      }
    }
    .heading-contact-button {
      display: flex;
      flex-direction: row;
      flex-wrap: wrap;
      flex-shrink: 0;
      gap: ${unit(2)};
    }
  `),
  ])
);
