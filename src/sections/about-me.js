// @ts-check

import { CONTENT } from "../content/content.js";
import { viewSection } from "../shared/section.js";
import { THEME } from "../ui/theme.js";
import { viewTypography } from "../ui/typography.js";

/**
 * @type {import("../library/html/index.js").View}
 */
export const viewAboutMeSection = (a, _) => {
  return viewSection({
    title: "A little bit about me...",
  })(
    {
      ...a,
      style: {
        "max-width": THEME.breakpoints.md,
      },
    },
    [viewTypography({ level: "body-md", text: CONTENT.ABOUT_ME })()]
  );
};
