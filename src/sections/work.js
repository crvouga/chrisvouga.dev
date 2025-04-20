// @ts-check

import { CONTENT } from "../content/content.js";
import { viewSection } from "../shared/section.js";
import { viewWorkCard } from "../shared/work-card.js";
import { viewGridCollapsible } from "../ui/grid-collapsible.js";

/**
 * @type {import("../library/html/index.js").View}
 */
export const viewWorkSection = () => {
  return viewSection({
    title: CONTENT.WORK_SECTION_TITLE,
  })({}, [
    viewGridCollapsible({
      children: CONTENT.WORK.map((work) => viewWorkCard({ work })()),
      jsVarSafeNamespace: "workSection",
    })(),
  ]);
};
