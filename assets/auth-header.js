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
  let reviewNotificationCount = 0;
  let reviewNotificationsCleared = false;
  let reviewRequestToken = 0;

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
      updateNavNotificationDot();
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

    window.addEventListener("pa-review-notifications-seen", clearReviewNotifications);
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
    const changedUser = nextUser?.id !== user?.id;
    user = nextUser;
    loading = false;
    if (changedUser) {
      reviewNotificationCount = 0;
      reviewNotificationsCleared = false;
      reviewRequestToken += 1;
    }
    render();
    if (user) {
      loadReviewNotifications();
    }
  }

  function render() {
    updateNavNotificationDot();

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
        <span class="header-account-avatar-wrap">
          <span class="header-account-avatar">
            ${avatarUrl
              ? `<img src="${escapeAttribute(avatarUrl)}" alt="">`
              : escapeHtml(fallback)}
          </span>
          <span class="header-account-dot" data-header-account-dot hidden></span>
        </span>
        <span class="header-account-name">@${escapeHtml(username)}</span>
        <i data-lucide="chevron-down" aria-hidden="true"></i>
      </button>
      <div class="header-account-menu" role="menu" data-header-account-menu hidden>
        <button type="button" role="menuitem" data-header-my-submissions>
          <i data-lucide="user-round" aria-hidden="true"></i>
          个人中心
          <span class="header-account-badge" data-header-my-submissions-count hidden>0</span>
        </button>
        <button class="is-danger" type="button" role="menuitem" data-header-sign-out>
          <i data-lucide="log-out" aria-hidden="true"></i>
          退出登录
        </button>
      </div>
    `;

    const dot = root.querySelector("[data-header-account-dot]");
    const badge = root.querySelector("[data-header-my-submissions-count]");
    if (dot) {
      dot.hidden = reviewNotificationCount <= 0;
    }
    if (badge) {
      badge.hidden = reviewNotificationCount <= 0;
      badge.textContent = String(reviewNotificationCount);
    }

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
    clearReviewNotifications();
    if (window.location.pathname.endsWith("/account.html")) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    window.location.href = "account.html";
  }

  async function loadReviewNotifications() {
    if (!user || reviewNotificationsCleared || window.location.pathname.endsWith("/account.html")) {
      return;
    }

    const requestToken = ++reviewRequestToken;
    const userId = user.id;

    try {
      const submissions = await store.fetchOwnPackages(client, userId);
      if (requestToken !== reviewRequestToken || !user || user.id !== userId || reviewNotificationsCleared) {
        return;
      }

      reviewNotificationCount = countUnreadReviewResults(submissions, getReviewSeenAt());
      render();
    } catch (error) {
      // The header should stay usable even if the notification request fails.
    }
  }

  function countUnreadReviewResults(submissions, seenAt) {
    const seenTime = seenAt ? new Date(seenAt).getTime() : 0;

    return (submissions || []).filter((item) => {
      if (item.is_hidden) {
        return false;
      }
      if (item.status !== "approved" && item.status !== "rejected") {
        return false;
      }
      if (!item.reviewed_at) {
        return false;
      }

      const reviewedTime = new Date(item.reviewed_at).getTime();
      return Number.isFinite(reviewedTime) && reviewedTime > seenTime;
    }).length;
  }

  function getReviewSeenAt() {
    return user?.user_metadata?.preset_reviews_seen_at || "";
  }

  function clearReviewNotifications() {
    reviewNotificationsCleared = true;
    reviewNotificationCount = 0;
    render();
  }

  function updateNavNotificationDot() {
    const toggle = document.querySelector("[data-nav-toggle]");
    if (!toggle) {
      return;
    }

    let dot = toggle.querySelector("[data-nav-notification-dot]");
    if (!dot) {
      dot = document.createElement("span");
      dot.className = "nav-toggle-dot";
      dot.dataset.navNotificationDot = "";
      dot.setAttribute("aria-hidden", "true");
      toggle.append(dot);
    }

    dot.hidden = !(COMPACT_ACCOUNT_QUERY.matches && reviewNotificationCount > 0);
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
