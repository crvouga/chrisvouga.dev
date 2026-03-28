// @ts-check

import { tag, text } from "../library/html/index.js";
import { HEAD } from "./head.js";
import { THEME } from "./theme.js";

/**
 * @typedef {"h1" | "h2" | "h3" | "title-sm" | "body-md" | "body-xs"} Level
 */

/**
 * @typedef {{level: Level; text: string}} Props
 */

/**
 * @param {Props} input
 * @returns {string}
 */
const toClassName = (input) => {
  switch (input.level) {
    case "h1":
      return "typography-h1";
    case "h2":
      return "typography-h2";
    case "h3":
      return "typography-h3";
    case "title-sm":
      return "typography-title-sm";
    case "body-md":
      return "typography-body-md";
    case "body-xs":
      return "typography-body-xs";
  }
};

HEAD.push(
  tag("style", {}, [
    text(`
      h1, h2, h3, p, h4 {
        margin: 0;
        padding: 0;
      }
      .typography-h1 {
        font-size: 36px;
        line-height: 48px;
        color: ${THEME.colors.text};
      }
      .typography-h2 {
        font-size: 30px;
        line-height: 40px;
        color: ${THEME.colors.text};
      }
      .typography-h3 {
        font-size: 24px;
        line-height: 32px;
        color: ${THEME.colors.text};
      }
      .typography-title-sm {
        font-size: 14px;
        font-weight: normal;
        line-height: 20px;
        color: ${THEME.colors.text};
      }
      .typography-body-md {
        font-size: 16px;
        line-height: 24px;
        font-weight: normal;
        color: ${THEME.colors.neutral};
      }
      .typography-body-xs {
        font-size: 12px;
        line-height: 18px;
        font-weight: normal;
        color: ${THEME.colors.neutral};
      }
    `),
  ])
);

const BASE_CLASS = "typography-base";

/**
 * @type {import("../library/html/index.js").ViewWithProps<Props>}
 */
export const viewTypography = (props) => (attrs, children) => {
  const tagName = (() => {
    switch (props.level) {
      case "h1":
        return "h1";
      case "h2":
        return "h2";
      case "h3":
        return "h3";
      case "title-sm":
        return "h4";
      case "body-md":
        return "p";
      case "body-xs":
        return "p";
    }
  })();

  const className = [BASE_CLASS, toClassName(props), attrs?.["class"]]
    .filter(Boolean)
    .join(" ");

  return tag(tagName, { ...attrs, class: className }, [
    text(props.text),
    ...(children ?? []),
  ]);
};
