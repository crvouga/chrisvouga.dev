import { topicToImageSrc, topicToName } from "../../../content/topic.js";
import { tag, text } from "../../../library/html/index.js";
import { viewAvatar } from "../../../ui/avatar.js";
import { viewChip } from "../../../ui/chip.js";
import { HEAD } from "../../../ui/head.js";
import { unit } from "../../../ui/theme.js";

/**
 * @type {import("../props.js").ProjectCardView}
 */
export const viewProjectCardContentChips = (props) => () => {
  return tag("div", {}, [
    tag("div", { class: "project-card-content-chips" }, [
      ...props.project.topics.sort().map((topic) => {
        const src = topicToImageSrc[topic];
        return viewChip({
          size: "sm",
          startDecorator: viewAvatar({ src, alt: topic }),
          variant: "outlined",
          text: topicToName[topic],
        })();
      }),
    ]),
  ]);
};

HEAD.push(
  tag("style", {}, [
    text(`
      .project-card-content-chips {
        display: flex;
        flex-wrap: wrap;
        gap: ${unit(1)};
        padding: ${unit(1)} 0px;
      }
    `),
  ])
);
