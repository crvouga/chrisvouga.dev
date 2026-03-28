import { CONTENT } from "../../content/content";
import type { View } from "../../library/html/index";
import { viewProjectCard } from "../../shared/project-card/index";
import { viewSection } from "../../shared/section";
import { viewGridCollapsible } from "../../ui/grid-collapsible";

export const viewSideProjectsSection: View = () => {
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
