// @ts-check

import { projectToLinkHref } from "../../content/project.js";
import { tag } from "../../library/html/index.js";
import { viewCard, viewCardContent } from "../../ui/card.js";
import { unit } from "../../ui/theme.js";
import { viewProjectCardActions } from "./actions/index.js";
import { viewProjectCardContentMain } from "./content/index.js";
import { viewProjectCardMedia } from "./media/index.js";
import { viewProjectCardStatus } from "./status/index.js";

/**
 * @type {import("./props.js").ProjectCardView}
 */
export const viewProjectCard = (props) => (a, _c) => {
  /**
   * @type {import("./props.js").ProjectCardProps}
   */
  const propsNew = {
    ...props,
    linkHref: projectToLinkHref(props.project),
  };
  return viewCard(a, [
    viewProjectCardMedia(propsNew)({}),
    viewCardContent(
      {
        style: {
          gap: unit(2),
        },
      },
      [
        viewProjectCardContentMain(propsNew)({}),
        tag("div", { style: { flex: 1, width: "100%", "flex-shrink": 0 } }, []),
        tag(
          "div",
          {
            style: {
              display: "flex",
              "flex-direction": "column",
              gap: unit(0),
            },
          },
          [
            viewProjectCardStatus(propsNew)({}),
            viewProjectCardActions(propsNew)({}),
          ]
        ),
      ]
    ),
  ]);
};
