import { fragment, tag, text } from "../../library/html/index.js";
import { HEAD } from "../../ui/head.js";
import { viewImage } from "../../ui/image.js";

/**
 * @type {import("../../library/html/index.js").ViewWithProps<{ school: import("../../content/school.js").School }>}
 */
export const viewSchoolCardImage = (props) => (attr, _) => {
  const alt = props.school.imageAlt || props.school.institutionName;
  const src = props.school.imageSrc;

  return fragment([
    tag(
      "button",
      {
        type: "button",
        onclick: `window.openImageGalleryModal({ images: [{ src: "${src}", alt: "${alt}" }] })`,
        "aria-label": `View ${alt} in full screen`,
        class: "school-card-image-button",
      },
      [
        tag("div", { class: "school-card-image-container" }, [
          viewImage({ src, alt })(
            {
              ...attr,
              class: "school-card-image",
            },
            []
          ),
        ]),
      ]
    ),
  ]);
};

HEAD.push(
  tag("style", {}, [
    text(`
      .school-card-image-container {
        width: 100%;
        aspect-ratio: 4 / 3;
      }
      .school-card-image {
        overflow: hidden;
        flex-shrink: 0;
        width: 100%;
        max-width: 100%;
        height: 100%;
        max-height: 100%;
        object-fit: cover;
      }
    `),
  ])
);
