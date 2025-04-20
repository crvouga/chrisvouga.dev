// @ts-check

import { tag, text } from "../library/html/index.js";
import { viewTypography } from "../ui/typography.js";
import { HEAD } from "../ui/head.js";

/**
 * @type {import("../library/html/index.js").ViewWithProps<{ title: string, subtitle?: string }>}
 */
export const viewSectionTitle = (p) => (_a, _c) => {
  return tag("div", { class: "section-title" }, [
    viewTypography({ level: "h2", text: p.title })(),
    ...(p.subtitle
      ? [
          viewTypography({
            level: "body-md",
            text: p.subtitle,
          })({
            style: {
              "max-width": "600px",
            },
          }),
        ]
      : []),
  ]);
};

HEAD.push(
  tag("style", {}, [
    text(`
      .section-title {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
    `),
  ])
);
