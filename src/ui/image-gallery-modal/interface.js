/**
 * @typedef {Object} ImageGalleryModalProps
 * @property {string} jsVarSafeNamespace - Unique namespace for the modal
 * @property {string[]} imageSrc - Array of image URLs to display in the gallery
 * @property {string} [imageAlt] - Alt text for the images
 */

/**
 * Interface for creating JavaScript code that opens an image gallery modal
 * @typedef {(input: {
 *   jsVarSafeNamespace: string,
 * }) => string} OpenImageGalleryModalJsFunction
 */

/**
 * Interface for rendering an image gallery modal
 * @typedef {import("../../library/html/index.js").ViewWithProps<ImageGalleryModalProps>} ViewImageGalleryModalFunction
 */

/**
 * Interface for the Image Gallery Modal module
 * @typedef {Object} ImageGalleryModalInterface
 * @property {OpenImageGalleryModalJsFunction} openImageGalleryModalJs - Function to generate JS code for opening the modal
 * @property {ViewImageGalleryModalFunction} viewImageGalleryModal - Function to render the image gallery modal
 */
