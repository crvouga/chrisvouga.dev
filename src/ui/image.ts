import { fragment, tag, text } from "../library/html/index.js";
import { HEAD } from "./head.js";
import { THEME } from "./theme.js";

/**
 * @type {import("../library/html/index.js").ViewWithProps<{src: string, alt: string, fetchPriority?: "high" | "auto"}>}
 */
export const viewImage = (props) => (attr, _) => {
  /**
   * @type {Record<string, any>}
   */
  const imgAttributes = {
    ...attr,
    src: props.src,
    alt: props.alt || "",
    class: ["image animate-pulse", attr?.["class"]].filter(Boolean).join(" "),
    onload: "this.classList.remove('animate-pulse')",
    onerror: "onImageError(event)",
  };

  if (props.fetchPriority) {
    imgAttributes["fetchpriority"] = props.fetchPriority;
  }

  if (props.fetchPriority === "high") {
    imgAttributes["loading"] = "eager";
  }

  return fragment([tag("img", imgAttributes, [])]);
};

HEAD.push(
  tag("script", {}, [
    text(`
      function onImageError(e) {
        // Prevent the broken image icon from showing
        // Set to transparent 1x1 pixel so background skeleton shows through
        e.target.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1' height='1'%3E%3C/svg%3E";
        e.target.alt = '';
        // Keep the skeleton animation visible - don't remove animate-pulse class
        // The transparent image allows the background-color to show through
      }

      // Check for cached images after DOM is ready
      function checkCachedImages() {
        const images = document.querySelectorAll('.image.animate-pulse');
        images.forEach(function(img) {
          // If image is already loaded (cached), remove pulse animation immediately
          if (img.complete && img.naturalHeight !== 0) {
            img.classList.remove('animate-pulse');
          }
        });
      }

      // Run check after DOM is ready
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
          // Use requestAnimationFrame to ensure DOM is fully processed
          requestAnimationFrame(function() {
            checkCachedImages();
          });
        });
      } else {
        // DOM is already ready, check immediately
        requestAnimationFrame(function() {
          checkCachedImages();
        });
      }
      `),
  ])
);

HEAD.push(
  tag("style", {}, [
    text(`
    .image {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
      background-color: ${THEME.colors.skeleton};
    }
    .animate-pulse {
        animation: pulse 1.5s infinite;
    }
    
    @keyframes pulse {
        0%, 100% {
            opacity: 0.5;
        }
        50% {
            opacity: 1;
        }
    }
        `),
  ])
);
