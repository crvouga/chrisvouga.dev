import { CONTENT } from "../content/content.js";
import { viewButton } from "../ui/button.js";
import { linkedIn } from "../ui/icons.js";

/**
 *
 * @type {import("../library/html/index.js").ViewWithProps<{}>}
 */
export const viewLinkedInButton = () => () => {
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
