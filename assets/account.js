(function () {
  "use strict";

  const store = window.PA_PRESET_STORE;
  const PAGE_SIZE = 10;
  const MOBILE_DETAIL_QUERY = window.matchMedia("(max-width: 960px)");
  const state = {
    user: null,
    status: "",
    query: "",
    page: 1,
    total: 0,
    items: [],
    stats: {
      all: 0,
      pending: 0,
      approved: 0,
      rejected: 0
    },
    selectedId: "",
    detail: null,
    detailUrls: {},
    newIds: new Set(),
    resubmitId: "",
    resubmitParsed: null,
    resubmitFileText: null,
    resubmitScreenshotPaths: [],
    resubmitScreenshotUrls: {},
    resubmitNewFiles: [],
    resubmitNewUrls: [],
    deleteId: ""
  };

  const elements = {};
  let searchTimer = 0;
  let listToken = 0;
  let detailToken = 0;

  function init() {
    elements.gate = document.querySelector("[data-account-gate]");
    elements.content = document.querySelector("[data-account-content]");
    elements.login = document.querySelector("[data-account-login]");
    elements.logout = document.querySelector("[data-account-logout]");
    elements.avatar = document.querySelector("[data-account-avatar]");
    elements.name = document.querySelector("[data-account-name]");
    elements.email = document.querySelector("[data-account-email]");
    elements.tabCounts = Array.from(document.querySelectorAll("[data-account-tab-count]"));
    elements.tabs = Array.from(document.querySelectorAll("[data-account-tab]"));
    elements.search = document.querySelector("[data-account-search]");
    elements.feedback = document.querySelector("[data-account-feedback]");
    elements.list = document.querySelector("[data-account-list]");
    elements.pagination = document.querySelector("[data-account-pagination]");
    elements.detail = document.querySelector("[data-account-detail]");
    elements.resubmitDialog = document.querySelector("[data-account-resubmit-dialog]");
    elements.resubmitForm = document.querySelector("[data-account-resubmit-form]");
    elements.resubmitError = document.querySelector("[data-account-resubmit-error]");
    elements.resubmitFile = document.querySelector("[data-account-resubmit-file]");
    elements.resubmitSummary = document.querySelector("[data-account-resubmit-summary]");
    elements.resubmitVersion = document.querySelector("[data-account-resubmit-version]");
    elements.resubmitScope = document.querySelector("[data-account-resubmit-scope]");
    elements.resubmitScreenshots = document.querySelector("[data-account-resubmit-screenshots]");
    elements.resubmitFiles = document.querySelector("[data-account-resubmit-files]");
    elements.resubmitNewShots = document.querySelector("[data-account-resubmit-new-shots]");
    elements.resubmitSubmit = document.querySelector("[data-account-resubmit-submit]");
    elements.deleteDialog = document.querySelector("[data-account-delete-dialog]");
    elements.deleteTitle = document.querySelector("[data-account-delete-title]");
    elements.deleteConfirm = document.querySelector("[data-account-delete-confirm]");

    bindEvents();
    setView("loading");

    const client = store.getClient();
    if (!client) {
      setView("unconfigured");
      return;
    }

    client.auth.getSession().then(({ data }) => {
      setUser(data.session?.user || null);
    });

    client.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
    });
  }

  function bindEvents() {
    elements.login?.addEventListener("click", () => {
      store.signInWithGitHub(store.getClient(), "account.html").catch(showError);
    });

    elements.logout?.addEventListener("click", async () => {
      await store.getClient()?.auth.signOut();
    });

    elements.tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        state.status = tab.dataset.accountTab || "";
        state.page = 1;
        elements.tabs.forEach((item) => {
          const active = item === tab;
          item.classList.toggle("is-active", active);
          item.setAttribute("aria-selected", String(active));
        });
        loadList();
      });
    });

    elements.search?.addEventListener("input", () => {
      window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(() => {
        state.query = elements.search.value;
        state.page = 1;
        loadList();
      }, 280);
    });

    elements.list?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-account-open]");
      if (button) {
        openDetail(button.dataset.accountOpen);
      }
    });

    elements.pagination?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-account-page]");
      if (!button) {
        return;
      }
      const nextPage = Number(button.dataset.accountPage);
      if (!Number.isFinite(nextPage) || nextPage === state.page) {
        return;
      }
      state.page = nextPage;
      loadList();
      elements.list?.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    elements.detail?.addEventListener("click", (event) => {
      const closeButton = event.target.closest("[data-account-detail-close]");
      if (closeButton) {
        closeMobileDetail();
        return;
      }

      const downloadButton = event.target.closest("[data-account-download]");
      if (downloadButton) {
        downloadJson(downloadButton);
        return;
      }

      const resubmitButton = event.target.closest("[data-account-resubmit]");
      if (resubmitButton) {
        openResubmit();
        return;
      }

      const deleteButton = event.target.closest("[data-account-delete]");
      if (deleteButton) {
        state.deleteId = deleteButton.dataset.accountDelete;
        elements.deleteTitle.textContent = state.detail?.title || "该投稿";
        elements.deleteDialog.showModal();
      }
    });

    elements.resubmitForm?.addEventListener("submit", submitResubmit);
    elements.resubmitFile?.addEventListener("change", handleResubmitFile);
    elements.resubmitFiles?.addEventListener("change", handleResubmitScreenshotFiles);
    elements.resubmitScreenshots?.addEventListener("click", handleResubmitScreenshotRemove);
    elements.resubmitNewShots?.addEventListener("click", handleResubmitNewScreenshotRemove);

    elements.resubmitDialog?.addEventListener("close", () => {
      releaseResubmitNewUrls();
    });

    elements.deleteConfirm?.addEventListener("click", deleteSubmission);

    document.querySelectorAll("[data-close-dialog]").forEach((button) => {
      button.addEventListener("click", () => {
        button.closest("dialog")?.close();
      });
    });

    document.querySelectorAll("dialog").forEach((dialog) => {
      dialog.addEventListener("click", (event) => {
        if (event.target === dialog) {
          dialog.close();
        }
      });
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && elements.detail?.classList.contains("is-mobile-open")) {
        closeMobileDetail();
      }
    });

    MOBILE_DETAIL_QUERY.addEventListener("change", () => {
      if (!MOBILE_DETAIL_QUERY.matches) {
        closeMobileDetail();
      }
    });
  }

  function setUser(user) {
    state.user = user;

    if (!user) {
      state.items = [];
      state.detail = null;
      state.newIds = new Set();
      setView("signed-out");
      return;
    }

    setView("account");
    renderAccount(user);
    loadAll();
  }

  function setView(view) {
    const showGate = ["signed-out", "unconfigured", "loading"].includes(view);
    elements.gate.hidden = !showGate;
    elements.content.hidden = view !== "account";

    if (view === "loading") {
      elements.gate.querySelector("h2").textContent = "正在加载个人中心";
      elements.gate.querySelector("p").textContent = "正在读取账号状态，请稍候。";
      elements.login.hidden = true;
    } else if (view === "unconfigured") {
      elements.gate.querySelector("h2").textContent = "预设服务尚未配置";
      elements.gate.querySelector("p").textContent = "请先在 assets/supabase-config.js 中填写项目地址和公开密钥。";
      elements.login.hidden = true;
    } else {
      elements.gate.querySelector("h2").textContent = "登录后查看个人中心";
      elements.gate.querySelector("p").textContent = "使用 GitHub 登录后，可以在这里管理自己的投稿。";
      elements.login.hidden = false;
    }
    refreshIcons();
  }

  function renderAccount(user) {
    const username = getUsername(user);
    const avatarUrl = user.user_metadata?.avatar_url || "";
    elements.name.textContent = `@${username}`;
    elements.email.textContent = user.email || "GitHub 未提供公开邮箱";
    elements.avatar.innerHTML = avatarUrl
      ? `<img src="${escapeAttribute(avatarUrl)}" alt="">`
      : escapeHtml(username.slice(0, 1).toUpperCase() || "U");
    refreshIcons();
  }

  async function loadAll() {
    await Promise.all([loadStats(), loadUnseen(), loadList()]);
  }

  async function loadStats() {
    try {
      state.stats = await store.fetchOwnSubmissionStats(store.getClient(), state.user.id);
      elements.tabCounts.forEach((item) => {
        const key = item.dataset.accountTabCount;
        item.textContent = String(key === "all" ? state.stats.all : (state.stats[key] || 0));
      });
    } catch (error) {
      showError(error);
    }
  }

  async function loadUnseen() {
    const seenAt = state.user?.user_metadata?.preset_reviews_seen_at || "";

    try {
      const results = await store.fetchUnseenReviewResults(store.getClient(), state.user.id, seenAt);
      state.newIds = new Set((results || []).map((item) => item.id));

      if (state.newIds.size) {
        const markedAt = new Date().toISOString();
        store.markPresetReviewsSeen(store.getClient(), markedAt).catch(() => {});
        state.user = {
          ...state.user,
          user_metadata: {
            ...(state.user.user_metadata || {}),
            preset_reviews_seen_at: markedAt
          }
        };
      }

      if (state.items.length) {
        renderList();
      }

      window.dispatchEvent(new CustomEvent("pa-review-notifications-seen"));
    } catch (error) {
      // Notifications are optional; the rest of the page still works.
    }
  }

  async function loadList() {
    if (!state.user) {
      return;
    }

    const token = ++listToken;
    elements.list.innerHTML = renderListSkeleton();

    try {
      const result = await store.fetchOwnPackagePage(store.getClient(), state.user.id, {
        status: state.status,
        query: state.query,
        page: state.page,
        pageSize: PAGE_SIZE
      });

      if (token !== listToken) {
        return;
      }

      state.items = result.items;
      state.total = result.total;
      renderList();

      if (!state.items.some((item) => item.id === state.selectedId)) {
        state.selectedId = state.items[0]?.id || "";
        state.detail = null;
      }

      if (state.selectedId) {
        openDetail(state.selectedId, true, false);
      } else {
        renderDetailEmpty();
      }
    } catch (error) {
      if (token === listToken) {
        showError(error);
      }
    }
  }

  function renderList() {
    elements.feedback.textContent = "";
    elements.feedback.classList.remove("is-error");

    elements.list.innerHTML = state.items.length
      ? state.items.map(renderListItem).join("")
      : `
        <div class="preset-empty">
          <div>
            <i data-lucide="inbox" aria-hidden="true"></i>
            <h2>没有找到投稿</h2>
            <p>换个关键词或筛选条件再试试。</p>
          </div>
        </div>
      `;
    renderPagination();
    refreshIcons();
  }

  function renderListItem(item) {
    const isNew = state.newIds.has(item.id);
    const isActive = item.id === state.selectedId;
    return `
      <div class="account-item-row${isNew ? " is-new" : ""}">
        <button class="account-item${isActive ? " is-active" : ""}" type="button" data-account-open="${escapeAttribute(item.id)}">
          <span class="account-item-head">
            <strong>${escapeHtml(item.title)}</strong>
            <span class="account-item-badges">
              ${isNew ? `<span class="preset-submission-new">新</span>` : ""}
              ${renderStatus(item.status)}
            </span>
          </span>
          <span class="account-item-meta">
            <span>${item.source === "official" ? "官方" : "社区投稿"}</span>
            <span>${Number(item.preset_count) || 0} 个预设</span>
            <span>${formatDate(item.created_at)}</span>
            ${item.reviewed_at ? `<span>审核于 ${formatDate(item.reviewed_at)}</span>` : ""}
          </span>
        </button>
      </div>
    `;
  }

  function renderPagination() {
    const totalPages = Math.max(1, Math.ceil(state.total / PAGE_SIZE));
    if (state.total <= PAGE_SIZE) {
      elements.pagination.innerHTML = state.total
        ? `<span class="account-pagination-info">共 ${state.total} 条投稿</span>`
        : "";
      return;
    }

    const start = Math.max(1, Math.min(state.page - 3, totalPages - 6));
    const end = Math.min(totalPages, start + 6);
    const pages = [];
    for (let page = start; page <= end; page += 1) {
      pages.push(`
        <button class="${page === state.page ? "is-active" : ""}" type="button" data-account-page="${page}" ${page === state.page ? "aria-current=\"page\"" : ""}>${page}</button>
      `);
    }

    elements.pagination.innerHTML = `
      <button type="button" data-account-page="${state.page - 1}" ${state.page <= 1 ? "disabled" : ""}>上一页</button>
      ${pages.join("")}
      <button type="button" data-account-page="${state.page + 1}" ${state.page >= totalPages ? "disabled" : ""}>下一页</button>
      <span class="account-pagination-info">第 ${state.page} / ${totalPages} 页，共 ${state.total} 条</span>
    `;
  }

  async function openDetail(packageId, keepList, fromUser = true) {
    if (!state.user) {
      return;
    }

    state.selectedId = packageId;
    if (fromUser && MOBILE_DETAIL_QUERY.matches) {
      openMobileDetail();
    }
    if (!keepList) {
      renderList();
    }

    const token = ++detailToken;
    elements.detail.innerHTML = renderDetailSkeleton();

    try {
      const detail = await store.fetchOwnPackageDetail(store.getClient(), state.user.id, packageId);
      const screenshotUrls = detail?.screenshot_paths?.length
        ? await store.getSignedUrls(
          store.getClient(),
          store.SCREENSHOT_BUCKET,
          detail.screenshot_paths,
          3600
        )
        : {};

      if (token !== detailToken || state.selectedId !== packageId) {
        return;
      }

      state.detail = detail;
      state.detailUrls = screenshotUrls || {};
      renderDetail();
    } catch (error) {
      if (token === detailToken) {
        elements.detail.innerHTML = `<p class="preset-feedback is-error">${escapeHtml(store.errorMessage(error))}</p>`;
      }
    }
  }

  function renderDetailEmpty() {
    elements.detail.innerHTML = `
      <div class="account-detail-empty">
        <i data-lucide="mouse-pointer-click" aria-hidden="true"></i>
        <p>从左边选一条投稿，这里会显示它的完整详情。</p>
      </div>
    `;
    refreshIcons();
  }

  function renderDetail() {
    const item = state.detail;
    if (!item) {
      renderDetailEmpty();
      return;
    }

    const items = [...(item.preset_items || [])]
      .sort((left, right) => Number(left.sort_order) - Number(right.sort_order));
    const canManage = item.source === "community";

    elements.detail.innerHTML = `
      <button class="account-detail-back" type="button" data-account-detail-close>
        <i data-lucide="arrow-left" aria-hidden="true"></i>
        返回投稿列表
      </button>
      <div class="account-detail">
        ${renderScreenshotCarousel(item.screenshot_paths, state.detailUrls)}
        <div class="account-detail-head">
          <div class="account-detail-badges">
            ${item.scope_keyboard ? `<span class="preset-badge is-accent">键鼠</span>` : ""}
            ${item.scope_gamepad ? `<span class="preset-badge is-accent">手柄</span>` : ""}
            ${renderStatus(item.status)}
          </div>
          <h2>${escapeHtml(item.title)}</h2>
          <p>${escapeHtml(formatAuthorGame(item))}</p>
        </div>
        <dl class="preset-detail-facts">
          <div><dt>投稿版本</dt><dd>${escapeHtml(item.version || "未标注")}</dd></div>
          <div><dt>支持版本</dt><dd>${renderVersionSupportDetail(item.pa_version_range)}</dd></div>
          <div><dt>包含预设</dt><dd>${Number(item.preset_count) || 0} 个</dd></div>
          <div><dt>提交时间</dt><dd>${formatDate(item.created_at)}</dd></div>
          <div><dt>审核时间</dt><dd>${formatDate(item.reviewed_at)}</dd></div>
        </dl>
        ${item.status === "rejected" && item.rejection_reason
          ? `<p class="preset-rejection-note">拒绝原因：${escapeHtml(item.rejection_reason)}</p>`
          : ""}
        <p class="account-detail-description">${escapeHtml(item.description || "没有填写介绍。")}</p>
        <div class="account-detail-section">
          <h3>包含的预设</h3>
          <div class="account-detail-list">
            ${items.length
              ? items.map((preset) => `
                <div class="account-detail-item">
                  <strong>${escapeHtml(preset.display_name || preset.name)}</strong>
                  <span>${preset.scope === "keyboard" ? "键鼠" : "手柄"}</span>
                </div>
              `).join("")
              : `<p class="preset-file-list">没有读取到预设条目。</p>`}
          </div>
        </div>
        <div class="account-detail-actions">
          <button class="button button-secondary" type="button" data-account-download="${escapeAttribute(item.id)}">
            <i data-lucide="download" aria-hidden="true"></i>
            下载 JSON
          </button>
          ${canManage && item.status === "rejected" ? `
            <button class="button button-primary" type="button" data-account-resubmit="${escapeAttribute(item.id)}">
              <i data-lucide="refresh-cw" aria-hidden="true"></i>
              修改并重新提交
            </button>
          ` : ""}
          ${canManage ? `
            <button class="button button-secondary is-danger" type="button" data-account-delete="${escapeAttribute(item.id)}">
              <i data-lucide="trash-2" aria-hidden="true"></i>
              删除
            </button>
          ` : ""}
        </div>
      </div>
    `;
    initScreenshotCarousels(elements.detail);
    refreshIcons();
  }

  function renderScreenshotCarousel(paths, urls) {
    const slides = (paths || [])
      .map((path, index) => ({ url: urls[path], index }))
      .filter((slide) => slide.url);

    if (!slides.length) {
      return "";
    }

    const controls = slides.length > 1
      ? `
        <div class="preset-carousel-controls">
          <button class="preset-carousel-button" type="button" aria-label="上一张" data-carousel-prev>
            <i data-lucide="chevron-left" aria-hidden="true"></i>
          </button>
          <span class="preset-carousel-counter" data-carousel-counter>1 / ${slides.length}</span>
          <button class="preset-carousel-button" type="button" aria-label="下一张" data-carousel-next>
            <i data-lucide="chevron-right" aria-hidden="true"></i>
          </button>
        </div>
        <div class="preset-carousel-dots">
          ${slides.map((slide, index) => `
            <button class="preset-carousel-dot${index === 0 ? " is-active" : ""}" type="button" aria-label="查看第 ${index + 1} 张截图" aria-current="${index === 0 ? "true" : "false"}" data-carousel-index="${index}"></button>
          `).join("")}
        </div>
      `
      : "";

    return `
      <div class="preset-carousel" tabindex="0" aria-label="预设截图轮播图" data-preset-carousel>
        <div class="preset-carousel-stage">
          ${slides.map((slide, index) => `
            <img class="preset-carousel-image is-loading" src="${escapeAttribute(slide.url)}" alt="预设截图 ${index + 1}" loading="lazy" ${index === 0 ? "" : "hidden"}>
          `).join("")}
        </div>
        ${controls}
      </div>
    `;
  }

  function initScreenshotCarousels(root) {
    root?.querySelectorAll("[data-preset-carousel]").forEach((carousel) => {
      const slides = Array.from(carousel.querySelectorAll(".preset-carousel-image"));
      const dots = Array.from(carousel.querySelectorAll("[data-carousel-index]"));
      const counter = carousel.querySelector("[data-carousel-counter]");
      let current = 0;

      slides.forEach((slide) => {
        if (slide.complete) {
          slide.classList.remove("is-loading");
          slide.classList.toggle("is-error", slide.naturalWidth === 0);
          return;
        }
        slide.addEventListener("load", () => {
          slide.classList.remove("is-loading");
          slide.classList.remove("is-error");
        }, { once: true });
        slide.addEventListener("error", () => {
          slide.classList.remove("is-loading");
          slide.classList.add("is-error");
        }, { once: true });
      });

      const show = (nextIndex) => {
        if (!slides.length) {
          return;
        }
        current = (nextIndex + slides.length) % slides.length;
        slides.forEach((slide, index) => {
          slide.hidden = index !== current;
        });
        dots.forEach((dot, index) => {
          const active = index === current;
          dot.classList.toggle("is-active", active);
          dot.setAttribute("aria-current", String(active));
        });
        if (counter) {
          counter.textContent = `${current + 1} / ${slides.length}`;
        }
      };

      carousel.querySelector("[data-carousel-prev]")?.addEventListener("click", () => show(current - 1));
      carousel.querySelector("[data-carousel-next]")?.addEventListener("click", () => show(current + 1));
      dots.forEach((dot) => {
        dot.addEventListener("click", () => show(Number(dot.dataset.carouselIndex)));
      });
    });
  }

  async function downloadJson(button) {
    if (!state.detail?.json_path) {
      return;
    }

    button.disabled = true;
    try {
      const filename = `${safeFilename(state.detail.title)}.json`;
      const url = await store.getDownloadUrl(store.getClient(), state.detail.json_path, filename);
      if (!url) {
        throw new Error("下载地址生成失败。");
      }
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      showError(error);
    } finally {
      button.disabled = false;
    }
  }

  async function openResubmit() {
    const item = state.detail;
    if (!item || item.status !== "rejected" || item.source !== "community") {
      return;
    }

    state.resubmitId = item.id;
    state.resubmitParsed = null;
    state.resubmitFileText = null;
    state.resubmitScreenshotPaths = [...(item.screenshot_paths || [])];
    state.resubmitScreenshotUrls = {};
    elements.resubmitError.textContent = "";
    elements.resubmitSummary.textContent = "正在读取原来的 JSON...";
    elements.resubmitSummary.classList.remove("is-error");
    elements.resubmitSubmit.disabled = true;
    elements.resubmitScreenshots.innerHTML = `<p class="preset-file-list">正在读取截图...</p>`;
    releaseResubmitNewUrls();
    state.resubmitNewFiles = [];
    state.resubmitNewUrls = [];
    if (elements.resubmitNewShots) {
      elements.resubmitNewShots.innerHTML = "";
    }
    elements.resubmitForm.reset();

    const form = elements.resubmitForm.elements;
    form.title.value = item.title || "";
    form.game.value = item.game || "";
    form.version.value = item.version || "";
    form.description.value = item.description || "";
    elements.resubmitVersion.textContent = formatVersionSupport(item.pa_version_range);
    elements.resubmitScope.textContent = renderScopeLabel(item);

    elements.resubmitDialog.showModal();
    refreshIcons();

    try {
      const [jsonText, screenshotUrls] = await Promise.all([
        store.getPresetFileText(store.getClient(), item.json_path),
        item.screenshot_paths?.length
          ? store.getSignedUrls(store.getClient(), store.SCREENSHOT_BUCKET, item.screenshot_paths, 3600)
          : {}
      ]);

      if (state.resubmitId !== item.id) {
        return;
      }

      state.resubmitParsed = store.validatePresetPayload(JSON.parse(jsonText));
      state.resubmitFileText = null;
      state.resubmitScreenshotUrls = screenshotUrls || {};
      updateResubmitSummary("current");
      renderResubmitScreenshots();
    } catch (error) {
      elements.resubmitSummary.textContent = `读取原 JSON 失败：${store.errorMessage(error)}`;
      elements.resubmitSummary.classList.add("is-error");
      elements.resubmitSubmit.disabled = true;
      renderResubmitScreenshots();
    }
  }

  function updateResubmitSummary(source) {
    const parsed = state.resubmitParsed;
    elements.resubmitSummary.classList.remove("is-error");

    if (!parsed) {
      elements.resubmitSummary.textContent = "还没有可用的 JSON 内容。";
      elements.resubmitSummary.classList.add("is-error");
      elements.resubmitSubmit.disabled = true;
      return null;
    }

    const scopes = [...new Set(parsed.items.map((entry) => (
      entry.scope === "keyboard" ? "键鼠" : "手柄"
    )))];
    const label = source === "new" ? "新文件已识别" : "继续使用原 JSON";
    elements.resubmitSummary.textContent = `${label}：${parsed.presetCount} 个预设，支持 ${parsed.versionSupportLabel}，范围 ${scopes.join(" + ")}`;
    elements.resubmitSubmit.disabled = false;
    return parsed;
  }

  async function handleResubmitFile() {
    elements.resubmitError.textContent = "";
    const file = elements.resubmitFile?.files?.[0];

    if (!file) {
      try {
        const jsonText = await store.getPresetFileText(store.getClient(), state.detail.json_path);
        state.resubmitParsed = store.validatePresetPayload(JSON.parse(jsonText));
        state.resubmitFileText = null;
        updateResubmitSummary("current");
      } catch (error) {
        state.resubmitParsed = null;
        state.resubmitFileText = null;
        elements.resubmitSummary.textContent = `读取原 JSON 失败：${store.errorMessage(error)}`;
        elements.resubmitSummary.classList.add("is-error");
        elements.resubmitSubmit.disabled = true;
      }
      return;
    }

    try {
      const result = await store.readPresetFileContent(file);
      state.resubmitParsed = result.parsed;
      state.resubmitFileText = result.text;
      updateResubmitSummary("new");
    } catch (error) {
      state.resubmitParsed = null;
      state.resubmitFileText = null;
      elements.resubmitSummary.textContent = `JSON 无效：${store.errorMessage(error)}`;
      elements.resubmitSummary.classList.add("is-error");
      elements.resubmitSubmit.disabled = true;
    }
  }

  function handleResubmitScreenshotFiles() {
    const selected = Array.from(elements.resubmitFiles?.files || []);
    if (!selected.length) {
      return;
    }

    elements.resubmitError.textContent = "";
    const validFiles = [];
    let validationMessage = "";
    selected.forEach((file) => {
      try {
        store.validateScreenshots([file]);
        validFiles.push(file);
      } catch (error) {
        validationMessage = error.message;
      }
    });

    const capacity = Math.max(
      0,
      store.MAX_SCREENSHOTS - state.resubmitScreenshotPaths.length - state.resubmitNewFiles.length
    );
    const accepted = validFiles.slice(0, capacity);
    state.resubmitNewFiles.push(...accepted);
    elements.resubmitFiles.value = "";
    renderResubmitScreenshots();

    if (validationMessage) {
      elements.resubmitError.textContent = validationMessage;
    } else if (accepted.length < selected.length) {
      elements.resubmitError.textContent = `最多只能保留 ${store.MAX_SCREENSHOTS} 张截图，超出的没有添加。`;
    }
  }

  function handleResubmitScreenshotRemove(event) {
    const button = event.target.closest("[data-account-resubmit-remove-path]");
    if (!button) {
      return;
    }

    const path = button.dataset.accountResubmitRemovePath || "";
    state.resubmitScreenshotPaths = state.resubmitScreenshotPaths.filter((item) => item !== path);
    elements.resubmitError.textContent = "";
    renderResubmitScreenshots();
  }

  function handleResubmitNewScreenshotRemove(event) {
    const button = event.target.closest("[data-account-resubmit-new-remove]");
    if (!button) {
      return;
    }

    const index = Number(button.dataset.accountResubmitNewRemove);
    if (!Number.isInteger(index) || index < 0 || index >= state.resubmitNewFiles.length) {
      return;
    }

    state.resubmitNewFiles.splice(index, 1);
    elements.resubmitError.textContent = "";
    renderResubmitScreenshots();
  }

  function renderResubmitScreenshots() {
    const paths = state.resubmitScreenshotPaths;
    elements.resubmitScreenshots.innerHTML = paths.length
      ? paths.map((path, index) => `
        <div class="preset-edit-screenshot" data-account-resubmit-shot>
          <img src="${escapeAttribute(state.resubmitScreenshotUrls[path] || "")}" alt="截图 ${index + 1}" loading="lazy">
          <button class="preset-edit-screenshot-remove" type="button" aria-label="删除截图 ${index + 1}" data-account-resubmit-remove-path="${escapeAttribute(path)}">
            <i data-lucide="trash-2" aria-hidden="true"></i>
          </button>
          <span>已有截图 ${index + 1}</span>
        </div>
      `).join("")
      : `<p class="preset-file-list">当前没有截图。</p>`;

    releaseResubmitNewUrls();
    state.resubmitNewUrls = state.resubmitNewFiles.map((file) => URL.createObjectURL(file));
    if (elements.resubmitNewShots) {
      elements.resubmitNewShots.innerHTML = state.resubmitNewFiles.length
        ? state.resubmitNewFiles.map((file, index) => `
        <div class="preset-edit-screenshot" data-account-resubmit-shot-new>
          <img src="${escapeAttribute(state.resubmitNewUrls[index])}" alt="新截图 ${index + 1}">
          <button class="preset-edit-screenshot-remove" type="button" aria-label="删除新增截图 ${escapeAttribute(file.name)}" data-account-resubmit-new-remove="${index}">
            <i data-lucide="trash-2" aria-hidden="true"></i>
          </button>
          <span title="${escapeAttribute(file.name)}">新增 · ${escapeHtml(file.name)}</span>
        </div>
      `).join("")
        : "";
    }
    refreshIcons();
  }

  function releaseResubmitNewUrls() {
    (state.resubmitNewUrls || []).forEach((url) => URL.revokeObjectURL(url));
    state.resubmitNewUrls = [];
  }

  async function submitResubmit(event) {
    event.preventDefault();
    elements.resubmitError.textContent = "";

    const item = state.detail;
    if (!item || item.id !== state.resubmitId) {
      elements.resubmitError.textContent = "投稿记录不存在，请刷新后重试。";
      return;
    }

    const parsed = state.resubmitParsed;
    if (!parsed) {
      elements.resubmitError.textContent = "请先选择有效的预设 JSON 文件。";
      return;
    }

    const formData = new FormData(elements.resubmitForm);
    const keepScreenshotPaths = state.resubmitScreenshotPaths.slice();
    const newScreenshots = state.resubmitNewFiles.slice();
    const original = elements.resubmitSubmit.innerHTML;
    elements.resubmitSubmit.disabled = true;
    elements.resubmitSubmit.textContent = "正在提交...";

    try {
      await store.resubmitOwnPresetPackage(store.getClient(), {
        packageId: item.id,
        fields: {
          title: formData.get("title"),
          authorName: item.author_name,
          game: formData.get("game"),
          version: formData.get("version"),
          description: formData.get("description")
        },
        presetContent: state.resubmitFileText,
        parsed,
        current: item,
        keepScreenshotPaths,
        screenshots: newScreenshots
      });

      elements.resubmitDialog.close();
      state.resubmitParsed = null;
      state.resubmitFileText = null;
      state.resubmitNewFiles = [];
      showToast("已重新提交，等待管理员审核。");
      state.page = 1;
      state.status = "";
      elements.tabs.forEach((tab) => {
        const active = (tab.dataset.accountTab || "") === "";
        tab.classList.toggle("is-active", active);
        tab.setAttribute("aria-selected", String(active));
      });
      await loadAll();
    } catch (error) {
      const message = store.errorMessage(error);
      elements.resubmitError.textContent = /resubmit_own_preset_package|schema cache|row-level security/i.test(message)
        ? "数据库还没有启用“重新提交”功能，请先在 Supabase 里运行 supabase/account-upgrade.sql。"
        : message;
    } finally {
      elements.resubmitSubmit.disabled = false;
      elements.resubmitSubmit.innerHTML = original;
      refreshIcons();
    }
  }

  async function deleteSubmission() {
    if (!state.deleteId) {
      return;
    }

    const original = elements.deleteConfirm.innerHTML;
    elements.deleteConfirm.disabled = true;
    elements.deleteConfirm.textContent = "正在删除...";

    try {
      await store.hideOwnPresetPackage(store.getClient(), state.deleteId);
      elements.deleteDialog.close();
      state.deleteId = "";
      state.selectedId = "";
      showToast("投稿已删除。");
      await loadAll();
    } catch (error) {
      showError(error);
    } finally {
      elements.deleteConfirm.disabled = false;
      elements.deleteConfirm.innerHTML = original;
      refreshIcons();
    }
  }

  function renderListSkeleton() {
    return Array.from({ length: 5 }, () => `
      <div class="account-item-row">
        <div class="account-item">
          <span class="ui-skeleton ui-skeleton-line"></span>
          <span class="ui-skeleton ui-skeleton-line"></span>
        </div>
      </div>
    `).join("");
  }

  function renderDetailSkeleton() {
    return `
      <button class="account-detail-back" type="button" data-account-detail-close>
        <i data-lucide="arrow-left" aria-hidden="true"></i>
        返回投稿列表
      </button>
      <div class="account-detail-skeleton">
        <span class="ui-skeleton" style="height:200px;border-radius:12px"></span>
        <span class="ui-skeleton ui-skeleton-line"></span>
        <span class="ui-skeleton ui-skeleton-line"></span>
      </div>
    `;
  }

  function openMobileDetail() {
    elements.detail.classList.add("is-mobile-open");
    document.body.classList.add("is-account-detail-open");
    elements.detail.scrollTop = 0;
  }

  function closeMobileDetail() {
    elements.detail?.classList.remove("is-mobile-open");
    document.body.classList.remove("is-account-detail-open");
  }

  function renderStatus(status) {
    const labels = {
      pending: "待审核",
      approved: "已通过",
      rejected: "已拒绝"
    };
    return `<span class="preset-status is-${status}">${labels[status] || status}</span>`;
  }

  function renderScopeLabel(item) {
    const scopes = [];
    if (item.scope_keyboard) {
      scopes.push("键鼠");
    }
    if (item.scope_gamepad) {
      scopes.push("手柄");
    }
    return scopes.length ? scopes.join(" + ") : "未标注";
  }

  function parseVersionSupport(value) {
    const text = String(value || "").trim();
    if (!text) {
      return { all: true, exact: [], versions: [] };
    }

    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        const exact = [...new Set(parsed.map((version) => String(version).trim().replace(/^v/i, "")))];
        return { all: !exact.length, exact, versions: exact };
      }
    } catch (error) {
      // Older entries store a readable range instead of JSON.
    }

    const matches = text.match(/v?(\d+(?:\.\d+){1,3})/gi) || [];
    const versions = matches.map((version) => version.replace(/^v/i, ""));
    return {
      all: !versions.length,
      exact: /[,，、]/.test(text) ? [...new Set(versions)] : [],
      versions
    };
  }

  function formatVersionSupport(value) {
    const support = parseVersionSupport(value);
    if (support.all || !support.versions.length) {
      return "不限";
    }
    if (support.exact.length) {
      return support.exact.length > 1 ? `${support.exact.length} 个版本` : support.exact[0];
    }
    if (support.versions.length === 1) {
      return support.versions[0];
    }
    return `${support.versions[0]} - ${support.versions[support.versions.length - 1]}`;
  }

  function renderVersionSupportDetail(value) {
    const support = parseVersionSupport(value);
    if (support.all || !support.versions.length) {
      return "不限";
    }
    if (support.exact.length > 1) {
      return `
        <details class="preset-version-disclosure">
          <summary>已选 ${support.exact.length} 个版本</summary>
          <div class="preset-version-list">${support.exact.map(escapeHtml).join("、")}</div>
        </details>
      `;
    }
    if (support.exact.length === 1) {
      return escapeHtml(support.exact[0]);
    }
    return escapeHtml(`${support.versions[0]} - ${support.versions[support.versions.length - 1]}`);
  }

  function getUsername(user) {
    return user.user_metadata?.user_name
      || user.user_metadata?.preferred_username
      || user.email?.split("@")[0]
      || "user";
  }

  function formatAuthorGame(item) {
    const author = String(item.author_name || "").trim();
    const game = String(item.game || "").trim();
    return game ? `${author} · ${game}` : author;
  }

  function formatDate(value) {
    if (!value) {
      return "未标注";
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "未标注";
    }
    return new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(date).replaceAll("/", "-");
  }

  function safeFilename(value) {
    return String(value || "pa-keystroke-presets")
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 100) || "pa-keystroke-presets";
  }

  function showError(error) {
    elements.feedback.textContent = store.errorMessage(error);
    elements.feedback.classList.add("is-error");
  }

  function showToast(message) {
    const toast = document.querySelector("[data-toast]");
    if (!toast) {
      return;
    }
    toast.textContent = message;
    toast.classList.add("is-visible");
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => {
      toast.classList.remove("is-visible");
    }, 2600);
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
