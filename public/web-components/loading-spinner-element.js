// @ts-ignore
class LoadingSpinnerElement extends HTMLElement {
  constructor() {
    super();

    const shadow = this.attachShadow({ mode: "open" });

    const container = document.createElement("div");
    container.className = "spinner-container";

    const spinner = document.createElement("div");
    spinner.className = "spinner";

    const style = document.createElement("style");
    style.textContent = `
      .spinner-container {
          display: flex;
          justify-content: center;
          align-items: center;
          width: 100%;
          height: 100%;
      }

      .spinner {
          width: var(--spinner-size, 40px);
          height: var(--spinner-size, 40px);
          border: var(--spinner-thickness, 4px) solid var(--spinner-color-light, rgba(0, 0, 0, 0.1));
          border-top: var(--spinner-thickness, 4px) solid var(--spinner-color, #333);
          border-radius: 50%;
          animation: spin 1s linear infinite;
      }

      @keyframes spin {
          0% {
              transform: rotate(0deg);
          }
          100% {
              transform: rotate(360deg);
          }
      }
    `;

    container.appendChild(spinner);
    shadow.appendChild(style);
    shadow.appendChild(container);

    this.container = container;
    this.spinner = spinner;
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
      name === "data-spinner-color" ||
      name === "data-spinner-color-light" ||
      name === "data-spinner-size" ||
      name === "data-spinner-thickness"
    ) {
      this.updateCSSVariables();
    }
  }

  static get observedAttributes() {
    return [
      "data-spinner-color",
      "data-spinner-color-light",
      "data-spinner-size",
      "data-spinner-thickness",
    ];
  }

  updateCSSVariables() {
    const spinnerColor = this.getAttribute("data-spinner-color");
    const spinnerColorLight = this.getAttribute("data-spinner-color-light");
    const spinnerSize = this.getAttribute("data-spinner-size");
    const spinnerThickness = this.getAttribute("data-spinner-thickness");

    if (spinnerColor) {
      this.style.setProperty("--spinner-color", spinnerColor);
    }
    if (spinnerColorLight) {
      this.style.setProperty("--spinner-color-light", spinnerColorLight);
    }
    if (spinnerSize) {
      this.style.setProperty("--spinner-size", spinnerSize);
    }
    if (spinnerThickness) {
      this.style.setProperty("--spinner-thickness", spinnerThickness);
    }
  }

  /**
   * Show the spinner
   */
  show() {
    this.style.display = "block";
  }

  /**
   * Hide the spinner
   */
  hide() {
    this.style.display = "none";
  }
}

customElements.define("loading-spinner", LoadingSpinnerElement);
