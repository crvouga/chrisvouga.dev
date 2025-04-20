import { CONTENT } from "../content/content.js";
import { viewButton } from "../ui/button.js";
import { github } from "../ui/icons.js";

/**
 *
 * @type {import("../library/html/index.js").ViewWithProps<{}>}
 */
export const viewGithubButton = () => () => {
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
