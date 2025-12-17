// @ts-check

import { fragment, tag, text } from "../../library/html/index.js";
import { stringToJsVarSafe } from "../../library/js-var.js";
import { HEAD } from "../../ui/head.js";
import { images } from "../../ui/icons.js";
import {
  openImageGalleryModalJs,
  viewImageGalleryModal,
} from "../../ui/image-gallery-modal/impl.js";
import { viewImage } from "../../ui/image.js";

/**
 * @typedef {Object} OpenGalleryButtonImageWrapperProps
 * @property {string} src - The source URL of the main image
 * @property {string} [alt] - The alt text for the image
 * @property {string[]} galleryImages - Array of image URLs for the gallery
 * @property {string} [jsVarSafeNamespace] - Namespace for JS variables
 * @property {boolean} [showGalleryIndicator=true] - Whether to show the gallery indicator
 * @property {"high" | "auto"} [fetchPriority] - The fetch priority for the image
 * @property {string} [skeletonColor] - Background color for images with transparency
 */

/**
 * @type {import("../../library/html/index.js").ViewWithProps<OpenGalleryButtonImageWrapperProps>}
 */
export const viewOpenGalleryButtonImageWrapper = (props) => (attr, _) => {
  const {
    src,
    alt = "",
    galleryImages,
    jsVarSafeNamespace = stringToJsVarSafe(alt || "gallery"),
    showGalleryIndicator = true,
    fetchPriority = "auto",
    skeletonColor,
  } = props;

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
        class: "gallery-image-button",
      },
      [
        viewImage({ src, alt, fetchPriority })(
          { ...attr, class: "gallery-image" },
          []
        ),
        tag("div", { class: "gallery-hover-overlay" }, [
          tag("span", { class: "gallery-hover-text" }, [
            text("Click to view gallery"),
          ]),
        ]),
        ...(showGalleryIndicator
          ? [
              tag("div", { class: "gallery-indicator" }, [
                images({
                  fill: "currentColor",
                  width: 28,
                  height: 28,
                }),
              ]),
            ]
          : []),
      ]
    ),
    viewImageGalleryModal({
      imageAlt: alt,
      imageSrc: galleryImages,
      jsVarSafeNamespace,
      ...(skeletonColor ? { skeletonColor } : {}),
    })(),
  ]);
};

HEAD.push(
  tag("style", {}, [
    text(`
      .gallery-image {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
        transition: transform 0.2s ease;
      }
      .gallery-image-button {
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
      .gallery-indicator {
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
      .gallery-hover-overlay {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.6);
        display: none;
        align-items: center;
        justify-content: center;
        opacity: 0;
        transition: opacity 0.2s ease;
      }
      .gallery-hover-text {
        color: white;
        font-size: 18px;
        font-weight: 600;
        text-align: center;
        padding: 0 16px;
      }
      @media (hover: hover) and (pointer: fine) {
        .gallery-hover-overlay {
          display: flex;
        }
        .gallery-indicator {
          display: none;
        }
        .gallery-image-button:hover .gallery-image {
          transform: scale(1.03);
        }
        .gallery-image-button:hover .gallery-hover-overlay {
          opacity: 1;
        }
      }
    `),
  ])
);
