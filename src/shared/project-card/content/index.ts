import { ensureObject } from "../../../library/ensure-object";
import { tag } from "../../../library/html/index";
import { unit } from "../../../ui/theme";
import { viewTypography } from "../../../ui/typography";
import { viewProjectCardContentChips } from "./chips";
import { viewProjectCardContentTitle } from "./title";
import type { ProjectCardView } from "../props";

export const viewProjectCardContentMain: ProjectCardView = (props) => (a, _c) => {
  return tag(
    "div",
    {
      ...a,
      style: {
        ...ensureObject(a?.["style"]),
        flex: 1,
        display: "flex",
        "flex-direction": "column",
      },
    },
    [
      tag(
        "div",
        {
          style: {
            display: "flex",
            "flex-direction": "row",
            gap: unit(1),
            "margin-bottom": unit(1.5),
          },
        },
        [viewProjectCardContentTitle(props)({})]
      ),
      viewTypography({
        level: "body-md",
        text: props.project.description,
      })({
        style: {
          "margin-bottom": unit(2),
        },
      }),
      viewProjectCardContentChips(props)(),
    ]
  );
};
