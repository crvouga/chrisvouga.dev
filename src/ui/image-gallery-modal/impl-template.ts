import { fragment, tag, text } from "../../library/html/index.js";
import { HEAD } from "../head.js";
import { THEME, unit } from "../theme.js";

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
  const namespace = `${props.jsVarSafeNamespace}ImageGalleryModal`;
  const openModalFunctionName = `${namespace}openModal`;

  return `${openModalFunctionName}(0);`;
};

/**
 * @type {ViewImageGalleryModalFunction}
 */
export const viewImageGalleryModal = (props) => () => {
  const namespace = `${props.jsVarSafeNamespace}ImageGalleryModal`;
  const modalId = `${namespace}modal`;
  const imageContainerId = `${namespace}image-container`;
  const currentIndexVarName = `${namespace}currentIndex`;
  const totalImagesVarName = `${namespace}totalImages`;
  const openModalFunctionName = `${namespace}openModal`;
  const closeModalFunctionName = `${namespace}closeModal`;
  const nextImageFunctionName = `${namespace}nextImage`;
  const prevImageFunctionName = `${namespace}prevImage`;
  const updateImageFunctionName = `${namespace}updateImage`;

  return fragment([
    tag("script", {}, [
      text(`
        let ${currentIndexVarName} = 0;
        const ${totalImagesVarName} = ${JSON.stringify(props.imageSrc)}.length;
        
        function ${openModalFunctionName}(index) {
          ${currentIndexVarName} = index || 0;
          const modal = document.getElementById('${modalId}');
          modal.style.display = 'flex';
          document.body.style.overflow = 'hidden';
          ${updateImageFunctionName}();
        }
        
        function ${closeModalFunctionName}() {
          const modal = document.getElementById('${modalId}');
          modal.style.display = 'none';
          document.body.style.overflow = '';
        }
        
        function ${nextImageFunctionName}() {
          ${currentIndexVarName} = (${currentIndexVarName} + 1) % ${totalImagesVarName};
          ${updateImageFunctionName}();
        }
        
        function ${prevImageFunctionName}() {
          ${currentIndexVarName} = (${currentIndexVarName} - 1 + ${totalImagesVarName}) % ${totalImagesVarName};
          ${updateImageFunctionName}();
        }
        
        function ${updateImageFunctionName}() {
          const container = document.getElementById('${imageContainerId}');
          const imageSrcs = ${JSON.stringify(props.imageSrc)};
          const imageAlt = ${JSON.stringify(props.imageAlt || "Gallery image")};
          
          container.innerHTML = '';
          const img = document.createElement('img');
          img.src = imageSrcs[${currentIndexVarName}];
          img.alt = imageAlt;
          img.className = 'gallery-modal-image animate-pulse';
          img.onload = function() {
            this.classList.remove('animate-pulse');
          };
          container.appendChild(img);
          
          // Update counter
          const counter = document.getElementById('${namespace}counter');
          counter.textContent = \`\${${currentIndexVarName} + 1} / \${${totalImagesVarName}}\`;
        }
        
        // Close modal when clicking outside the image
        window.addEventListener('click', function(event) {
          const modal = document.getElementById('${modalId}');
          if (event.target === modal) {
            ${closeModalFunctionName}();
          }
        });
        
        // Keyboard navigation
        window.addEventListener('keydown', function(event) {
          const modal = document.getElementById('${modalId}');
          if (modal.style.display === 'flex') {
            if (event.key === 'ArrowRight') {
              ${nextImageFunctionName}();
            } else if (event.key === 'ArrowLeft') {
              ${prevImageFunctionName}();
            } else if (event.key === 'Escape') {
              ${closeModalFunctionName}();
            }
          }
        });
      `),
    ]),

    // Modal
    tag(
      "div",
      {
        id: modalId,
        class: "gallery-modal",
      },
      [
        // Close button
        tag(
          "button",
          {
            class: "gallery-modal-close",
            onclick: `${closeModalFunctionName}()`,
            "aria-label": "Close gallery",
          },
          [text("×")]
        ),

        // Previous button
        tag(
          "button",
          {
            class: "gallery-modal-nav gallery-modal-prev",
            onclick: `${prevImageFunctionName}()`,
            "aria-label": "Previous image",
          },
          [text("❮")]
        ),

        // Image container
        tag(
          "div",
          {
            class: "gallery-modal-content",
          },
          [
            tag(
              "div",
              { id: imageContainerId, class: "gallery-modal-image-container" },
              []
            ),
            tag(
              "div",
              { id: `${namespace}counter`, class: "gallery-modal-counter" },
              [text("1 / 1")]
            ),
          ]
        ),

        // Next button
        tag(
          "button",
          {
            class: "gallery-modal-nav gallery-modal-next",
            onclick: `${nextImageFunctionName}()`,
            "aria-label": "Next image",
          },
          [text("❯")]
        ),
      ]
    ),
  ]);
};

HEAD.push(
  tag("style", {}, [
    text(`
      .gallery-modal {
        display: none;
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0, 0, 0, 0.9);
        z-index: 1000;
        justify-content: center;
        align-items: center;
      }
      
      .gallery-modal-content {
        position: relative;
        max-width: 90%;
        max-height: 90%;
        display: flex;
        flex-direction: column;
        align-items: center;
      }
      
      .gallery-modal-image-container {
        display: flex;
        justify-content: center;
        align-items: center;
        max-width: 100%;
        max-height: 80vh;
      }
      
      .gallery-modal-image {
        max-width: 100%;
        max-height: 80vh;
        object-fit: contain;
        background-color: ${THEME.colors.skeleton};
      }
      
      .gallery-modal-counter {
        color: white;
        margin-top: ${unit(1)};
        font-size: 1rem;
      }
      
      .gallery-modal-close {
        position: absolute;
        top: 15px;
        right: 25px;
        color: white;
        font-size: 40px;
        font-weight: bold;
        cursor: pointer;
        background: none;
        border: none;
        z-index: 1001;
      }
      
      .gallery-modal-nav {
        position: absolute;
        top: 50%;
        transform: translateY(-50%);
        color: white;
        font-size: 30px;
        font-weight: bold;
        cursor: pointer;
        background: rgba(0, 0, 0, 0.5);
        border: none;
        padding: 10px 15px;
        border-radius: 50%;
        z-index: 1001;
        transition: background-color 0.2s;
      }
      
      .gallery-modal-nav:hover {
        background: rgba(0, 0, 0, 0.8);
      }
      
      .gallery-modal-prev {
        left: 20px;
      }
      
      .gallery-modal-next {
        right: 20px;
      }
      
      @media (max-width: 768px) {
        .gallery-modal-nav {
          font-size: 24px;
          padding: 8px 12px;
        }
        
        .gallery-modal-close {
          font-size: 30px;
          top: 10px;
          right: 15px;
        }
      }
    `),
  ])
);
