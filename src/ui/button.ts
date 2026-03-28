// @ts-check

import { tag, text } from "../library/html/index.js";
import { HEAD } from "./head.js";
import { THEME } from "./theme.js";

/**
 * @typedef {{tag:string; startDecorator: import("../library/html/index.js").View | null, size: "sm" | "lg" | "xl"; variant: "soft" | "plain" | "contained"; disabled: boolean; text: string}} Props
 */

/**
 * @param {Props} input
 * @returns {string}
 */
const toTag = (input) => {
  return input.tag;
};

/**
 *
 * @param {Props} props
 * @returns {string}
 */
const toClassName = (props) => {
  /**
   * @type {string[]}
   */
  const classNames = [];
  classNames.push("btn");
  switch (props.variant) {
    case "soft":
      classNames.push("btn-soft");
      break;
    case "plain":
      classNames.push("btn-plain");
      break;
    case "contained":
      classNames.push("btn-contained");
      break;
  }

  switch (props.size) {
    case "sm":
      classNames.push("btn-sm");
      break;
    case "lg":
      classNames.push("btn-lg");
      break;
    case "xl":
      classNames.push("btn-xl");
      break;
  }

  if (props.disabled) {
    classNames.push("btn-disabled");
  }

  return classNames.join(" ");
};

/**
 * @type {import("../library/html/index.js").ViewWithProps<Props>}
 */
export const viewButton = (props) => (attrs, children) => {
  const tagName = toTag(props);

  return tag(
    tagName,
    {
      class: toClassName(props),
      ...(props.disabled
        ? {
            disabled: "true",
            "aria-disabled": "true",
            tabindex: "-1",
          }
        : {}),
      ...attrs,
    },
    [
      ...(props.startDecorator
        ? [
            props.startDecorator({
              class: "btn-start-decorator",
            }),
          ]
        : []),
      text(props.text),
      ...(children ?? []),
    ]
  );
};

/**
 * @type {import("../library/html/index.js").ViewWithProps<{}>}
 */
export const viewButtonStyles = (_props) => (_attrs, _children) => {
  return tag("style", {}, [
    text(`
      .btn {
        user-select: none;
        transition: background-color 0.2s, color 0.2s;
        display: flex;
        align-items: center;
        justify-content: center;
        margin: 0;
        cursor: pointer;
        text-decoration: none;
        white-space: nowrap;
        text-overflow: ellipsis;
        overflow: hidden;
        border: none;
        outline: none;
      }

      .btn:focus-visible {
        outline: 2px solid ${THEME.colors.softText};
        outline-offset: 2px;
      }

      .btn-sm {
        padding: 6px 16px;
        font-size: 14px;
        line-height: 21px;
        border-radius: 3.5px;
      }

      .btn-start-decorator  {
        flex-shrink: 0;
        margin-right: 8px;
        margin-left: -4px;
      }

      .btn-sm > .btn-start-decorator {
        width: 20px;
        height: 20px;
      }

      .btn-lg {
        padding: 12px 24px;
        font-size: 16px;
        line-height: 24px;
        border-radius: 6px;
      }

      .btn-lg > .btn-start-decorator {
        width: 24px;
        height: 24px;
      }

      .btn-xl {
        padding: 14px 28px;
        font-size: 18px;
        line-height: 26px;
        border-radius: 8px;
      }

      .btn-xl > .btn-start-decorator {
        width: 28px;
        height: 28px;
      }

      .btn.btn-disabled {
        cursor: not-allowed;
        pointer-events: none; 
      }

      .btn-soft {
        background-color: ${THEME.colors.softBackground};
        color: ${THEME.colors.softText};
        fill: ${THEME.colors.softText};
      }

      .btn-soft.btn-disabled {
        background-color: ${THEME.colors.softBackgroundDisabled};
        color: ${THEME.colors.softTextDisabled};
        fill: ${THEME.colors.softTextDisabled};
      }

      .btn-soft:hover {
        background-color: ${THEME.colors.softBackgroundHover};
        color: ${THEME.colors.softTextHover};
        fill: ${THEME.colors.softTextHover};
      }

      .btn-soft:active {
        background-color: ${THEME.colors.softBackgroundActive};
        color: ${THEME.colors.softTextActive};
        fill: ${THEME.colors.softTextActive};
      }

      .btn-plain {
        background-color: ${THEME.colors.plainBackground};
        color: ${THEME.colors.plainText};
        fill: ${THEME.colors.plainText};
      }

      .btn-plain.btn-disabled {
        background-color: ${THEME.colors.plainBackground};
        color: ${THEME.colors.plainTextDisabled};
        fill: ${THEME.colors.plainTextDisabled};
      }

      .btn-plain:hover {
        background-color: ${THEME.colors.plainBackgroundHover};
        color: ${THEME.colors.plainTextHover};
        fill: ${THEME.colors.plainTextHover};
      }

      .btn-plain:active {
        background-color: ${THEME.colors.plainBackgroundActive};
        color: ${THEME.colors.plainTextActive};
        fill: ${THEME.colors.plainTextActive};
      }




      .btn-contained {
        background-color: ${THEME.colors.containedBackground};
        color: ${THEME.colors.containedText};
        fill: ${THEME.colors.containedText};
      }

      .btn-contained.btn-disabled {
        background-color: ${THEME.colors.containedBackground};
        color: ${THEME.colors.containedTextDisabled};
        fill: ${THEME.colors.containedTextDisabled};
      }

      .btn-contained:hover {
        background-color: ${THEME.colors.containedBackgroundHover};
        color: ${THEME.colors.containedTextHover};
        fill: ${THEME.colors.containedTextHover};
      }

      .btn-contained:active {
        background-color: ${THEME.colors.containedBackgroundActive};
        color: ${THEME.colors.containedTextActive};
        fill: ${THEME.colors.containedTextActive};
      }


    `),
  ]);
};

HEAD.push(viewButtonStyles({})());
