import * as implElement from "./impl-element.js";
import * as implTemplate from "./impl-template.js";

/**
 * @typedef {import("./interface.js").ImageGalleryModalProps} ImageGalleryModalProps
 * @typedef {import("./interface.js").OpenImageGalleryModalJsFunction} OpenImageGalleryModalJsFunction
 * @typedef {import("./interface.js").ViewImageGalleryModalFunction} ViewImageGalleryModalFunction
 */

/**
 * @typedef {"element" | "template"} Impl
 */

/**
 *
 * @param {Impl} x
 * @returns {Impl}
 */
const of = (x) => x;

const IMPL = of("element");

/**
 * @type {OpenImageGalleryModalJsFunction}
 */
export const openImageGalleryModalJs = (props) => {
  switch (IMPL) {
    case "element":
      return implElement.openImageGalleryModalJs(props);
    case "template":
      return implTemplate.openImageGalleryModalJs(props);
  }
};

/**
 * @type {ViewImageGalleryModalFunction}
 */
export const viewImageGalleryModal = (props) => () => {
  switch (IMPL) {
    case "element":
      return implElement.viewImageGalleryModal(props)();
    case "template":
      return implTemplate.viewImageGalleryModal(props)();
  }
};
