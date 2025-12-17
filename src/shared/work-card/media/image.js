// @ts-check

import { tag, text } from "../../../library/html/index.js";
import { stringToJsVarSafe } from "../../../library/js-var.js";
import { HEAD } from "../../../ui/head.js";
import { viewOpenGalleryButtonImageWrapper } from "../../../ui/image-gallery-modal/open-gallery-button-image-wrapper.js";

/**
 * @type {import("../../../library/html/index.js").ViewWithProps<{work: import("../../../content/work.js").Work}>}
 */
export const viewWorkCardMediaImage = (props) => {
  const src = props.work?.imageSrc?.[0];
  if (src) {
    return viewWorkCardMediaImageMain(props);
  }
  return viewWorkCardMediaGradient(props);
};

/**
 * @type {import("../../../library/html/index.js").ViewWithProps<{work: import("../../../content/work.js").Work; fetchPriority?: "high" | "auto"}>}
 */
const viewWorkCardMediaImageMain = (props) => (attr, _) => {
  const alt = props.work?.imageAlt ?? "";
  const src = props.work?.imageSrc?.[0] ?? " ";
  const jsVarSafeNamespace = stringToJsVarSafe(props.work.name);

  return viewOpenGalleryButtonImageWrapper({
    src,
    alt,
    galleryImages: props.work?.galleryImageSrc ?? [],
    jsVarSafeNamespace,
    showGalleryIndicator: true,
    fetchPriority: props.fetchPriority ?? "auto",
    skeletonColor: "#000000",
  })({ ...attr, class: "work-card-media-image" }, []);
};

HEAD.push(
  tag("style", {}, [
    text(`
      .work-card-media-image {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
        background-color: #000000;
      }
    `),
  ])
);

/**
 * @type {import("../../../library/html/index.js").ViewWithProps<{work: import("../../../content/work.js").Work}>}
 */
const viewWorkCardMediaGradient = (_) => (attr, _) => {
  return tag("div", { ...attr, class: "work-card-media-gradient" }, []);
};

HEAD.push(
  tag("style", {}, [
    text(`
      .work-card-media-gradient {
        width: 100%;
        height: 100%;
        background: linear-gradient(to right bottom, #2196f3, #8e24aa);
      }
    `),
  ])
);
