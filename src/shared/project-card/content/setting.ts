// @ts-check

import { viewChip } from "../../../ui/chip.js";

/**
 * @type {import("../props.js").ProjectCardView}
 */
export const viewProjectSettingChip = (props) => (a, _c) => {
  return viewChip({
    size: "sm",
    variant: "basic",
    text: props.project.setting,
  })({
    ...a,
  });
};
