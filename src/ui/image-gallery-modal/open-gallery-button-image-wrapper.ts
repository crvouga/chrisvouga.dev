import type { ViewWithProps } from "../../library/html/index";
import { fragment, tag, text } from "../../library/html/index";
import { stringToJsVarSafe } from "../../library/js-var";
import { HEAD } from "../../ui/head";
import { images } from "../../ui/icons";
import {
  openImageGalleryModalJs,
  viewImageGalleryModal,
} from "../../ui/image-gallery-modal/impl";
import { viewImage } from "../../ui/image";

type OpenGalleryButtonImageWrapperProps = {
  src: string;
  alt?: string;
  galleryImages: string[];
  jsVarSafeNamespace?: string;
  showGalleryIndicator?: boolean;
  fetchPriority?: "high" | "auto";
  skeletonColor?: string;
};

export const viewOpenGalleryButtonImageWrapper: ViewWithProps<OpenGalleryButtonImageWrapperProps> = (props) => (attr, _) => {
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
