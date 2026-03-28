import type { Html, View } from "../library/html/index";
import { tag, text } from "../library/html/index";
import { HEAD } from "./head";
import { THEME } from "./theme";

export const viewGrid: View = (attr, children) => {
  return tag(
    "div",
    {
      ...attr,
      class: "grid",
    },
    children
  );
};

export const viewGridItem: View = (a, c) => {
  return tag(
    "div",
    {
      ...a,
      class: ["grid-item", a?.["class"]].filter(Boolean).join(" "),
    },
    c
  );
};

const viewGridStyles = (): Html => {
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
