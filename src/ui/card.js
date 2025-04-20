// @ts-check

import { tag, text } from "../library/html/index.js";
import { HEAD } from "./head.js";
import { THEME, unit } from "./theme.js";

/**
 * @type {import("../library/html/index.js").View}
 */
export const viewCard = (attr, children) => {
  return tag("article", { ...attr, class: "card" }, children);
};

HEAD.push(
  tag("style", {}, [
    text(
      `
      .card {
        display: flex;
        flex-direction: column;
        background-color: ${THEME.colors.paper};
        border: 1px solid ${THEME.colors.paperBorder};
        border-radius: 8px;
        overflow: hidden;
        height: 100%;
      }
      `
    ),
  ])
);

/**
 * @type {import("../library/html/index.js").View}
 */
export const viewCardContent = (attrs, children) => {
  return tag("div", { ...attrs, class: "card-content" }, children);
};

HEAD.push(
  tag("style", {}, [
    text(
      `
      .card-content {
        padding: 16px;
        height: 100%;
        display: flex;
        flex-direction: column;
      
        
      }
      `
    ),
  ])
);

/**
 * @type {import("../library/html/index.js").View}
 */
export const viewCardActions = (attrs, children) => {
  return tag("div", { ...attrs, class: "card-actions" }, children);
};

HEAD.push(
  tag("style", {}, [
    text(
      `
      .card-actions {
        display: flex;
        padding-top: ${unit(2)};
        flex-direction: row;
        align-items: center;
        justify-content: flex-start;
        gap: ${unit(3)};
      }
      `
    ),
  ])
);
