// @ts-check

import { CONTENT } from "../content/content.js";
import { viewSchoolCard } from "../shared/school-card/index.js";
import { viewSection } from "../shared/section.js";
import { viewGridCollapsible } from "../ui/grid-collapsible.js";

/**
 * @type {import("../library/html/index.js").View}
 */
export const viewSchoolSection = () => {
  return viewSection({ title: CONTENT.SCHOOL_SECTION_TITLE })({}, [
    viewGridCollapsible({
      children: CONTENT.SCHOOL.map((education) =>
        viewSchoolCard({ school: education })()
      ),
      jsVarSafeNamespace: "schoolSection",
    })(),
  ]);
};
