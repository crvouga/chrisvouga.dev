import { CONTENT } from "../content/content";
import { tag, text } from "../library/html/index";
import type { View } from "../library/html/index";
import { viewContactLink } from "../shared/contact-link/index";
import { viewGithubButton } from "../shared/github-button";
import { viewLinkedInButton } from "../shared/linkedin-button";
import { viewResumeButton } from "../shared/resume-button";
import { viewSection } from "../shared/section";
import { HEAD } from "../ui/head";
import { THEME, unit } from "../ui/theme";

export const viewContactSection: View = (_a, _c) => {
  return viewSection({
    title: CONTENT.CONTACT_SECTION_TITLE,
  })({ class: "contact-section" }, [viewContacts()]);
};

const viewContacts: View = (_a, _c) => {
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

const viewContactLinks: View = (_a, _c) => {
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

const viewContactButtons: View = (_a, _c) => {
  return tag("div", { class: "contact-section-buttons" }, [
    viewGithubButton({})(),
    viewLinkedInButton({})(),
    viewResumeButton({})(),
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
