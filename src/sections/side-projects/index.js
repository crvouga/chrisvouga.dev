import { CONTENT } from "../../content/content.js";
import { viewProjectCard } from "../../shared/project-card/index.js";
import { viewSection } from "../../shared/section.js";
import { viewGridCollapsible } from "../../ui/grid-collapsible.js";

/**
 * @type {import("../../library/html/index.js").View}
 */
export const viewSideProjectsSection = () => {
  return viewSection({
    title: "Side Projects",
  })({}, [
    viewGridCollapsible({
      children: CONTENT.SIDE_PROJECTS.map((project) =>
        viewProjectCard({ project })()
      ),
      jsVarSafeNamespace: "sideProjectsSection",
    })(),
  ]);
};
