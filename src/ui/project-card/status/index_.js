import { tag } from "../../../elem";
import { infoOutline } from "../../icons";
import { THEME, unit } from "../../theme";
import { viewTypography } from "../../typography";

/**
 * @type {import("../props").ProjectCardView}
 */
export const viewProjectCardStatus = (props) => (_a, _c) => {
  /**
   * @type {import("../../../elem").Elem[]}
   */
  const children = [];

  if (props.project.deployment.t === "not-deployed-anymore") {
    children.push(
      viewProjectCardStatusSingle({
        ...props,
        text: "Project is no longer deployed",
      })({})
    );
  }

  if (props.project.deployment.t === "private") {
    children.push(
      viewProjectCardStatusSingle({
        ...props,
        text: "Deployment is private",
      })({})
    );
  }

  if (props.project.code.t === "private") {
    children.push(
      viewProjectCardStatusSingle({
        ...props,
        text: "Source code is private",
      })({})
    );
  }

  console.log("viewProjectCardStatus", children, "props", props);

  return tag(
    "div",
    {
      style: {
        display: "flex",
        "flex-direction": "column",
        gap: unit(1),
        width: "100%",
        "flex-shrink": 0,
      },
    },
    children
  );
};

/**
 * @type {import("../../../elem").View<import("../props").ProjectCardProps & {text:string}>}
 */
export const viewProjectCardStatusSingle = (props) => (_a, _c) => {
  return tag(
    "div",
    {
      style: {
        display: "flex",
        gap: unit(1),
        "align-items": "center",
      },
    },
    [
      infoOutline({
        style: {
          width: 18,
          height: 18,
          fill: THEME.colors.warning,
        },
      }),
      viewTypography({
        level: "body-xs",
        text: props.text,
      })({
        style: { color: THEME.colors.warning },
      }),
    ]
  );
};