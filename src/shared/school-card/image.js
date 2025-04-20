import { tag, text } from "../../library/html/index.js";
import { stringToJsVarSafe } from "../../library/js-var.js";
import { HEAD } from "../../ui/head.js";
import { viewOpenGalleryButtonImageWrapper } from "../../ui/image-gallery-modal/open-gallery-button-image-wrapper.js";

/**
 * @type {import("../../library/html/index.js").ViewWithProps<{ school: import("../../content/school.js").School }>}
 */
export const viewSchoolCardImage = (props) => (attr, _) => {
  const alt = props.school.imageAlt || props.school.institutionName;
  const src = props.school.imageSrc;
  const jsVarSafeNamespace = stringToJsVarSafe(props.school.institutionName);

  return tag("div", { class: "school-card-image-container" }, [
    viewOpenGalleryButtonImageWrapper({
      src,
      alt,
      galleryImages: props.school.galleryImageSrc,
      jsVarSafeNamespace,
      showGalleryIndicator: true,
    })({ ...attr, class: "school-card-image" }, []),
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
