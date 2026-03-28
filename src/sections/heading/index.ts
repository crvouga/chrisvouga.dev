// @ts-check
import { tag, text } from "../../library/html/index.js";
import { HEAD } from "../../ui/head.js";
import { unit, THEME } from "../../ui/theme.js";
import { viewHeadingContact } from "./contact.js";
import { viewHeadingSectionText } from "./text/index.js";

/**
 * @type {import("../../library/html/index.js").View}
 */
export const viewHeadingSection = () => {
  return tag(
    "header",
    {
      class: "header",
    },
    [viewHeadingSectionText(), viewHeadingContact({})()]
  );
};

HEAD.push(
  tag("style", {}, [
    text(`
    .header {
      display: flex;
      justify-content: space-between;
      max-width: 100%;
      flex-direction: column;
      gap: ${unit(4)};
    }

    @media (max-width: ${THEME.breakpoints.xs}) {
      .header {
        flex-direction: column;
        align-items: flex-start;
        gap: ${unit(2)};
      }
    }

    @media (min-width: ${THEME.breakpoints.sm}) {
      .header {
        flex-direction: row;
        align-items: flex-end;
        gap: ${unit(2)};
      }
    }

    @media (min-width: ${THEME.breakpoints.md}) {
      .header {
        gap: ${unit(4)};
      }
    }
    `),
  ])
);
