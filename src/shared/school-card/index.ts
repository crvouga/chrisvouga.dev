import { tag } from "../../library/html/index";
import type { ViewWithProps } from "../../library/html/index";
import type { School } from "../../content/school";
import { viewCard, viewCardContent } from "../../ui/card";
import { appendExternalLinkIndicator } from "../../ui/external-link-indicator";
import { viewLink } from "../../ui/link";
import { unit } from "../../ui/theme";
import { viewTypography } from "../../ui/typography";
import { viewSchoolCardImage } from "./image";

export const viewSchoolCard: ViewWithProps<{ school: School }> =
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
