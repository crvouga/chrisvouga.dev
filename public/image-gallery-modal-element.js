// @ts-ignore
class ImageGalleryModalElement extends HTMLElement {
  constructor() {
    super();

    const shadow = this.attachShadow({ mode: "open" });

    // Create container for the modal
    const container = document.createElement("div");
    container.className = "gallery-modal";

    // Create close button
    const closeButton = document.createElement("button");
    closeButton.className = "gallery-modal-close";
    closeButton.textContent = "×";
    closeButton.setAttribute("aria-label", "Close gallery");

    // Create previous button
    const prevButton = document.createElement("button");
    prevButton.className = "gallery-modal-nav gallery-modal-prev";
    prevButton.textContent = "❮";
    prevButton.setAttribute("aria-label", "Previous image");

    // Create next button
    const nextButton = document.createElement("button");
    nextButton.className = "gallery-modal-nav gallery-modal-next";
    nextButton.textContent = "❯";
    nextButton.setAttribute("aria-label", "Next image");

    // Create image container
    const imageContainer = document.createElement("div");
    imageContainer.className = "gallery-modal-image-container";

    // Create counter
    const counter = document.createElement("div");
    counter.className = "gallery-modal-counter";
    counter.textContent = "1 / 1";

    // Append all elements to the main container
    container.appendChild(imageContainer);
    container.appendChild(counter);
    container.appendChild(closeButton);
    container.appendChild(prevButton);
    container.appendChild(nextButton);

    // Create styles
    const style = document.createElement("style");
    style.textContent = `
      .gallery-modal {
        display: none;
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0, 0, 0, 0.9);
        z-index: 1000;
      }
            
      .gallery-modal-image-container {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        display: flex;
        justify-content: center;
        align-items: center;
      }
      
      .gallery-modal-image {
        max-width: 90%;
        max-height: 80vh;
        object-fit: contain;
        background-color: var(--skeleton-color, #f0f0f0);
      }
      
      .gallery-modal-counter {
        position: absolute;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        color: white;
        font-size: 1rem;
        text-align: center;
        padding: 5px 10px;
        background-color: rgba(0, 0, 0, 0.5);
        border-radius: 4px;
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
      
      .animate-pulse {
        animation: pulse 1.5s infinite;
      }
      
      @keyframes pulse {
        0% { opacity: 0.6; }
        50% { opacity: 1; }
        100% { opacity: 0.6; }
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
    `;

    // Append style and container to shadow DOM
    shadow.appendChild(style);
    shadow.appendChild(container);

    // Store references to elements
    this.modal = container;
    this.imageContainer = imageContainer;
    this.counter = counter;
    this.currentIndex = 0;
    /** @type {string[]} */
    this.images = [];

    // Add event listeners
    closeButton.addEventListener("click", () => this.closeModal());
    prevButton.addEventListener("click", () => this.prevImage());
    nextButton.addEventListener("click", () => this.nextImage());
    container.addEventListener("click", (event) => {
      if (event.target === container) {
        this.closeModal();
      }
    });

    // Keyboard navigation
    window.addEventListener("keydown", (event) => {
      if (this.modal.style.display === "flex") {
        if (event.key === "ArrowRight") {
          this.nextImage();
        } else if (event.key === "ArrowLeft") {
          this.prevImage();
        } else if (event.key === "Escape") {
          this.closeModal();
        }
      }
    });
  }

  connectedCallback() {
    this.updateCSSVariables();
  }

  /**
   * @param {unknown} name
   * @param {unknown} _oldValue
   * @param {unknown} _newValue
   */
  attributeChangedCallback(name, _oldValue, _newValue) {
    if (name === "data-skeleton-color") {
      this.updateCSSVariables();
    }
  }

  static get observedAttributes() {
    return ["data-skeleton-color"];
  }

  updateCSSVariables() {
    const skeletonColor = this.getAttribute("data-skeleton-color");
    if (skeletonColor) {
      this.style.setProperty("--skeleton-color", skeletonColor);
    }
  }

  /**
   * Set the images for the gallery
   * @param {string[]} images - Array of image URLs
   * @param {string} [alt="Gallery image"] - Alt text for images
   */
  setImages(images, alt = "Gallery image") {
    if (!Array.isArray(images)) {
      throw new Error("Images must be an array of URLs");
    }
    this.images = images;
    this.imageAlt = alt;
  }

  /**
   * Open the modal gallery at a specific index
   * @param {number} [index=0] - The index of the image to show
   */
  openModal(index = 0) {
    if (this.images.length === 0) {
      console.error("No images have been set for the gallery");
      return;
    }

    this.currentIndex = index || 0;
    this.modal.style.display = "flex";
    document.body.style.overflow = "hidden";
    this.updateImage();
  }

  /**
   * Close the modal gallery
   */
  closeModal() {
    this.modal.style.display = "none";
    document.body.style.overflow = "";
  }

  /**
   * Show the next image in the gallery
   */
  nextImage() {
    this.currentIndex = (this.currentIndex + 1) % this.images.length;
    this.updateImage();
  }

  /**
   * Show the previous image in the gallery
   */
  prevImage() {
    this.currentIndex =
      (this.currentIndex - 1 + this.images.length) % this.images.length;
    this.updateImage();
  }

  /**
   * Update the displayed image
   */
  updateImage() {
    this.imageContainer.innerHTML = "";
    const img = document.createElement("img");
    img.src = this.images[this.currentIndex];
    img.alt = this.imageAlt || "Gallery image";
    img.className = "gallery-modal-image animate-pulse";
    img.onload = function () {
      // Use the correct type for 'this' in the event handler
      const imgElement = this;
      if (imgElement instanceof HTMLImageElement) {
        imgElement.classList.remove("animate-pulse");
      }
    };
    this.imageContainer.appendChild(img);

    // Update counter
    this.counter.textContent = `${this.currentIndex + 1} / ${
      this.images.length
    }`;
  }
}

customElements.define("image-gallery-modal", ImageGalleryModalElement);
