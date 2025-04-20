import { fragment, tag, text } from "../../library/html/index.js";
import { stringToJsVarSafe } from "../../library/js-var.js";
import { HEAD } from "../../ui/head.js";
import {
  openImageGalleryModalJs,
  viewImageGalleryModal,
} from "../../ui/image-gallery-modal/impl.js";
import { viewImage } from "../../ui/image.js";
import { THEME } from "../../ui/theme.js";

/**
 * @type {import("../../library/html/index.js").ViewWithProps<{ education: import("../../content/school.js").School }>}
 */
export const viewEducationCardImage = (props) => (attr, _) => {
  const alt = props.education.institutionName;
  const src = props.education.imageSrc;
  const jsVarSafeNamespace = stringToJsVarSafe(props.education.institutionName);

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
        class: "education-card-image-button",
      },
      [
        viewImage({ src, alt })({ ...attr, class: "education-card-image" }, []),
        tag("span", { class: "education-card-image-overlay" }, [
          text("View Gallery"),
        ]),
      ]
    ),
    viewImageGalleryModal({
      imageAlt: alt,
      imageSrc: [props.education.imageSrc],
      jsVarSafeNamespace,
    })(),
  ]);
};

HEAD.push(
  tag("style", {}, [
    text(`
      .education-card-image {
        aspect-ratio: 4 / 3;
        overflow: hidden;
        flex-shrink: 0;
        width: 100%;
        object-fit: cover;
        border-bottom: 1px solid ${THEME.colors.paperBorder};
      }
      .education-card-image-button {
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
      .education-card-image-overlay {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        background-color: rgba(0, 0, 0, 0.6);
        color: white;
        font-weight: bold;
        opacity: 0;
        transition: opacity 0.3s ease;
      }
      .education-card-image-button:hover .education-card-image-overlay {
        opacity: 1;
      }
      .education-card-image-button:hover .education-card-image {
        opacity: 0.9;
        transition: opacity 0.2s ease;
      }
    `),
  ])
);
