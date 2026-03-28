import { tag, text } from "../../library/html/index";
import type { View } from "../../library/html/index";
import { HEAD } from "../../ui/head";
import { unit, THEME } from "../../ui/theme";
import { viewHeadingContact } from "./contact";
import { viewHeadingSectionText } from "./text/index";

export const viewHeadingSection: View = () => {
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
