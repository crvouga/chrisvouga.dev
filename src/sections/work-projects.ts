import { CONTENT } from "../content/content";
import type { View } from "../library/html/index";
import { viewProjectCard } from "../shared/project-card/index";
import { viewSection } from "../shared/section";
import { viewGridCollapsible } from "../ui/grid-collapsible";

export const viewWorkProjectsSection: View = (a, _) => {
  return viewSection({
    title: "Work Projects",
  })(a, [
    viewGridCollapsible({
      children: CONTENT.WORK_PROJECTS.map((project) =>
        viewProjectCard({ project })()
      ),
      jsVarSafeNamespace: "workProjectsSection",
    })(),
  ]);
};
