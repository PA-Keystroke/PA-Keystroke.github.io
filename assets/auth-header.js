(function () {
  "use strict";

  const store = window.PA_PRESET_STORE;
  const COMPACT_ACCOUNT_QUERY = window.matchMedia("(max-width: 960px)");
  if (!store) {
    return;
  }

  let client = null;
  let user = null;
  let root = null;
  let loading = true;

  function init() {
    client = store.getClient();
    if (!client) {
      return;
    }

    mount();
    render();
    COMPACT_ACCOUNT_QUERY.addEventListener("change", () => {
      closeMenu();
      placeAccountRoot();
    });

    client.auth.getSession().then(({ data }) => {
      setUser(data.session?.user || null);
    });

    client.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
    });

    document.addEventListener("click", (event) => {
      if (root && !root.contains(event.target)) {
        closeMenu();
      }
    });
  }

  function mount() {
    const headerInner = document.querySelector(".header-inner");
    const headerActions = headerInner?.querySelector(".header-actions");
    if (!headerInner || !headerActions || headerInner.querySelector("[data-header-account]")) {
      root = headerInner?.querySelector("[data-header-account]") || null;
      return;
    }

    root = document.createElement("div");
    root.className = "header-account";
    root.dataset.headerAccount = "";
    placeAccountRoot();
  }

  function placeAccountRoot() {
    if (!root) {
      return;
    }

    const nav = document.querySelector("[data-nav]");
    const headerActions = document.querySelector(".header-actions");
    if (COMPACT_ACCOUNT_QUERY.matches && nav) {
      nav.append(root);
      return;
    }

    headerActions?.before(root);
  }

  function setUser(nextUser) {
    user = nextUser;
    loading = false;
    render();
  }

  function render() {
    if (!root) {
      return;
    }

    if (loading) {
      root.innerHTML = `
        <span class="header-account-skeleton" aria-label="正在加载账号状态">
          <span class="ui-skeleton ui-skeleton-avatar"></span>
          <span class="ui-skeleton ui-skeleton-line"></span>
        </span>
      `;
      return;
    }

    if (!user) {
      root.innerHTML = `
        <button class="header-account-login" type="button" data-header-login>
          <img src="assets/icons/github-mark.svg" alt="" width="18" height="18">
          <span>登录</span>
        </button>
      `;
      root.querySelector("[data-header-login]").addEventListener("click", signIn);
      return;
    }

    const username = getUsername(user);
    const avatarUrl = user.user_metadata?.avatar_url || "";
    const fallback = username.slice(0, 1).toUpperCase() || "U";

    root.innerHTML = `
      <button class="header-account-button" type="button" aria-haspopup="menu" aria-expanded="false" data-header-account-toggle>
        <span class="header-account-avatar">
          ${avatarUrl
            ? `<img src="${escapeAttribute(avatarUrl)}" alt="">`
            : escapeHtml(fallback)}
        </span>
        <span class="header-account-name">@${escapeHtml(username)}</span>
        <i data-lucide="chevron-down" aria-hidden="true"></i>
      </button>
      <div class="header-account-menu" role="menu" data-header-account-menu hidden>
        <button type="button" role="menuitem" data-header-my-submissions>
          <i data-lucide="folder-clock" aria-hidden="true"></i>
          我的投稿
        </button>
        <button class="is-danger" type="button" role="menuitem" data-header-sign-out>
          <i data-lucide="log-out" aria-hidden="true"></i>
          退出登录
        </button>
      </div>
    `;

    root.querySelector("[data-header-account-toggle]").addEventListener("click", toggleMenu);
    root.querySelector("[data-header-my-submissions]").addEventListener("click", openMySubmissions);
    root.querySelector("[data-header-sign-out]").addEventListener("click", async () => {
      closeMenu();
      await client.auth.signOut();
    });
    refreshIcons();
  }

  function toggleMenu() {
    const toggle = root.querySelector("[data-header-account-toggle]");
    const menu = root.querySelector("[data-header-account-menu]");
    const opening = menu.hidden;
    menu.hidden = !opening;
    toggle.setAttribute("aria-expanded", String(opening));
  }

  function closeMenu() {
    const toggle = root?.querySelector("[data-header-account-toggle]");
    const menu = root?.querySelector("[data-header-account-menu]");
    if (menu) {
      menu.hidden = true;
    }
    toggle?.setAttribute("aria-expanded", "false");
  }

  function signIn() {
    store.signInWithGitHub(client).catch((error) => {
      console.error(store.errorMessage(error));
    });
  }

  function openMySubmissions() {
    closeMenu();
    if (window.location.pathname.endsWith("/presets.html")) {
      window.dispatchEvent(new CustomEvent("pa-open-my-submissions"));
      return;
    }

    window.location.href = "presets.html?open=mine";
  }

  function getUsername(currentUser) {
    return currentUser.user_metadata?.user_name
      || currentUser.user_metadata?.preferred_username
      || currentUser.email?.split("@")[0]
      || "user";
  }

  function refreshIcons() {
    if (window.lucide && typeof window.lucide.createIcons === "function") {
      window.lucide.createIcons({ attrs: { "stroke-width": 1.8 } });
    }
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[character]);
  }

  function escapeAttribute(value) {
    return escapeHtml(value);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
