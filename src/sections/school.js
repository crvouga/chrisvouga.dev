// @ts-check

import { CONTENT } from "../content/content.js";
import { viewEducationCard } from "../shared/education-card/index.js";
import { viewSection } from "../shared/section.js";
import { viewGridCollapsible } from "../ui/grid-collapsible.js";

/**
 * @type {import("../library/html/index.js").View}
 */
export const viewSchoolSection = () => {
  return viewSection({ title: "School" })({}, [
    viewGridCollapsible({
      children: CONTENT.SCHOOL.map((education) =>
        viewEducationCard({ education })()
      ),
      jsVarSafeNamespace: "schoolSection",
    })(),
  ]);
};
