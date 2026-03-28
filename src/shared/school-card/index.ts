// @ts-check

import { tag } from "../../library/html/index.js";
import { viewCard, viewCardContent } from "../../ui/card.js";
import { appendExternalLinkIndicator } from "../../ui/external-link-indicator.js";
import { viewLink } from "../../ui/link.js";
import { unit } from "../../ui/theme.js";
import { viewTypography } from "../../ui/typography.js";
import { viewSchoolCardImage } from "./image.js";

/**
 * @type {import("../../library/html/index.js").ViewWithProps<{school: import("../../content/school.js").School}>}
 */
export const viewSchoolCard =
  ({ school }) =>
  () => {
    return viewCard({}, [
      viewSchoolCardImage({ school })(),
      viewCardContent({}, [
        viewLink(
          {
            href: school.infoUrl ?? " ",
          },
          [
            viewTypography({
              level: "h3",
              text: school.infoUrl
                ? appendExternalLinkIndicator({ text: school.institutionName })
                : school.institutionName,
            })({
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
              text: school.degree,
            })(),

            viewTypography({
              level: "title-sm",
              text: `${school.yearStart} - ${school.yearEnd}`,
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
