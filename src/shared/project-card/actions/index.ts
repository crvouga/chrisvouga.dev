import { viewButton } from "../../../ui/button";
import { viewCardActions } from "../../../ui/card";
import { web, code } from "../../../ui/icons";
import type { ProjectCardView } from "../props";

export const viewProjectCardActions: ProjectCardView = (props) => () => {
  return viewCardActions({}, [
    viewButton({
      tag: "a",
      startDecorator: web,
      variant: "soft",
      disabled: props.project.deployment.t !== "public",
      text: "Deployment",
      size: "sm",
    })({
      href:
        props.project.deployment.t === "public"
          ? props.project.deployment.url
          : " ",
      target: "_blank",
      rel: "noreferrer noopener",
    }),
    viewButton({
      tag: "a",
      startDecorator: code,
      variant: "plain",
      disabled: props.project.code.t !== "public",
      text: "Source Code",
      size: "sm",
    })({
      href: props.project.code.t === "public" ? props.project.code.url : " ",
      target: "_blank",
      rel: "noreferrer noopener",
    }),
  ]);
};
