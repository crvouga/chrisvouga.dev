import { CONTENT } from "../content/content";
import { viewButton } from "../ui/button";
import { linkedIn } from "../ui/icons";
import type { ViewWithProps } from "../library/html/index";

export const viewLinkedInButton: ViewWithProps<{}> = () => () => {
  return viewButton({
    tag: "a",
    variant: "soft",
    size: "lg",
    disabled: false,
    startDecorator: linkedIn,
    text: "LinkedIn",
  })({
    target: "_blank",
    rel: "noreferrer noopener",
    href: CONTENT.LINKEDIN_URL,
  });
};
