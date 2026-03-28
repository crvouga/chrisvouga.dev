import { tag } from "../library/html/index";
import type { ViewWithProps } from "../library/html/index";
import type { Work } from "../content/work";
import { viewButton } from "../ui/button";
import { viewCard, viewCardActions, viewCardContent } from "../ui/card";
import { appendExternalLinkIndicator } from "../ui/external-link-indicator";
import { web } from "../ui/icons";
import { viewLink } from "../ui/link";
import { unit } from "../ui/theme";
import { viewTypography } from "../ui/typography";
import { viewWorkCardMedia } from "./work-card/media/index";

export const viewWorkCard: ViewWithProps<{ work: Work; fetchPriority?: "high" | "auto" }> =
  ({ work, fetchPriority }) =>
  () => {
    const mediaProps = fetchPriority
      ? { work, fetchPriority }
      : { work };
    return viewCard({}, [
      viewWorkCardMedia(mediaProps)({}),
      viewCardContent({}, [
        viewLink(
          {
            href: work.infoUrl ?? " ",
          },
          [
            viewTypography({
              level: "h3",
              text: work.infoUrl
                ? appendExternalLinkIndicator({ text: work.name })
                : work.name,
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
              text: work.jobTitle,
            })(),

            viewTypography({
              level: "title-sm",
              text: `${work.yearStart} - ${work.yearEnd}`,
            })({
              style: {
                "margin-bottom": unit(2),
              },
            }),
          ]
        ),

        viewTypography({
          level: "body-md",
          text: work.jobDescription,
        })({
          style: {
            "margin-bottom": unit(2),
          },
        }),

        ...(work.infoUrl
          ? [
              viewCardActions({}, [
                viewButton({
                  tag: "a",
                  startDecorator: web,
                  variant: "soft",
                  disabled: false,
                  text: "Website",
                  size: "sm",
                })({
                  href: work.infoUrl,
                  target: "_blank",
                  rel: "noreferrer noopener",
                }),
              ]),
            ]
          : []),
      ]),
    ]);
  };
