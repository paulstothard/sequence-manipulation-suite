const SIDEBAR_WIDTH_STORAGE_KEY = "sms3-sidebar-width";
const SIDEBAR_MIN_WIDTH = 216;
const SIDEBAR_MAX_WIDTH = 440;
const SIDEBAR_VIEWPORT_MARGIN = 16;
const TOOL_OPTIONS_WIDTH_STORAGE_KEY = "sms3-tool-options-width";
const TOOL_OPTIONS_MIN_WIDTH = 256;
const TOOL_OPTIONS_MAX_WIDTH = 640;
const THEME_BACKGROUNDS = {
  light: "#f7f8fa",
  dark: "#111418"
};

export function createAppLayoutController({ elements }) {
  const mobileNavigationQuery = window.matchMedia("(max-width: 880px)");

  function applyTheme(theme) {
    const next = theme === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    document.documentElement.style.colorScheme = next;
    document.documentElement.style.backgroundColor = THEME_BACKGROUNDS[next];
    elements.themeToggle.checked = next === "dark";
  }

  function applyStoredTheme() {
    const theme = localStorage.getItem("sms3-theme");
    applyTheme(theme === "dark" || (!theme && window.matchMedia("(prefers-color-scheme: dark)").matches)
      ? "dark"
      : "light");
  }

  function clampSidebarWidth(width) {
    const viewportLimit = Math.max(SIDEBAR_MIN_WIDTH, Math.floor(window.innerWidth * 0.45));
    return Math.min(Math.max(width, SIDEBAR_MIN_WIDTH), Math.min(SIDEBAR_MAX_WIDTH, viewportLimit));
  }

  function setSidebarWidth(width, { persist = false } = {}) {
    const clamped = clampSidebarWidth(width);
    elements.appShell.style.setProperty("--sidebar-width", `${clamped}px`);
    if (persist) {
      localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(clamped));
    }
  }

  function applyStoredSidebarWidth() {
    const stored = Number.parseFloat(localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY) ?? "");
    if (Number.isFinite(stored)) {
      setSidebarWidth(stored);
    }
  }

  function updateSidebarAvailableHeight() {
    if (mobileNavigationQuery.matches || elements.appShell.classList.contains("sidebar-collapsed")) {
      elements.appShell.style.removeProperty("--sidebar-available-height");
      return;
    }

    const sidebarTop = Math.max(
      SIDEBAR_VIEWPORT_MARGIN,
      elements.toolNav.getBoundingClientRect().top
    );
    const availableHeight = Math.max(
      120,
      Math.floor(window.innerHeight - sidebarTop - SIDEBAR_VIEWPORT_MARGIN)
    );
    elements.appShell.style.setProperty("--sidebar-available-height", `${availableHeight}px`);
  }

  function clampToolOptionsWidth(width) {
    const editorWidth = elements.editorGrid.getBoundingClientRect().width || window.innerWidth;
    const editorLimit = Math.max(TOOL_OPTIONS_MIN_WIDTH, Math.floor(editorWidth * 0.62));
    return Math.min(Math.max(width, TOOL_OPTIONS_MIN_WIDTH), Math.min(TOOL_OPTIONS_MAX_WIDTH, editorLimit));
  }

  function setToolOptionsWidth(width, { persist = false } = {}) {
    const clamped = clampToolOptionsWidth(width);
    elements.appShell.style.setProperty("--tool-options-width", `${clamped}px`);
    if (persist) {
      localStorage.setItem(TOOL_OPTIONS_WIDTH_STORAGE_KEY, String(clamped));
    }
  }

  function applyStoredToolOptionsWidth() {
    const stored = Number.parseFloat(localStorage.getItem(TOOL_OPTIONS_WIDTH_STORAGE_KEY) ?? "");
    if (Number.isFinite(stored)) {
      setToolOptionsWidth(stored);
    }
  }

  function applyStoredSidebarState() {
    const collapsed = localStorage.getItem("sms3-sidebar") === "collapsed";
    elements.appShell.classList.toggle("sidebar-collapsed", collapsed);
    elements.appShell.classList.remove("sidebar-mobile-open");
    applyStoredSidebarWidth();
    applyStoredToolOptionsWidth();
    updateSidebarToggleState();
    updateSidebarAvailableHeight();
  }

  function startSidebarResize(event) {
    if (mobileNavigationQuery.matches || event.button !== 0) {
      return;
    }
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = elements.toolNav.getBoundingClientRect().width;
    elements.appShell.classList.add("sidebar-resizing");
    elements.sidebarResize.setPointerCapture?.(event.pointerId);

    const resize = (moveEvent) => {
      setSidebarWidth(startWidth + moveEvent.clientX - startX);
    };
    const stop = () => {
      elements.appShell.classList.remove("sidebar-resizing");
      setSidebarWidth(elements.toolNav.getBoundingClientRect().width, { persist: true });
      window.removeEventListener("pointermove", resize);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };

    window.addEventListener("pointermove", resize);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  }

  function startEditorResize(event) {
    if (
      mobileNavigationQuery.matches ||
      event.button !== 0 ||
      elements.editorGrid.classList.contains("no-input")
    ) {
      return;
    }
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = elements.optionsPanel.getBoundingClientRect().width;
    elements.appShell.classList.add("editor-resizing");
    elements.editorResize.setPointerCapture?.(event.pointerId);

    const resize = (moveEvent) => {
      setToolOptionsWidth(startWidth - (moveEvent.clientX - startX));
    };
    const stop = () => {
      elements.appShell.classList.remove("editor-resizing");
      setToolOptionsWidth(elements.optionsPanel.getBoundingClientRect().width, { persist: true });
      window.removeEventListener("pointermove", resize);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };

    window.addEventListener("pointermove", resize);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  }

  function isNavigationHidden() {
    return mobileNavigationQuery.matches
      ? !elements.appShell.classList.contains("sidebar-mobile-open")
      : elements.appShell.classList.contains("sidebar-collapsed");
  }

  function updateSidebarToggleState() {
    const hidden = isNavigationHidden();
    elements.sidebarToggle.setAttribute("aria-pressed", String(hidden));
    elements.sidebarToggle.setAttribute("aria-label", hidden ? "Show navigation" : "Hide navigation");
  }

  function handleThemeToggleChange() {
    const next = elements.themeToggle.checked ? "dark" : "light";
    applyTheme(next);
    localStorage.setItem("sms3-theme", next);
    window.dispatchEvent(new CustomEvent("sms3-theme-change", { detail: { theme: next } }));
  }

  function toggleSidebar() {
    if (mobileNavigationQuery.matches) {
      elements.appShell.classList.toggle("sidebar-mobile-open");
    } else {
      const collapsed = !elements.appShell.classList.contains("sidebar-collapsed");
      elements.appShell.classList.toggle("sidebar-collapsed", collapsed);
      localStorage.setItem("sms3-sidebar", collapsed ? "collapsed" : "expanded");
    }
    updateSidebarToggleState();
    updateSidebarAvailableHeight();
  }

  function handleNavigationModeChange() {
    elements.appShell.classList.remove("sidebar-mobile-open");
    applyStoredSidebarWidth();
    applyStoredToolOptionsWidth();
    updateSidebarToggleState();
    updateSidebarAvailableHeight();
  }

  function handleWindowResize() {
    applyStoredSidebarWidth();
    applyStoredToolOptionsWidth();
    updateSidebarAvailableHeight();
  }

  function mount() {
    elements.themeToggle.addEventListener("change", handleThemeToggleChange);
    elements.sidebarToggle.addEventListener("click", toggleSidebar);
    elements.sidebarResize.addEventListener("pointerdown", startSidebarResize);
    elements.editorResize.addEventListener("pointerdown", startEditorResize);
    mobileNavigationQuery.addEventListener("change", handleNavigationModeChange);
    window.addEventListener("resize", handleWindowResize);
    window.addEventListener("scroll", updateSidebarAvailableHeight, { passive: true });
  }

  return {
    applyStoredSidebarState,
    applyStoredTheme,
    mount,
    updateSidebarAvailableHeight
  };
}
