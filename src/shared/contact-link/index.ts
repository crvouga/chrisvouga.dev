import type { ViewWithProps } from "../../library/html/index";
import { viewContactLinkButton } from "./button";

export const viewContactLink: ViewWithProps<{ label: string; value: string }> = (props) => (a, c) => {
  return viewContactLinkButton(props)(a, c);
};
