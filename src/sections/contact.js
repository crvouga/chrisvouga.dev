import { CONTENT } from "../content/content.js";
import { tag, text } from "../library/html/index.js";
import { viewContactLink } from "../shared/contact-link/index.js";
import { viewGithubButton } from "../shared/github-button.js";
import { viewLinkedInButton } from "../shared/linkedin-button.js";
import { viewSection } from "../shared/section.js";
import { HEAD } from "../ui/head.js";
import { THEME, unit } from "../ui/theme.js";

/**
 * @type {import("../library/html/index.js").View}
 */
export const viewContactSection = (_a, _c) => {
  return viewSection({
    title: CONTENT.CONTACT_SECTION_TITLE,
  })({ class: "contact-section" }, [viewContacts()]);
};

/**
 * @type {import("../library/html/index.js").View}
 */
const viewContacts = (_a, _c) => {
  return tag(
    "div",
    {
      class: "contact-section-content",
    },
    [viewContactLinks(), viewContactButtons()]
  );
};

HEAD.push(
  tag("style", {}, [
    text(`
    .contact-section-content {
      display: flex;
      flex-direction: column;
      gap: ${unit(4)};
      max-width: ${THEME.breakpoints.sm};
      flex-wrap: wrap;
      overflow: hidden;
    }
    @media (min-width: ${THEME.breakpoints.xs}) {
      .contact-section-content {
        flex-direction: row;
      }
    }
    @media (min-width: ${THEME.breakpoints.md}) {
      .contact-section-content {
        flex-direction: row;
      }
    }
    
  `),
  ])
);

/**
 * @type {import("../library/html/index.js").View}
 */
const viewContactLinks = (_a, _c) => {
  return tag("div", { class: "contact-section-links" }, [
    viewContactLink({
      label: "Email",
      value: CONTENT.EMAIL_ADDRESS,
    })(),
  ]);
};

HEAD.push(
  tag("style", {}, [
    text(`
    .contact-section-links {
      display: flex;
      align-items: center;
      gap: ${unit(2)};
    }
  `),
  ])
);

/**
 * @type {import("../library/html/index.js").View}
 */
const viewContactButtons = (_a, _c) => {
  return tag("div", { class: "contact-section-buttons" }, [
    viewGithubButton({})(),
    viewLinkedInButton({})(),
  ]);
};

HEAD.push(
  tag("style", {}, [
    text(`
    .contact-section-buttons {
      display: flex;
      align-items: center;
      gap: ${unit(2)};
    }
  `),
  ])
);
