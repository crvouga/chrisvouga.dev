import { CONTENT } from "../content/content";
import { viewButton } from "../ui/button";
import { github } from "../ui/icons";
import type { ViewWithProps } from "../library/html/index";

export const viewGithubButton: ViewWithProps<{}> = () => () => {
  return viewButton({
    tag: "a",
    variant: "soft",
    size: "lg",
    disabled: false,
    startDecorator: github,
    text: "GitHub",
  })({
    target: "_blank",
    rel: "noreferrer noopener",
    href: CONTENT.GITHUB_URL,
  });
};
