import { TOPIC_TO_IMAGE_SRC, TOPIC_TO_NAME } from "../../../content/topic";
import { fragment, tag, text } from "../../../library/html/index";
import { viewChip } from "../../../ui/chip";
import { HEAD } from "../../../ui/head";
import { unit } from "../../../ui/theme";
import type { ProjectCardView } from "../props";

export const viewProjectCardContentChips: ProjectCardView = (props) => () => {
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
