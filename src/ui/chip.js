// @ts-check

import { tag, text } from "../library/html/index.js";
import { HEAD } from "./head.js";
import { THEME } from "./theme.js";

/**
 * @typedef {{size: "sm"; startDecorator?: import("../library/html/index.js").View; variant: "outlined" | "basic"; text: string}} ChipProps
 */

/**
 * Push CSS for the Chip component to the HEAD
 */
HEAD.push(
  tag("style", {}, [
    text(`
      .chip {
        font-size: 12px;
        line-height: 18px;
        max-width: max-content;
        border-radius: 24px;
        color: ${THEME.colors.neutral};
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 3px;
      }

      .chip-outlined {
        border: 1px solid ${THEME.colors.borderLight};
      }

      .chip-basic {
        border: 1px solid transparent;
      }

      .chip-decorator {
        width: 16px;
        height: 16px;
        overflow: hidden;
      }

      .chip-text {
        padding: 0px 6px;
      }
    `),
  ])
);

/**
 * @type {import("../library/html/index.js").ViewWithProps<ChipProps>}
 */
export const viewChip = (props) => (attr, _children) => {
  const variantClass =
    props.variant === "outlined" ? "chip-outlined" : "chip-basic";

  return tag(
    "div",
    {
      ...attr,
      class: `chip ${variantClass}`,
    },
    [
      ...(props.startDecorator
        ? [
            props.startDecorator({
              class: "chip-decorator",
            }),
          ]
        : []),
      tag(
        "span",
        {
          class: "chip-text",
        },
        [text(props.text)]
      ),
    ]
  );
};
