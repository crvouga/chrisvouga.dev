import type { OpenImageGalleryModalJsFunction, ViewImageGalleryModalFunction } from "./interface";
import { fragment, tag, text } from "../../library/html/index";

export const openImageGalleryModalJs: OpenImageGalleryModalJsFunction = (props) => {
  const elementId = `${props.jsVarSafeNamespace}ImageGalleryModal`;

  return `document.getElementById('${elementId}').openModal(0);`;
};

export const viewImageGalleryModal: ViewImageGalleryModalFunction = (props) => () => {
  const elementId = `${props.jsVarSafeNamespace}ImageGalleryModal`;

  return fragment([
    tag("script", {}, [
      text(`
        window.addEventListener('load', function() {
          // Wait for a small delay to ensure all async scripts are fully loaded and processed
          setTimeout(() => {
            const galleryModal = document.getElementById('${elementId}');
            if (galleryModal) {
              galleryModal.setImages(${JSON.stringify(
                props.imageSrc
              )}, ${JSON.stringify(props.imageAlt || "Gallery image")});
            }
          }, 100);
        });
      `),
    ]),

    tag(
      "image-gallery-modal",
      {
        id: elementId,
        "data-skeleton-color": props.skeletonColor ?? "#f0f0f0",
      },
      []
    ),
  ]);
};
