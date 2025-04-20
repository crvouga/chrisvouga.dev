// @ts-check

import { data } from "../content/index.js";
import { viewSection } from "../shared/section.js";
import { viewWorkCard } from "../shared/work-card.js";
import { viewGridCollapsible } from "../ui/grid-collapsible.js";

/**
 * @type {import("../library/html/index.js").View}
 */
export const viewWorkSection = () => {
  return viewSection({
    title: "Work",
  })({}, [
    viewGridCollapsible({
      children: data.work.map((work) => viewWorkCard({ work })()),
      jsVarSafeNamespace: "workSection",
    })(),
  ]);
};
