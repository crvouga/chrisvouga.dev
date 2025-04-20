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
      
      .gallery-modal-video {
        max-width: 90%;
        max-height: 80vh;
        width: 80%;
        height: 80vh;
        border: none;
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
        font-size: 30px;
        font-weight: bold;
        cursor: pointer;
        background: rgba(0, 0, 0, 0.5);
        border: none;
        padding: 0;
        width: 50px;
        height: 50px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        z-index: 1001;
        transition: background-color 0.2s;
      }
      
      .gallery-modal-close:hover {
        background: rgba(0, 0, 0, 0.8);
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
        padding: 0;
        width: 50px;
        height: 50px;
        display: flex;
        align-items: center;
        justify-content: center;
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
          width: 40px;
          height: 40px;
        }
        
        .gallery-modal-close {
          font-size: 24px;
          width: 40px;
          height: 40px;
          top: 15px;
          right: 15px;
        }
        
        .gallery-modal-video {
          width: 90%;
          height: 50vh;
        }
      }
      
      loading-spinner {
        width: 60px;
        height: 60px;
      }
      
      .preloaded-images {
        display: none;
      }
    `;

    // Append style and container to shadow DOM
    shadow.appendChild(style);
    shadow.appendChild(container);

    // Create a container for preloaded images
    const preloadContainer = document.createElement("div");
    preloadContainer.className = "preloaded-images";
    shadow.appendChild(preloadContainer);

    // Store references to elements
    this.modal = container;
    this.imageContainer = imageContainer;
    this.preloadContainer = preloadContainer;
    this.counter = counter;
    this.currentIndex = 0;
    /** @type {string[]} */
    this.images = [];
    /** @type {string[]} */
    this.mediaTypes = [];
    /** @type {HTMLImageElement[]} */
    this.preloadedImages = [];

    // Add event listeners
    closeButton.addEventListener("click", () => this.closeModal());
    prevButton.addEventListener("click", () => this.prevImage());
    nextButton.addEventListener("click", () => this.nextImage());

    // Add click event listener to the modal backdrop to close it
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
   * Check if URL is a YouTube video
   * @param {string} url - URL to check
   * @returns {boolean} - True if URL is a YouTube video
   */
  isYouTubeUrl(url) {
    return url.includes("youtube.com/") || url.includes("youtu.be/");
  }

  /**
   * Extract YouTube video ID from URL
   * @param {string} url - YouTube URL
   * @returns {string} - YouTube video ID
   */
  getYouTubeVideoId(url) {
    let videoId = "";
    if (url.includes("youtube.com/watch")) {
      const urlParams = new URL(url).searchParams;
      videoId = urlParams.get("v") || "";
    } else if (url.includes("youtu.be/")) {
      videoId = url.split("youtu.be/")[1].split("?")[0];
    } else if (url.includes("youtube.com/embed/")) {
      videoId = url.split("youtube.com/embed/")[1].split("?")[0];
    }
    return videoId;
  }

  /**
   * Set the media items for the gallery
   * @param {string[]} media - Array of image URLs or YouTube URLs
   * @param {string} [alt="Gallery media"] - Alt text for images
   */
  setImages(media, alt = "Gallery media") {
    if (!Array.isArray(media)) {
      throw new Error("Media must be an array of URLs");
    }
    this.images = media;
    this.mediaTypes = media.map((url) =>
      this.isYouTubeUrl(url) ? "video" : "image"
    );
    this.imageAlt = alt;
  }

  /**
   * Preload all images in the gallery
   */
  preloadImages() {
    // Clear previous preloaded images
    this.preloadContainer.innerHTML = "";
    this.preloadedImages = [];

    // Only preload actual images, not videos
    const imagesToPreload = this.images.filter(
      (_, index) => this.mediaTypes[index] === "image"
    );

    // Create and load all images
    imagesToPreload.forEach((url) => {
      const img = document.createElement("img");
      img.src = url;
      img.alt = this.imageAlt || "Gallery image";
      img.className = "gallery-modal-image";
      this.preloadedImages.push(img);
      this.preloadContainer.appendChild(img);
    });
  }

  /**
   * Open the modal gallery at a specific index
   * @param {number} [index=0] - The index of the image to show
   */
  openModal(index = 0) {
    if (this.images.length === 0) {
      console.error("No media items have been set for the gallery");
      return;
    }

    this.currentIndex = index || 0;
    this.modal.style.display = "flex";
    document.body.style.overflow = "hidden";

    // Preload all images when opening the modal
    this.preloadImages();

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
   * Update the displayed media (image or video)
   */
  updateImage() {
    this.imageContainer.innerHTML = "";
    const currentUrl = this.images[this.currentIndex];
    const mediaType = this.mediaTypes[this.currentIndex];

    if (mediaType === "video") {
      // Handle YouTube video
      const videoId = this.getYouTubeVideoId(currentUrl);
      if (videoId) {
        // Create loading spinner
        const spinner = document.createElement("loading-spinner");
        spinner.setAttribute("data-spinner-color", "#ffffff");
        spinner.setAttribute(
          "data-spinner-color-light",
          "rgba(255, 255, 255, 0.2)"
        );
        spinner.setAttribute("data-spinner-size", "60px");
        this.imageContainer.appendChild(spinner);

        const iframe = document.createElement("iframe");
        iframe.className = "gallery-modal-video";
        iframe.src = `https://www.youtube.com/embed/${videoId}?autoplay=1`;
        iframe.title = this.imageAlt || "YouTube video";
        iframe.allow =
          "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
        iframe.setAttribute("allowfullscreen", "");
        iframe.style.display = "none"; // Hide iframe until loaded

        // Remove spinner when iframe is loaded
        iframe.addEventListener("load", () => {
          spinner.remove();
          iframe.style.display = "block";
        });

        this.imageContainer.appendChild(iframe);
      } else {
        console.error("Invalid YouTube URL:", currentUrl);
      }
    } else {
      // Handle image
      // Create loading spinner
      const spinner = document.createElement("loading-spinner");
      spinner.setAttribute("data-spinner-color", "#ffffff");
      spinner.setAttribute(
        "data-spinner-color-light",
        "rgba(255, 255, 255, 0.2)"
      );
      spinner.setAttribute("data-spinner-size", "60px");
      this.imageContainer.appendChild(spinner);

      // Find the preloaded image if it exists
      const preloadedImageIndex = this.preloadedImages.findIndex(
        (img) => img.src === currentUrl
      );

      if (preloadedImageIndex !== -1) {
        const preloadedImg = this.preloadedImages[preloadedImageIndex];
        const img = document.createElement("img");
        img.src = currentUrl;
        img.alt = this.imageAlt || "Gallery image";
        img.className = "gallery-modal-image";

        // If the image is already loaded, show it immediately
        if (preloadedImg.complete) {
          spinner.remove();
          this.imageContainer.appendChild(img);
        } else {
          // Otherwise wait for it to load
          img.style.display = "none";
          preloadedImg.onload = () => {
            spinner.remove();
            img.style.display = "block";
          };
          this.imageContainer.appendChild(img);
        }
      } else {
        // Fallback for any images that weren't preloaded
        const img = document.createElement("img");
        img.src = currentUrl;
        img.alt = this.imageAlt || "Gallery image";
        img.className = "gallery-modal-image";
        img.style.display = "none"; // Hide image until loaded

        img.onload = function () {
          // Use the correct type for 'this' in the event handler
          const imgElement = this;
          if (imgElement instanceof HTMLImageElement) {
            // Hide spinner and show image
            const container = imgElement.parentElement;
            if (container) {
              const spinnerElement = container.querySelector("loading-spinner");
              if (spinnerElement) {
                spinnerElement.remove();
              }
            }
            imgElement.style.display = "block";
          }
        };

        this.imageContainer.appendChild(img);
      }
    }

    // Update counter
    this.counter.textContent = `${this.currentIndex + 1} / ${
      this.images.length
    }`;
  }
}

customElements.define("image-gallery-modal", ImageGalleryModalElement);
