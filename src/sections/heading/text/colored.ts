import { tag, text } from "../../../library/html/index";
import type { ViewWithProps } from "../../../library/html/index";
import { HEAD } from "../../../ui/head";
import { THEME } from "../../../ui/theme";
import { viewTypography } from "../../../ui/typography";

export const viewColored: ViewWithProps<{ text: string }> =
  ({ text }) =>
  (a, _c) => {
    return viewTypography({ level: "h2", text })({
      ...a,
      class: "colored",
    });
  };

HEAD.push(
  tag("style", {}, [
    text(`
    
    .colored {
      font-weight: 1000;
      color: transparent;
      background-image: linear-gradient(${THEME.colors.primary300}, ${THEME.colors.primary500});
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    `),
  ])
);
