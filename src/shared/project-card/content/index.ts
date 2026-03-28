import { ensureObject } from "../../../library/ensure-object.js";
import { tag } from "../../../library/html/index.js";
import { unit } from "../../../ui/theme.js";
import { viewTypography } from "../../../ui/typography.js";
import { viewProjectCardContentChips } from "./chips.js";
import { viewProjectCardContentTitle } from "./title.js";

/**
 * @type {import("../props.js").ProjectCardView}
 */
export const viewProjectCardContentMain = (props) => (a, _c) => {
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
