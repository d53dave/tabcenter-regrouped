/* global browser */

import SideTab from "./tab.js";
import TabList from "./tablist.js";
import TopMenu from "./topmenu.js";

export default class TabCenter {
  async init() {
    const window = await browser.windows.getCurrent();
    document.body.setAttribute("incognito", window.incognito);
    this._windowId = window.id;

    browser.runtime.getPlatformInfo().then(platform => {
      document.body.setAttribute("platform", platform.os);
    });

    const openTab = this._openTab.bind(this);
    const search = this._search.bind(this);
    this._topMenu = new TopMenu({ openTab, search });

    this._setupListeners();

    const prefs = await this._readPrefs();
    this._applyPrefs(prefs);
    this._tabList = new TabList({
      windowId: this._windowId,
      openTab,
      search,
      prefs,
    });

    browser.runtime.connect({ name: this._windowId.toString() });
  }

  async _openTab(props = {}) {
    if (props.afterCurrent) {
      const currentIndex = (await browser.tabs.query({
        windowId: this._windowId,
        active: true,
      }))[0].index;
      props.index = currentIndex + 1;
    }
    delete props.afterCurrent;
    browser.tabs.create(props);
  }

  _search(val) {
    this._tabList.filter(val);
    this._topMenu.updateSearch(val);
  }

  _setupListeners() {
    window.addEventListener(
      "contextmenu",
      e => {
        const target = e.target;
        // Let the searchbox input and the tabs have a context menu.
        if (
          !(target && (target.id === "searchbox-input" || target.id.startsWith("newtab"))) &&
          !SideTab.isTabEvent(e, false)
        ) {
          e.preventDefault();
        }
      },
      false,
    );
    browser.storage.onChanged.addListener(changes => this._applyPrefs(unwrapChanges(changes)));
    this._themeListener = ({ theme, windowId }) => {
      if (!windowId || windowId === this._windowId) {
        this._applyTheme(theme);
      }
    };
  }

  _applyCustomCSS() {
    document.getElementById("customCSS").textContent = this._useCustomCSS ? this._customCSS : "";
  }

  set _darkTheme(isDarkTheme) {
    this._isDarkTheme = isDarkTheme;
    this._useDarkTheme(isDarkTheme);
  }

  _useDarkTheme(isDarkTheme) {
    if (isDarkTheme || this._isDarkTheme) {
      document.body.classList.add("dark-theme");
    } else {
      document.body.classList.remove("dark-theme");
    }

    const type = isDarkTheme ? "light" : "dark";
    browser.sidebarAction.setIcon({
      path: {
        16: `/tabcenter.svg#${type}`,
        32: `/tabcenter.svg#${type}`,
      },
    });
  }

  set _themeIntegration(enabled) {
    if (!browser.theme.onUpdated) {
      return;
    }
    if (!enabled) {
      this._resetTheme();
      if (browser.theme.onUpdated.hasListener(this._themeListener)) {
        browser.theme.onUpdated.removeListener(this._themeListener);
      }
    } else {
      browser.theme.onUpdated.addListener(this._themeListener);
      browser.theme.getCurrent(this._windowId).then(this._applyTheme.bind(this));
    }
  }

  _readPrefs() {
    return browser.storage.local.get({
      darkTheme: false,
      themeIntegration: false,
      compactModeMode: 1 /* COMPACT_MODE_DYNAMIC */,
      compactPins: true,
      switchLastActiveTab: true,
      warnBeforeClosing: true,
      useCustomCSS: true,
      customCSS: "",
    });
  }

  _applyPrefs(prefs) {
    if (prefs.hasOwnProperty("useCustomCSS")) {
      this._useCustomCSS = prefs.useCustomCSS;
      this._applyCustomCSS();
    }
    if (prefs.hasOwnProperty("customCSS")) {
      this._customCSS = prefs.customCSS;
      this._applyCustomCSS();
    }
    if (prefs.hasOwnProperty("darkTheme")) {
      this._darkTheme = prefs.darkTheme;
    }
    if (prefs.hasOwnProperty("themeIntegration")) {
      this._themeIntegration = prefs.themeIntegration;
    }
  }

  _applyTheme(theme) {
    const cssToThemeProp = {
      "--background": ["frame", "accentcolor"],
      "--button-background-active": ["button_background_active"],
      "--button-background-hover": ["button_background_hover"],
      "--icons": ["icons", "textcolor"],
      "--tab-separator": ["tab_background_separator", "toolbar_top_separator"],
      "--tab-selected-line": ["tab_line"],
      "--tab-loading-indicator": ["tab_loading"],
      "--tab-active-background": ["tab_selected", "toolbar"],
      "--tab-text": ["tab_text", "toolbar_text", "textcolor"],
      "--toolbar-background": ["toolbar", "frame", "accentcolor"],
      "--toolbar-text": ["toolbar_text", "textcolor"],
      "--input-background": ["toolbar_field"],
      "--input-border": ["toolbar_field_border"],
      "--input-border-focus": ["toolbar_field_border_focus"],
      "--input-background-focus": ["toolbar_field_focus"],
      "--input-selected-text-background": ["toolbar_field_highlight", "button_background_active"],
      "--input-selected-text": ["toolbar_field_highlight_text", "toolbar_field_text"],
      "--input-text": ["bookmark_text", "toolbar_field_text"],
      "--input-text-focus": ["toolbar_field_text_focus"],
      "--sidebar-background": ["sidebar", "frame", "accentcolor"],
    };

    for (const [cssVar, themeProps] of Object.entries(cssToThemeProp)) {
      for (const prop of themeProps) {
        if (theme.colors && theme.colors[prop]) {
          if (cssVar === "--sidebar-background") {
            setBrowserActionColor(theme.colors[prop]);
          }
          document.body.style.setProperty(cssVar, theme.colors[prop]);
          break;
        }
        document.body.style.removeProperty(cssVar);
      }
    }
  }

  _resetTheme() {
    this._useDarkTheme(this._isDarkTheme);
    this._applyTheme({});
  }

  startTests() {
    const script = document.createElement("script");
    script.src = "../test/index.js";
    document.head.appendChild(script);
  }
}

function unwrapChanges(changes) {
  const unwrapped = {};
  for (const [pref, change] of Object.entries(changes)) {
    unwrapped[pref] = change.newValue;
  }
  return unwrapped;
}

function setBrowserActionColor(color) {
  document.getElementById("default").setAttribute("fill", color);
  browser.sidebarAction.setIcon({
    path: {
      16: "/tabcenter.svg",
      32: "/tabcenter.svg",
    },
  });
}
