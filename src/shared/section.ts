// @ts-check

import { tag, text } from "../library/html/index.js";
import { HEAD } from "../ui/head.js";
import { viewSectionTitle } from "./section-title.js";

/**
 * @type {(props: {title:string, subtitle?:string}) => import("../library/html/index.js").View}
 */
export const viewSection = (props) => (attr, c) => {
  return tag(
    "section",
    {
      ...attr,
      class: "section",
    },
    [viewSectionTitle(props)(), ...(c ?? [])]
  );
};

HEAD.push(
  tag("style", {}, [
    text(`
    .section {
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 24px;
    }
  `),
  ])
);
