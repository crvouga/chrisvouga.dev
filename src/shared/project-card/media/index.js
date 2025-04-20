// @ts-check

import { tag, text } from "../../../library/html/index.js";
import { HEAD } from "../../../ui/head.js";
import { THEME } from "../../../ui/theme.js";
import { viewProjectCardMediaImage } from "./image.js";

/**
 * @type {import("../props.js").ProjectCardView}
 */
export const viewProjectCardMedia = (props) => (attr, children) => {
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
