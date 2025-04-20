// @ts-check

import { fragment, tag, text } from "../../../library/html/index.js";
import { stringToJsVarSafe } from "../../../library/js-var.js";
import { HEAD } from "../../../ui/head.js";
import { images } from "../../../ui/icons.js";
import {
  openImageGalleryModalJs,
  viewImageGalleryModal,
} from "../../../ui/image-gallery-modal/impl.js";
import { viewImage } from "../../../ui/image.js";

/**
 * @type {import("../props.js").ProjectCardView}
 */
export const viewProjectCardMediaImage = (props) => {
  const src = props.project?.imageSrc?.[0];
  if (src) {
    return viewProjectCardMediaImageMain(props);
  }
  return viewProjectCardMediaGradient(props);
};

/**
 * @type {import("../props.js").ProjectCardView}
 */
const viewProjectCardMediaImageMain = (props) => (attr, _) => {
  const alt = props.project?.imageAlt;
  const src = props.project?.imageSrc?.[0] ?? " ";
  const jsVarSafeNamespace = stringToJsVarSafe(props.project.title);
  return fragment([
    tag(
      "button",
      {
        onclick: openImageGalleryModalJs({
          jsVarSafeNamespace,
        }),
        "aria-label": "Open image gallery",
        title: "Click to view image gallery",
        type: "button",
        class: "project-card-media-image-button",
      },
      [
        viewImage({ src, alt })(
          { ...attr, class: "project-card-media-image" },
          []
        ),
        tag("div", { class: "project-card-media-gallery-indicator" }, [
          images({
            fill: "currentColor",
            width: 28,
            height: 28,
          }),
        ]),
      ]
    ),
    viewImageGalleryModal({
      imageAlt: alt,
      imageSrc: props.project?.galleryImageSrc ?? [],
      jsVarSafeNamespace,
    })(),
  ]);
};

HEAD.push(
  tag("style", {}, [
    text(`
      .project-card-media-image {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }
      .project-card-media-image-button {
        width: 100%;
        height: 100%;
        display: block;
        cursor: pointer;
        padding: 0;
        margin: 0;
        border: none;
        background: none;
        position: relative;
        overflow: hidden;
      }
      .project-card-media-gallery-indicator {
        position: absolute;
        bottom: 8px;
        right: 8px;
        background: rgba(0, 0, 0, 0.7);
        color: white;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
      }
    `),
  ])
);

/**
 * @type {import("../props.js").ProjectCardView}
 */
const viewProjectCardMediaGradient = (_) => (attr, _) => {
  return tag("div", { ...attr, class: "project-card-media-gradient" }, []);
};

HEAD.push(
  tag("style", {}, [
    text(`
      .project-card-media-gradient {
        width: 100%;
        height: 100%;
        background: linear-gradient(to right bottom, #2196f3, #8e24aa);
      }
    `),
  ])
);
