// @ts-check

import { tag } from "../../library/html/index.js";
import { viewCard, viewCardContent } from "../../ui/card.js";
import { viewLink } from "../../ui/link.js";
import { unit } from "../../ui/theme.js";
import { viewTypography } from "../../ui/typography.js";
import { viewEducationCardImage } from "./image.js";

/**
 * @type {import("../../library/html/index.js").ViewWithProps<{education: import("../../content/school.js").School}>}
 */
export const viewEducationCard =
  ({ education }) =>
  () => {
    return viewCard({}, [
      viewEducationCardImage({ education })(),
      viewCardContent({}, [
        viewLink(
          {
            href: education.infoUrl ?? " ",
          },
          [
            viewTypography({ level: "h3", text: education.institutionName })({
              style: {
                "margin-bottom": unit(1),
              },
            }),
          ]
        ),

        tag(
          "div",
          {
            style: {
              display: "flex",
              "flex-direction": "column",
              gap: unit(0.5),
            },
          },
          [
            viewTypography({
              level: "title-sm",
              text: education.degree,
            })(),

            viewTypography({
              level: "title-sm",
              text: `${education.yearStart} - ${education.yearEnd}`,
            })({
              style: {
                "margin-bottom": unit(2),
              },
            }),
          ]
        ),
      ]),
    ]);
  };
