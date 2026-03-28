import { type Html, type ViewWithProps, tag } from "../../../library/html/index";
import { infoOutline } from "../../../ui/icons";
import { unit, THEME } from "../../../ui/theme";
import { viewTypography } from "../../../ui/typography";
import type { ProjectCardProps, ProjectCardView } from "../props";

export const viewProjectCardStatus: ProjectCardView = (props) => (_a, _c) => {
  const children: Html[] = [];

  if (props.project.deployment.t === "not-deployed-anymore") {
    children.push(
      viewProjectCardStatusSingle({
        ...props,
        text: "Project is no longer deployed",
      })({})
    );
  }

  if (props.project.deployment.t === "not-deployed-yet") {
    children.push(
      viewProjectCardStatusSingle({
        ...props,
        text: "Project is not deployed yet",
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

export const viewProjectCardStatusSingle: ViewWithProps<ProjectCardProps & { text: string }> = (props) => (_a, _c) => {
  const color = THEME.colors.neutralMuted;
  return tag(
    "div",
    {
      style: {
        display: "flex",
        gap: unit(0.75),
        "align-items": "center",
      },
    },
    [
      infoOutline({
        style: {
          width: 18,
          height: 18,
          fill: color,
        },
      }),
      viewTypography({
        level: "body-xs",
        text: props.text,
      })({
        style: { color: color },
      }),
    ]
  );
};
