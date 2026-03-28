import { tag, text } from "../../../library/html/index";
import { HEAD } from "../../../ui/head";
import { THEME } from "../../../ui/theme";
import { viewProjectCardMediaImage } from "./image";
import type { ProjectCardView } from "../props";

export const viewProjectCardMedia: ProjectCardView = (props) => (attr, children) => {
  return tag("div", { ...attr, class: "project-card-media" }, [
    viewProjectCardMediaImage(props)({}, []),
    ...(children ?? []),
  ]);
};

HEAD.push(
  tag("style", {}, [
    text(`
      .project-card-media {
        aspect-ratio: 16 / 9;
        overflow: hidden;
        flex-shrink: 0;
        border-bottom: 1px solid ${THEME.colors.paperBorder};
      }
    `),
  ])
);
