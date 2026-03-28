import type { View } from "../library/html/index";
import { tag, text } from "../library/html/index";
import { HEAD } from "./head";
import { THEME, unit } from "./theme";

export const viewCard: View = (attr, children) => {
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

export const viewCardContent: View = (attrs, children) => {
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

export const viewCardActions: View = (attrs, children) => {
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
