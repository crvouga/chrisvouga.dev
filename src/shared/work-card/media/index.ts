import { type ViewWithProps, tag, text } from "../../../library/html/index";
import type { Work } from "../../../content/work";
import { HEAD } from "../../../ui/head";
import { THEME } from "../../../ui/theme";
import { viewWorkCardMediaImage } from "./image";

export const viewWorkCardMedia: ViewWithProps<{ work: Work; fetchPriority?: "high" | "auto" }> = (props) => (attr, children) => {
  return tag("div", { ...attr, class: "work-card-media" }, [
    viewWorkCardMediaImage(props)({}, []),
    ...(children ?? []),
  ]);
};

HEAD.push(
  tag("style", {}, [
    text(`
      .work-card-media {
        aspect-ratio: 16 / 9;
        overflow: hidden;
        flex-shrink: 0;
        border-bottom: 1px solid ${THEME.colors.paperBorder};
      }
    `),
  ])
);
