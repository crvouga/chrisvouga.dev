// @ts-check
import { tag, text } from "src/library/html/index.js";
import { HEAD } from "src/ui/head.js";
import { THEME } from "src/ui/theme.js";

/**
 * @type {import("src/library/html/index.js").View}
 */
export const viewGrid = (attr, children) => {
  return tag(
    "div",
    {
      ...attr,
      class: "grid",
    },
    children
  );
};

/**
 * @type {import("src/library/html/index.js").View}
 */
export const viewGridItem = (a, c) => {
  return tag(
    "div",
    {
      ...a,
      class: ["grid-item", a?.class].filter(Boolean).join(" "),
    },
    c
  );
};

/**
 *
 * @returns {import("src/library/html/index.js").Html}
 */
const viewGridStyles = () => {
  return tag("style", {}, [
    text(
      `
      .grid {
        display: flex;
        flex-wrap: wrap;
        margin: -12px;
        min-width: 0px;
        box-sizing: border-box;
        align-items: stretch;
        overflow: hidden;
      }
        
      .grid-item {
        min-height: 100%; 
        padding: 12px;
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
      }

      @media (min-width: ${THEME.breakpoints.xs}) {
        .grid-item {
          width: 100%;
        }
      }
  
      @media (min-width: ${THEME.breakpoints.sm}) {
        .grid-item {
          width: 50%;
        }
      }
  
      @media (min-width: ${THEME.breakpoints.md}) {
        .grid-item {
          width: 33.33%;
        }
      }`
    ),
  ]);
};

HEAD.push(viewGridStyles());
