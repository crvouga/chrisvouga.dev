import { TOPIC_TO_IMAGE_SRC, TOPIC_TO_NAME } from "../../../content/topic.js";
import { fragment, tag, text } from "../../../library/html/index.js";
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
        const src = TOPIC_TO_IMAGE_SRC[topic];
        return viewChip({
          size: "sm",
          startDecorator: () =>
            src
              ? tag("img", {
                  src,
                  alt: "",
                  style: {
                    width: "16px",
                    height: "16px",
                  },
                  onerror: "onChipImageError(event)",
                  onload: "onChipImageLoad(event)",
                })
              : fragment([]),
          variant: "outlined",
          text: TOPIC_TO_NAME[topic],
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
