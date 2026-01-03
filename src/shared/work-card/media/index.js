// @ts-check

import { tag, text } from "../../../library/html/index.js";
import { HEAD } from "../../../ui/head.js";
import { THEME } from "../../../ui/theme.js";
import { viewWorkCardMediaImage } from "./image.js";

/**
 * @type {import("../../../library/html/index.js").ViewWithProps<{work: import("../../../content/work.js").Work; fetchPriority?: "high" | "auto"}>}
 */
export const viewWorkCardMedia = (props) => (attr, children) => {
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
        background-color: #000000;
      }
      .work-card-media .image,
      .work-card-media .gallery-image {
        background-color: #000000 !important;
      }
    `),
  ])
);
