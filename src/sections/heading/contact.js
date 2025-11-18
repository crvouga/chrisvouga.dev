import { CONTENT } from "../../content/content.js";
import { tag, text } from "../../library/html/index.js";
import { viewContactLink } from "../../shared/contact-link/index.js";
import { viewGithubButton } from "../../shared/github-button.js";
import { viewLinkedInButton } from "../../shared/linkedin-button.js";
import { HEAD } from "../../ui/head.js";
import { THEME, unit } from "../../ui/theme.js";

/**
 * @type {import("../../library/html/index.js").ViewWithProps<{}>}
 */
export const viewHeadingContact = () => () => {
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
        [viewGithubButton({})(), viewLinkedInButton({})()]
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
