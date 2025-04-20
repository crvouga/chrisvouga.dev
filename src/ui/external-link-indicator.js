/**
 * Appends an external link indicator (↗) to the provided text
 * @param {Object} input - Input parameters
 * @param {string} input.text - The text to append the external link indicator to
 * @param {string} [input.fontSize="20px"] - The font size of the indicator
 * @param {string} [input.paddingLeft="6px"] - The padding left of the indicator
 * @returns {string} The text with the external link indicator appended
 */
export const appendExternalLinkIndicator = ({
  text,
  fontSize = "0.8em",
  paddingLeft = "0.3em",
}) => {
  return `${text}<span style="font-size: ${fontSize}; padding-left: ${paddingLeft}; text-decoration: none; display: inline-block;">↗</span>`;
};
