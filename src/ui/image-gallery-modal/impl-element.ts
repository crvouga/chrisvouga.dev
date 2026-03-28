import { fragment, tag, text } from "../../library/html/index.js";

/**
 * @typedef {import("./interface.js").ImageGalleryModalProps} ImageGalleryModalProps
 * @typedef {import("./interface.js").OpenImageGalleryModalJsFunction} OpenImageGalleryModalJsFunction
 * @typedef {import("./interface.js").ViewImageGalleryModalFunction} ViewImageGalleryModalFunction
 */

/**
 * Creates a function that opens the image gallery modal
 * @type {OpenImageGalleryModalJsFunction}
 */
export const openImageGalleryModalJs = (props) => {
  const elementId = `${props.jsVarSafeNamespace}ImageGalleryModal`;

  return `document.getElementById('${elementId}').openModal(0);`;
};

/**
 * @type {ViewImageGalleryModalFunction}
 */
export const viewImageGalleryModal = (props) => () => {
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
