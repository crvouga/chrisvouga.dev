// @ts-ignore
class ToasterElement extends HTMLElement {
  constructor() {
    super();

    const shadow = this.attachShadow({ mode: "open" });

    const container = document.createElement("div");
    container.className = "toast-container";

    const style = document.createElement("style");
    style.textContent = `
      .toast-container {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          padding-top: 1rem;
          width: 100vw;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: flex-start;
          gap: 0.5rem;
          z-index: 1000;
      }

      .toast {
          background-color: var(--toast-bg-color, #333);
          color: var(--toast-text-color, white);
          border: 1px solid var(--toast-border-color);
          padding: 1rem 1rem;
          border-radius: 5px;
          width: 100%;
          max-width: 300px;
          box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
          transform: translateY(-20px);
          animation: slide-in 0.3s forwards, slide-out 0.3s 2.5s forwards;
      }

      @keyframes slide-in {
          from {
              transform: translateY(-20px);
          }

          to {
              transform: translateY(0);
          }
      }

      @keyframes slide-out {
          from {
              transform: translateY(0);
          }

          to {
              transform: translateY(calc(-100% + -20px));
          }
      }
    `;

    shadow.appendChild(style);
    shadow.appendChild(container);

    this.container = container;
    this.currentToast = null;
  }

  connectedCallback() {
    this.updateCSSVariables();
  }

  /**
   *
   * @param {unknown} name
   * @param {unknown} _oldValue
   * @param {unknown} _newValue
   */
  attributeChangedCallback(name, _oldValue, _newValue) {
    if (
      name === "data-bg-color" ||
      name === "data-text-color" ||
      name === "data-border-color"
    ) {
      this.updateCSSVariables();
    }
  }

  static get observedAttributes() {
    return ["data-bg-color", "data-text-color", "data-border-color"];
  }

  updateCSSVariables() {
    const bgColor = this.getAttribute("data-bg-color");
    const textColor = this.getAttribute("data-text-color");
    const borderColor = this.getAttribute("data-border-color");

    if (bgColor) {
      this.style.setProperty("--toast-bg-color", bgColor);
    }
    if (textColor) {
      this.style.setProperty("--toast-text-color", textColor);
    }
    if (borderColor) {
      this.style.setProperty("--toast-border-color", borderColor);
    }
  }
  /**
   * Show a toast message, ensuring only one toast is displayed at a time.
   * @param {string} message - The message to display in the toast.
   */
  async showToast(message) {
    if (typeof message !== "string") {
      throw new Error("Message must be a string");
    }

    if (this.currentToast) {
      this.currentToast.style.animation = "slide-out 0.3s forwards";
      await new Promise((resolve) => {
        this.currentToast?.addEventListener("animationend", resolve, {
          once: true,
        });
      });
      this.currentToast.remove();
      this.currentToast = null;
    }

    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;

    this.container.appendChild(toast);
    this.currentToast = toast;

    setTimeout(() => {
      if (this.currentToast === toast) {
        this.currentToast.style.animation = "none";
        void this.currentToast.offsetHeight;
        this.currentToast.style.animation = "slide-out 0.3s forwards";

        this.currentToast.addEventListener(
          "animationend",
          () => {
            if (this.currentToast === toast) {
              this.currentToast.remove();
              this.currentToast = null;
            }
          },
          { once: true }
        );
      }
    }, 2500);
  }
}

customElements.define("toaster-element", ToasterElement);
