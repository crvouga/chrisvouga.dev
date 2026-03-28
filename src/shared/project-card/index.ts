import { projectToLinkHref } from "../../content/project";
import { tag } from "../../library/html/index";
import { viewCard, viewCardContent } from "../../ui/card";
import { unit } from "../../ui/theme";
import { viewProjectCardActions } from "./actions/index";
import { viewProjectCardContentMain } from "./content/index";
import { viewProjectCardMedia } from "./media/index";
import { viewProjectCardStatus } from "./status/index";
import type { ProjectCardProps, ProjectCardView } from "./props";

export const viewProjectCard: ProjectCardView = (props) => (a, _c) => {
  const propsNew: ProjectCardProps = {
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
