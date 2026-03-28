import { tag } from "../../../library/html/index";
import type { View } from "../../../library/html/index";
import { THEME, unit } from "../../../ui/theme";
import { viewTypography } from "../../../ui/typography";

export const viewHeadingSectionText: View = () => {
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
        viewTypography({ level: "h2", text: "Software Engineer" })({
          style: { "font-weight": 900, color: THEME.colors.primary400 },
        }),
      ]),
    ]
  );
};
