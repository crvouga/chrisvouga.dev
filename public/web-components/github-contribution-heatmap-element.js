// @ts-ignore
class GitHubContributionHeatmapElement extends HTMLElement {
  constructor() {
    super();
    this.username = null;
    this.calendarInitialized = false;
    this.container = null;
    this.calendarContainer = null;
    this.stylesInjected = false;
  }

  /**
   * Inject component styles into the document head
   * (Dark mode, overrides light backgrounds, colors, legend, and error style)
   */
  injectStyles() {
    if (this.stylesInjected) {
      return;
    }

    const styleId = "github-contribution-heatmap-styles";
    if (document.getElementById(styleId)) {
      this.stylesInjected = true;
      return;
    }

    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      /* GitHub Contribution Heatmap Styles - Dark Mode */
      github-contribution-heatmap .heatmap-container {
        width: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1rem;
      }

      github-contribution-heatmap .calendar {
        width: 100%;
        background-color: #0d1117 !important;
        padding: 1.5rem;
        border-radius: 8px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
        color: #c9d1d9 !important;
      }

      /* Override all text colors for dark mode */
      github-contribution-heatmap .calendar,
      github-contribution-heatmap .calendar *,
      github-contribution-heatmap .calendar p,
      github-contribution-heatmap .calendar div,
      github-contribution-heatmap .calendar span {
        color: #c9d1d9 !important;
      }

      github-contribution-heatmap .calendar .contrib-number {
        color: #c9d1d9 !important;
      }

      github-contribution-heatmap .calendar .text-muted {
        color: #8b949e !important;
      }

      github-contribution-heatmap .calendar .contrib-legend {
        color: #8b949e !important;
      }

      github-contribution-heatmap .calendar a {
        color: #58a6ff !important;
        text-decoration: none;
      }

      github-contribution-heatmap .calendar a:hover {
        text-decoration: underline;
      }

      /* Hide global stats section */
      github-contribution-heatmap .calendar .contrib-column {
        display: none !important;
      }

      /* SVG and calendar grid - dark mode */
      github-contribution-heatmap .calendar svg {
        max-width: 100%;
        height: auto;
        background-color: transparent !important;
      }

      /* Calendar day squares - dark mode colors */
      github-contribution-heatmap .calendar rect[data-level="0"],
      github-contribution-heatmap .calendar rect.ContributionCalendar-day[data-level="0"] {
        fill: #161b22 !important;
      }

      github-contribution-heatmap .calendar rect[data-level="1"],
      github-contribution-heatmap .calendar rect.ContributionCalendar-day[data-level="1"] {
        fill: #0e4429 !important;
      }

      github-contribution-heatmap .calendar rect[data-level="2"],
      github-contribution-heatmap .calendar rect.ContributionCalendar-day[data-level="2"] {
        fill: #006d32 !important;
      }

      github-contribution-heatmap .calendar rect[data-level="3"],
      github-contribution-heatmap .calendar rect.ContributionCalendar-day[data-level="3"] {
        fill: #26a641 !important;
      }

      github-contribution-heatmap .calendar rect[data-level="4"],
      github-contribution-heatmap .calendar rect.ContributionCalendar-day[data-level="4"] {
        fill: #39d353 !important;
      }

      /* All rect elements in the calendar should use dark mode */
      github-contribution-heatmap .calendar svg rect {
        fill: #161b22 !important;
      }

      /* Loading and error states */
      github-contribution-heatmap .calendar .heatmap-error {
        color: #f85149 !important;
        background: #161b22 !important;
        font-size: 1rem;
        padding: 1rem;
        border-radius: 6px;
        margin-top: 10px;
        text-align: center;
      }

      /* Tooltips - light background for dark mode */
      github-contribution-heatmap .calendar .tooltipped,
      github-contribution-heatmap .calendar .contrib-tooltip,
      github-contribution-heatmap .calendar [data-tooltip] {
        color: #0d1117 !important;
        background: #c9d1d9 !important;
      }

      /* Month labels and day labels */
      github-contribution-heatmap .calendar text {
        fill: #8b949e !important;
      }

      /* Responsive adjustments */
      @media (max-width: 768px) {
        github-contribution-heatmap .calendar {
          padding: 1rem;
        }
      }
    `;

    document.head.appendChild(style);
    this.stylesInjected = true;
  }

  connectedCallback() {
    // Inject component styles
    this.injectStyles();

    // Initialize DOM structure when connected
    if (!this.container) {
      const container = document.createElement("div");
      container.className = "heatmap-container";

      const calendarContainer = document.createElement("div");
      calendarContainer.className = "calendar";
      // The library requires this loading text
      calendarContainer.textContent = "Loading the data just for you.";

      container.appendChild(calendarContainer);
      this.appendChild(container);

      this.container = container;
      this.calendarContainer = calendarContainer;
    }

    this.username = this.getAttribute("data-username");
    if (this.username) {
      // Wait a bit to ensure DOM is fully ready
      setTimeout(() => {
        this.initializeCalendar();
      }, 100);
    } else {
      this.showError("GitHub username is required");
    }
  }

  /**
   * @param {unknown} name
   * @param {unknown} _oldValue
   * @param {unknown} _newValue
   */
  attributeChangedCallback(name, _oldValue, _newValue) {
    if (name === "data-username") {
      this.username = this.getAttribute("data-username");
      if (this.username && !this.calendarInitialized) {
        this.initializeCalendar();
      }
    }
  }

  static get observedAttributes() {
    return ["data-username"];
  }

  /**
   * @param {string} message
   */
  showError(message) {
    if (this.calendarContainer) {
      this.calendarContainer.innerHTML = `
        <div class="heatmap-error">${message}</div>
      `;
    }
  }

  /**
   * Load CSS stylesheet
   * @param {string} href
   * @returns {Promise<void>}
   */
  loadStylesheet(href) {
    return new Promise((resolve, reject) => {
      // Check if stylesheet is already loaded
      const existingLink = document.querySelector(`link[href="${href}"]`);
      if (existingLink) {
        resolve();
        return;
      }

      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      link.onload = () => resolve();
      link.onerror = () =>
        reject(new Error(`Failed to load stylesheet: ${href}`));
      document.head.appendChild(link);
    });
  }

  /**
   * Load the github-calendar library and initialize the calendar
   */
  async initializeCalendar() {
    if (this.calendarInitialized || !this.calendarContainer) {
      return;
    }

    try {
      // Load the CSS first
      try {
        await this.loadStylesheet(
          "https://unpkg.com/github-calendar@latest/dist/github-calendar-responsive.css"
        );
      } catch (cssError) {
        console.warn("Failed to load github-calendar CSS:", cssError);
      }

      // Check if GitHubCalendar is already available
      // @ts-ignore - GitHubCalendar is added by the external library
      if (typeof window.GitHubCalendar === "undefined") {
        console.log("Loading github-calendar library...");
        // Load the library script
        await this.loadScript(
          "https://unpkg.com/github-calendar@latest/dist/github-calendar.min.js"
        );
      }

      // Wait for the script to fully initialize
      let retries = 0;
      while (
        // @ts-ignore
        typeof window.GitHubCalendar === "undefined" &&
        retries < 20
      ) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        retries++;
      }

      // Check if GitHubCalendar is now available
      // @ts-ignore - GitHubCalendar is added by the external library
      if (typeof window.GitHubCalendar === "undefined") {
        throw new Error("Failed to load github-calendar library");
      }

      // Ensure the container has the correct structure
      // The library expects a div with class "calendar" containing the loading text
      this.calendarContainer.className = "calendar";
      if (
        !this.calendarContainer.textContent ||
        this.calendarContainer.textContent.trim() === ""
      ) {
        this.calendarContainer.textContent = "Loading the data just for you.";
      }

      // Ensure the element is in the DOM
      if (!document.contains(this.calendarContainer)) {
        throw new Error("Calendar container is not in the DOM");
      }

      // Wait a bit to ensure DOM and CSS are ready
      await new Promise((resolve) => setTimeout(resolve, 100));

      console.log(`Initializing calendar for user: ${this.username}`);

      // Use a unique class selector for this instance to avoid conflicts
      // Create a unique class name
      const uniqueClass = `calendar-${Date.now()}-${Math.random()
        .toString(36)
        .substr(2, 9)}`;
      this.calendarContainer.className = `calendar ${uniqueClass}`;

      // Initialize with responsive option, disable global stats, and use proxy for CORS
      // @ts-ignore - GitHubCalendar is added by the external library
      const result = window.GitHubCalendar(`.${uniqueClass}`, this.username, {
        responsive: true,
        global_stats: false,
        /**
         * @param {string} username
         * @returns {Promise<Response>}
         */
        proxy: (username) => {
          // Use a CORS proxy to fetch GitHub contribution data
          const githubUrl = `https://github.com/users/${username}/contributions`;
          const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(
            githubUrl
          )}`;

          return fetch(proxyUrl, {
            headers: {
              Accept:
                "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            },
          }).then((response) => {
            if (!response.ok) {
              throw new Error(`Proxy fetch failed: ${response.statusText}`);
            }
            return response;
          });
        },
      });

      // The library returns a promise, wait for it to complete
      if (result && typeof result.then === "function") {
        await result;
      }

      this.calendarInitialized = true;
      console.log("Calendar initialized successfully");
    } catch (error) {
      console.error("Error initializing calendar:", error);
      this.showError(
        `Failed to load contribution data. ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Dynamically load a script
   * @param {string} src
   * @returns {Promise<void>}
   */
  loadScript(src) {
    return new Promise((resolve, reject) => {
      // Check if script is already loaded
      const existingScript = document.querySelector(`script[src="${src}"]`);
      if (existingScript) {
        resolve();
        return;
      }

      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
      document.head.appendChild(script);
    });
  }
}

customElements.define(
  "github-contribution-heatmap",
  GitHubContributionHeatmapElement
);
