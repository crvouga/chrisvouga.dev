import { viewChip } from "../../../ui/chip";
import type { ProjectCardView } from "../props";

export const viewProjectSettingChip: ProjectCardView = (props) => (a, _c) => {
  return viewChip({
    size: "sm",
    variant: "basic",
    text: props.project.setting,
  })({
    ...a,
  });
};
