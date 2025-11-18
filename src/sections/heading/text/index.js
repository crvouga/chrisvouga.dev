// @ts-check

import { tag } from "../../../library/html/index.js";
import { THEME, unit } from "../../../ui/theme.js";
import { viewTypography } from "../../../ui/typography.js";

/**
 * @type {import("../../../library/html/index.js").View}
 */
export const viewHeadingSectionText = () => {
  return tag(
    "div",
    {
      style: {
        flex: 1,
        display: "flex",
        "align-items": "flex-start",
        "justify-content": "flex-start",
        "flex-direction": "column",
        gap: unit(1),
        "flex-shrink": 0,
      },
    },
    [
      tag("div", {}, [
        viewTypography({ level: "h1", text: "Chris Vouga" })({
          style: { "font-weight": 900 },
        }),
        viewTypography({ level: "h2", text: "Software Developer",  })({
          style: { "font-weight": 900, "color": THEME.colors.primary400 },
        }),
      ]),
    ]
  );
};
