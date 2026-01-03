// @ts-check

import { tag, text } from "../library/html/index.js";
import { HEAD } from "./head.js";
import { THEME } from "./theme.js";

/**
 * @typedef {{size: "sm"; startDecorator?: import("../library/html/index.js").View; variant: "outlined" | "basic"; text: string}} ChipProps
 */

/**
 * Push CSS for the Chip component to the HEAD
 */
HEAD.push(
  tag("style", {}, [
    text(`
      .chip {
        font-size: 12px;
        line-height: 18px;
        max-width: max-content;
        border-radius: 3px;
        color: ${THEME.colors.neutral};
        background-color: ${THEME.colors.paper};
        overflow: hidden;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .chip-outlined {
        border: 1px solid ${THEME.colors.borderLight};
      }

      .chip-basic {
        border: 1px solid transparent;
      }

      .chip-decorator {
        width: 16px;
        height: 16px;
        overflow: hidden;
      }

      .chip-decorator img {
        width: 100%;
        height: 100%;
        object-fit: contain;
        display: block;
      }

      .chip-text {
        padding: 0px 6px;
      }
    `),
  ])
);

HEAD.push(
  tag("script", {}, [
    text(`
      function onChipImageError(e) {
        // Prevent the broken image icon from showing
        // Set to transparent 1x1 pixel so nothing shows
        e.target.src = 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'1\' height=\'1\'%3E%3C/svg%3E';
        e.target.alt = '';
        e.target.style.display = 'none';
      }

      function onChipImageLoad(e) {
        // Image loaded successfully, ensure it's visible
        e.target.style.display = 'block';
      }

      (function() {
        function handleChipImageError(e) {
          onChipImageError(e);
        }

        function handleChipImageLoad(e) {
          // Image loaded successfully, ensure it's visible
          e.target.style.display = 'block';
        }

        function setupChipImage(img) {
          // Remove alt text to prevent it from showing
          img.alt = '';
          
          // If image is already loaded (cached), show it immediately
          if (img.complete && img.naturalHeight !== 0) {
            img.style.display = 'block';
          } else {
            // Image is still loading, wait for load event
            img.style.display = 'block';
          }
          
          img.addEventListener('error', handleChipImageError);
          img.addEventListener('load', handleChipImageLoad);
        }

        // Handle existing images
        document.addEventListener('DOMContentLoaded', function() {
          const chipDecorators = document.querySelectorAll('.chip-decorator img');
          chipDecorators.forEach(setupChipImage);
        });

        // Handle dynamically added images
        const observer = new MutationObserver(function(mutations) {
          mutations.forEach(function(mutation) {
            mutation.addedNodes.forEach(function(node) {
              if (node.nodeType === 1) {
                const images = node.querySelectorAll ? node.querySelectorAll('.chip-decorator img') : [];
                images.forEach(setupChipImage);
              }
            });
          });
        });

        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', function() {
            observer.observe(document.body, { childList: true, subtree: true });
          });
        } else {
          observer.observe(document.body, { childList: true, subtree: true });
        }
      })();
    `),
  ])
);

/**
 * @type {import("../library/html/index.js").ViewWithProps<ChipProps>}
 */
export const viewChip = (props) => (attr, _children) => {
  const variantClass =
    props.variant === "outlined" ? "chip-outlined" : "chip-basic";

  return tag(
    "div",
    {
      ...attr,
      class: `chip ${variantClass}`,
    },
    [
      ...(props.startDecorator
        ? [
            props.startDecorator({
              class: "chip-decorator",
            }),
          ]
        : []),
      tag(
        "span",
        {
          class: "chip-text",
        },
        [text(props.text)]
      ),
    ]
  );
};
