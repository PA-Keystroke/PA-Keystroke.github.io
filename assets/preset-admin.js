(function () {
  "use strict";

  const store = window.PA_PRESET_STORE;
  const state = {
    user: null,
    isAdmin: false,
    activeStatus: "pending",
    packages: {
      pending: [],
      rejected: [],
      approved: [],
      hidden: []
    },
    rejectId: "",
    deleteId: "",
    parsedOfficialPreset: null
  };

  const elements = {};

  function init() {
    elements.configWarning = document.querySelector("[data-config-warning]");
    elements.gate = document.querySelector("[data-admin-gate]");
    elements.content = document.querySelector("[data-admin-content]");
    elements.authButton = document.querySelector("[data-admin-auth]");
    elements.authLabel = document.querySelector("[data-admin-auth-label]");
    elements.tabs = Array.from(document.querySelectorAll("[data-review-tab]"));
    elements.counts = Array.from(document.querySelectorAll("[data-review-count]"));
    elements.feedback = document.querySelector("[data-review-feedback]");
    elements.list = document.querySelector("[data-review-list]");
    elements.detailDialog = document.querySelector("[data-review-dialog]");
    elements.detailBody = document.querySelector("[data-review-detail]");
    elements.rejectDialog = document.querySelector("[data-reject-dialog]");
    elements.rejectForm = document.querySelector("[data-reject-form]");
    elements.rejectError = document.querySelector("[data-reject-error]");
    elements.deleteDialog = document.querySelector("[data-delete-dialog]");
    elements.deleteTitle = document.querySelector("[data-delete-title]");
    elements.confirmDelete = document.querySelector("[data-confirm-delete]");
    elements.officialForm = document.querySelector("[data-official-form]");
    elements.officialError = document.querySelector("[data-official-error]");
    elements.officialJsonSummary = document.querySelector("[data-official-json-summary]");
    elements.officialFileInput = elements.officialForm?.elements.presetFile;
    elements.officialScreenshotInput = elements.officialForm?.elements.screenshots;
    elements.officialSubmit = document.querySelector("[data-official-submit]");
    elements.officialVersionMultiSelect = document.querySelector("[data-preset-multi-select='version-support']");
    elements.officialVersionSupportValue = document.querySelector("[data-version-support-value]");
    elements.toggleOfficial = document.querySelector("[data-toggle-official-form]");
    elements.refresh = document.querySelector("[data-refresh-review]");

    bindEvents();
    initOfficialVersionSelect();
    setOfficialVersionLoading();
    loadReleaseVersions();
    setAdminView("checking");

    const client = store.getClient();
    if (!client) {
      setAdminView("unconfigured");
      if (elements.authButton) {
        elements.authButton.disabled = true;
      }
      return;
    }

    client.auth.getSession().then(({ data }) => {
      updateSession(data.session?.user || null);
    });

    client.auth.onAuthStateChange((_event, session) => {
      updateSession(session?.user || null);
    });
  }

  function bindEvents() {
    elements.authButton?.addEventListener("click", async () => {
      if (state.user) {
        await store.getClient()?.auth.signOut();
        return;
      }

      store.signInWithGitHub(store.getClient()).catch(showError);
    });

    elements.tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        state.activeStatus = tab.dataset.reviewTab;
        elements.tabs.forEach((item) => {
          const active = item === tab;
          item.classList.toggle("is-active", active);
          item.setAttribute("aria-selected", String(active));
        });
        renderReviews();
      });
    });

    elements.refresh?.addEventListener("click", () => {
      loadReviews(state.activeStatus);
    });

    elements.list?.addEventListener("click", (event) => {
      const viewButton = event.target.closest("[data-view-review]");
      if (viewButton) {
        openReviewDetail(viewButton.dataset.viewReview);
        return;
      }

      const approveButton = event.target.closest("[data-approve-review]");
      if (approveButton) {
        approvePackage(approveButton.dataset.approveReview, approveButton);
        return;
      }

      const hideButton = event.target.closest("[data-hide-review]");
      if (hideButton) {
        setPackageVisibility(hideButton.dataset.hideReview, true, hideButton);
        return;
      }

      const restoreButton = event.target.closest("[data-restore-review]");
      if (restoreButton) {
        setPackageVisibility(restoreButton.dataset.restoreReview, false, restoreButton);
        return;
      }

      const deleteButton = event.target.closest("[data-delete-review]");
      if (deleteButton) {
        state.deleteId = deleteButton.dataset.deleteReview;
        elements.deleteTitle.textContent = deleteButton.dataset.deleteTitle || "该预设";
        elements.deleteDialog.showModal();
        return;
      }

      const rejectButton = event.target.closest("[data-reject-review]");
      if (rejectButton) {
        state.rejectId = rejectButton.dataset.rejectReview;
        elements.rejectForm.reset();
        elements.rejectError.textContent = "";
        elements.rejectDialog.showModal();
      }
    });

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

    elements.rejectForm?.addEventListener("submit", rejectPackage);
    elements.confirmDelete?.addEventListener("click", deletePackage);

    elements.detailBody?.addEventListener("click", (event) => {
      const previewButton = event.target.closest("[data-preview-review-json]");
      if (previewButton) {
        previewReviewJson(previewButton.dataset.previewReviewJson, previewButton);
        return;
      }

      const downloadButton = event.target.closest("[data-download-review-json]");
      if (downloadButton) {
        downloadReviewJson(downloadButton.dataset.downloadReviewJson, downloadButton);
      }
    });

    elements.toggleOfficial?.addEventListener("click", () => {
      const opening = elements.officialForm.hidden;
      elements.officialForm.hidden = !opening;
      elements.toggleOfficial.innerHTML = `
        <i data-lucide="${opening ? "chevron-up" : "chevron-down"}" aria-hidden="true"></i>
        ${opening ? "收起表单" : "展开表单"}
      `;
      refreshIcons();
    });

    elements.officialFileInput?.addEventListener("change", async () => {
      const file = elements.officialFileInput.files?.[0];
      state.parsedOfficialPreset = null;
      elements.officialJsonSummary.hidden = true;
      elements.officialError.textContent = "";
      setOfficialVersionSupportDisplay(null);

      if (!file) {
        return;
      }

      try {
        state.parsedOfficialPreset = await store.readPresetFile(file);
        renderOfficialSummary(state.parsedOfficialPreset);
      } catch (error) {
        elements.officialError.textContent = error.message;
      }
    });

    elements.officialForm?.addEventListener("submit", publishOfficialPackage);
  }

  async function loadReleaseVersions() {
    if (!elements.officialVersionMultiSelect) {
      return;
    }

    const versions = await store.fetchReleaseVersions();
    setOfficialVersionOptions(versions);
  }

  function setOfficialVersionLoading() {
    const root = elements.officialVersionMultiSelect;
    const menu = root?.querySelector("[data-preset-multi-menu]");
    const label = root?.querySelector("[data-preset-multi-label]");
    if (!menu) {
      return;
    }

    if (label) {
      label.textContent = "加载中";
    }
    menu.innerHTML = `
      <div class="preset-select-loading" aria-hidden="true">
        <span class="preset-skeleton-line"></span>
        <span class="preset-skeleton-line"></span>
        <span class="preset-skeleton-line"></span>
      </div>
    `;
  }

  function initOfficialVersionSelect() {
    const root = elements.officialVersionMultiSelect;
    if (!root) {
      return;
    }

    const trigger = root.querySelector("[data-preset-multi-trigger]");
    const menu = root.querySelector("[data-preset-multi-menu]");
    if (!trigger || !menu) {
      return;
    }

    trigger.addEventListener("click", () => {
      if (root.classList.contains("is-open")) {
        closeOfficialVersionSelect();
      } else {
        openOfficialVersionSelect();
      }
    });

    trigger.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
        return;
      }

      event.preventDefault();
      openOfficialVersionSelect();
    });

    menu.addEventListener("change", (event) => {
      if (event.target.matches("input[type='checkbox']")) {
        updateOfficialVersionValue();
      }
    });

    menu.addEventListener("keydown", (event) => {
      const options = Array.from(menu.querySelectorAll("input[type='checkbox']"));
      const currentIndex = options.indexOf(document.activeElement);

      if (event.key === "Escape") {
        event.preventDefault();
        closeOfficialVersionSelect();
        trigger.focus();
        return;
      }

      if (event.key === "Tab") {
        closeOfficialVersionSelect();
        return;
      }

      let nextIndex = currentIndex;
      if (event.key === "ArrowDown") {
        nextIndex = Math.min(currentIndex + 1, options.length - 1);
      } else if (event.key === "ArrowUp") {
        nextIndex = Math.max(currentIndex - 1, 0);
      } else if (event.key === "Home") {
        nextIndex = 0;
      } else if (event.key === "End") {
        nextIndex = options.length - 1;
      } else {
        return;
      }

      event.preventDefault();
      options[nextIndex]?.focus();
    });

    root.addEventListener("focusout", () => {
      window.requestAnimationFrame(() => {
        if (!root.contains(document.activeElement)) {
          closeOfficialVersionSelect();
        }
      });
    });

    document.addEventListener("pointerdown", (event) => {
      if (root.classList.contains("is-open") && !root.contains(event.target)) {
        closeOfficialVersionSelect();
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && root.classList.contains("is-open")) {
        closeOfficialVersionSelect();
        trigger.focus();
      }
    });
  }

  function openOfficialVersionSelect() {
    const root = elements.officialVersionMultiSelect;
    const trigger = root?.querySelector("[data-preset-multi-trigger]");
    const menu = root?.querySelector("[data-preset-multi-menu]");
    const firstOption = menu?.querySelector("input[type='checkbox']");
    if (!root || !trigger || !menu) {
      return;
    }

    root.classList.add("is-open");
    trigger.setAttribute("aria-expanded", "true");
    menu.hidden = false;
    (menu.querySelector("input[type='checkbox']:checked") || firstOption)?.focus();
  }

  function closeOfficialVersionSelect() {
    const root = elements.officialVersionMultiSelect;
    const trigger = root?.querySelector("[data-preset-multi-trigger]");
    const menu = root?.querySelector("[data-preset-multi-menu]");
    root?.classList.remove("is-open");
    trigger?.setAttribute("aria-expanded", "false");
    if (menu) {
      menu.hidden = true;
    }
  }

  function updateOfficialVersionValue() {
    const root = elements.officialVersionMultiSelect;
    const input = root?.querySelector("[data-preset-multi-value]");
    const label = root?.querySelector("[data-preset-multi-label]");
    if (!root || !input || !label) {
      return;
    }

    const options = Array.from(root.querySelectorAll("[data-preset-multi-option]"));
    const selected = options
      .filter((option) => option.querySelector("input[type='checkbox']")?.checked)
      .map((option) => option.dataset.value);

    input.value = selected.length ? JSON.stringify(selected) : "";
    label.textContent = selected.length ? selected.join("、") : "不限";
    options.forEach((option) => {
      const checked = option.querySelector("input[type='checkbox']")?.checked;
      option.classList.toggle("is-selected", Boolean(checked));
      option.setAttribute("aria-selected", String(Boolean(checked)));
    });
  }

  function setOfficialVersionOptions(versions) {
    const root = elements.officialVersionMultiSelect;
    const menu = root?.querySelector("[data-preset-multi-menu]");
    const input = root?.querySelector("[data-preset-multi-value]");
    if (!root || !menu || !input) {
      return;
    }

    let selected = [];
    try {
      const parsed = JSON.parse(input.value || "[]");
      if (Array.isArray(parsed)) {
        selected = parsed.map(String);
      }
    } catch (error) {
      selected = [];
    }

    menu.innerHTML = versions.map((version) => `
      <label class="preset-select-option preset-multi-option" data-preset-multi-option data-value="${escapeAttribute(version)}" aria-selected="${selected.includes(version)}">
        <input type="checkbox" value="${escapeAttribute(version)}" ${selected.includes(version) ? "checked" : ""}>
        <span>${escapeHtml(version)}</span>
      </label>
    `).join("");
    updateOfficialVersionValue();
  }

  async function updateSession(user) {
    state.user = user;
    state.isAdmin = false;
    setAdminView("checking");

    if (!user) {
      if (elements.authLabel) {
        elements.authLabel.textContent = "使用 GitHub 登录";
      }
      setAdminView(
        "signed-out",
        "需要管理员权限",
        "使用 GitHub 登录后，如果账号已加入管理员名单，审核功能会在这里显示。"
      );
      return;
    }

    const label = user.user_metadata?.user_name
      || user.user_metadata?.preferred_username
      || user.email
      || "已登录";
    if (elements.authLabel) {
      elements.authLabel.textContent = `退出 @${label.replace(/^@/, "")}`;
    }

    try {
      const profile = await store.getProfile(store.getClient(), user.id);
      state.isAdmin = Boolean(profile?.is_admin);
    } catch (error) {
      setAdminView("error", "无法读取管理员权限", error.message);
      return;
    }

    if (!state.isAdmin) {
      setAdminView(
        "forbidden",
        "当前账号没有管理员权限",
        "请先在 Supabase 的 profiles 表中将该账号设置为管理员。"
      );
      return;
    }

    setAdminView("admin");
    await loadAllReviews();
  }

  function setAdminView(view, title, description) {
    const showGate = ["signed-out", "forbidden", "error"].includes(view);
    const showContent = view === "admin";

    elements.configWarning.hidden = view !== "unconfigured";
    elements.gate.hidden = !showGate;
    elements.content.hidden = !showContent;

    if (showGate) {
      elements.gate.querySelector("h2").textContent = title || "需要管理员权限";
      elements.gate.querySelector("p").textContent = description || "";
    }
  }

  async function loadAllReviews() {
    elements.list.innerHTML = renderReviewSkeleton();
    await Promise.all(["pending", "rejected", "approved", "hidden"].map((status) => loadReviews(status)));
  }

  async function loadReviews(status) {
    if (!state.isAdmin) {
      return;
    }

    try {
      state.packages[status] = await store.fetchReviewPackages(store.getClient(), status);
      renderReviews();
    } catch (error) {
      showError(error);
    }
  }

  function renderReviews() {
    elements.counts.forEach((count) => {
      count.textContent = String(state.packages[count.dataset.reviewCount]?.length || 0);
    });

    const packages = state.packages[state.activeStatus] || [];
    elements.list.innerHTML = packages.length
      ? packages.map(renderReviewItem).join("")
      : `
        <div class="preset-empty">
          <div>
            <i data-lucide="inbox" aria-hidden="true"></i>
            <h2>这里还没有内容</h2>
            <p>投稿进入当前状态后会显示在这里。</p>
          </div>
        </div>
      `;
    refreshIcons();
  }

  function renderReviewItem(item) {
    const canReview = item.status === "pending";
    return `
      <article class="preset-review-item">
        <div class="preset-review-main">
          <h3>${escapeHtml(item.title)}</h3>
          <div class="preset-review-meta">
            <span>${escapeHtml(item.author_name)}</span>
            ${item.game ? `<span>${escapeHtml(item.game)}</span>` : ""}
            <span>${Number(item.preset_count) || 0} 个预设</span>
            <span>${formatDate(item.created_at)}</span>
          </div>
          ${item.rejection_reason
            ? `<p class="preset-rejection-note">拒绝原因：${escapeHtml(item.rejection_reason)}</p>`
            : ""}
        </div>
        <div class="preset-review-actions">
          <button type="button" data-view-review="${escapeAttribute(item.id)}" aria-label="查看详情">
            <i data-lucide="eye" aria-hidden="true"></i>
          </button>
          ${item.is_hidden ? `
            <button class="is-approve" type="button" data-restore-review="${escapeAttribute(item.id)}" aria-label="恢复到市场">
              <i data-lucide="rotate-ccw" aria-hidden="true"></i>
            </button>
            <button class="is-reject" type="button" data-delete-review="${escapeAttribute(item.id)}" data-delete-title="${escapeAttribute(item.title)}" aria-label="彻底删除">
              <i data-lucide="trash-2" aria-hidden="true"></i>
            </button>
          ` : `
            <button type="button" data-hide-review="${escapeAttribute(item.id)}" aria-label="从市场隐藏">
              <i data-lucide="eye-off" aria-hidden="true"></i>
            </button>
          `}
          ${canReview ? `
            <button class="is-approve" type="button" data-approve-review="${escapeAttribute(item.id)}" aria-label="通过">
              <i data-lucide="check" aria-hidden="true"></i>
            </button>
            <button class="is-reject" type="button" data-reject-review="${escapeAttribute(item.id)}" aria-label="拒绝">
              <i data-lucide="x" aria-hidden="true"></i>
            </button>
          ` : ""}
        </div>
      </article>
    `;
  }

  function renderReviewSkeleton() {
    return `
      <div class="preset-loading-list" aria-label="正在加载审核记录">
        ${Array.from({ length: 4 }, () => `
          <div class="preset-loading-row">
            <span class="preset-skeleton-line"></span>
            <span class="preset-skeleton-line"></span>
            <span class="preset-skeleton-line"></span>
          </div>
        `).join("")}
      </div>
    `;
  }

  function renderReviewDetailSkeleton() {
    return `
      <div class="preset-loading-detail" aria-label="正在加载审核详情">
        <div class="ui-skeleton preset-loading-stage"></div>
        <div class="preset-loading-meta">
          <span class="ui-skeleton ui-skeleton-chip"></span>
          <span class="ui-skeleton ui-skeleton-chip"></span>
          <span class="ui-skeleton ui-skeleton-chip"></span>
        </div>
        <span class="ui-skeleton ui-skeleton-line"></span>
        <span class="ui-skeleton ui-skeleton-line"></span>
      </div>
    `;
  }

  function renderScreenshotCarousel(paths, urls) {
    const slides = (paths || [])
      .map((path, index) => ({
        url: urls[path],
        index
      }))
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

      carousel.querySelector("[data-carousel-prev]")?.addEventListener("click", () => {
        show(current - 1);
      });
      carousel.querySelector("[data-carousel-next]")?.addEventListener("click", () => {
        show(current + 1);
      });
      dots.forEach((dot) => {
        dot.addEventListener("click", () => {
          show(Number(dot.dataset.carouselIndex));
        });
      });
      carousel.addEventListener("keydown", (event) => {
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          show(current - 1);
        } else if (event.key === "ArrowRight") {
          event.preventDefault();
          show(current + 1);
        }
      });
    });
  }

  async function openReviewDetail(packageId) {
    const item = Object.values(state.packages).flat().find((preset) => preset.id === packageId);
    if (!item) {
      return;
    }

    elements.detailBody.innerHTML = renderReviewDetailSkeleton();
    elements.detailDialog.showModal();

    try {
      const screenshotUrls = item.screenshot_paths?.length
        ? await store.getSignedUrls(
          store.getClient(),
          store.SCREENSHOT_BUCKET,
          item.screenshot_paths,
          3600
        )
        : {};
      const screenshotCarousel = renderScreenshotCarousel(item.screenshot_paths, screenshotUrls);
      const presetItems = [...(item.preset_items || [])]
        .sort((a, b) => Number(a.sort_order) - Number(b.sort_order))
        .map((preset) => `
          <div class="preset-detail-item">
            <strong>${escapeHtml(preset.display_name || preset.name)}</strong>
            <span>${preset.scope === "keyboard" ? "键鼠" : "手柄"}</span>
          </div>
        `)
        .join("");

      elements.detailBody.innerHTML = `
        <div class="preset-detail-body">
          ${screenshotCarousel}
          <div class="preset-detail-head">
            <div class="preset-detail-meta">
              ${item.scope_keyboard ? `<span class="preset-badge is-accent">键鼠</span>` : ""}
              ${item.scope_gamepad ? `<span class="preset-badge is-accent">手柄</span>` : ""}
              ${renderStatus(item.status)}
            </div>
            <h2>${escapeHtml(item.title)}</h2>
            <p class="preset-card-author">${escapeHtml(formatAuthorGame(item))}</p>
          </div>
          <dl class="preset-detail-facts">
            <div><dt>投稿版本</dt><dd>${escapeHtml(item.version || "未标注")}</dd></div>
            <div><dt>支持版本</dt><dd>${renderVersionSupportDetail(item.pa_version_range)}</dd></div>
            <div><dt>包含预设</dt><dd>${Number(item.preset_count) || 0} 个</dd></div>
            <div><dt>提交时间</dt><dd>${formatDate(item.created_at)}</dd></div>
          </dl>
          <p class="preset-detail-description">${escapeHtml(item.description || "作者暂未填写预设介绍。")}</p>
          <div class="preset-detail-section">
            <h3>包含的预设</h3>
            <div class="preset-detail-list">${presetItems}</div>
          </div>
          <div class="preset-json-preview" data-json-preview hidden>
            <pre></pre>
          </div>
          <div class="preset-form-actions">
            <button class="button button-secondary" type="button" data-preview-review-json="${escapeAttribute(item.id)}">
              <i data-lucide="file-search" aria-hidden="true"></i>
              预览 JSON
            </button>
            <button class="button button-primary" type="button" data-download-review-json="${escapeAttribute(item.id)}">
              <i data-lucide="download" aria-hidden="true"></i>
              下载 JSON
            </button>
          </div>
        </div>
      `;
      initScreenshotCarousels(elements.detailBody);
      refreshIcons();
    } catch (error) {
      elements.detailBody.innerHTML = `<p class="preset-feedback is-error">${escapeHtml(error.message)}</p>`;
    }
  }

  async function approvePackage(packageId, button) {
    button.disabled = true;
    pre.innerHTML = `<span class="ui-skeleton ui-skeleton-line"></span>`;
    try {
      const result = await store.getClient()
        .from("preset_packages")
        .update({
          status: "approved",
          rejection_reason: null,
          reviewed_at: new Date().toISOString(),
          reviewed_by: state.user.id
        })
        .eq("id", packageId);

      if (result.error) {
        throw new Error(store.errorMessage(result.error));
      }

      showToast("投稿已通过。");
      await loadAllReviews();
    } catch (error) {
      showError(error);
      button.disabled = false;
    }
  }

  async function setPackageVisibility(packageId, isHidden, button) {
    button.disabled = true;

    try {
      await store.setPresetPackageVisibility(
        store.getClient(),
        packageId,
        isHidden,
        state.user.id
      );
      showToast(isHidden ? "预设已从市场隐藏。" : "预设已恢复到市场。");
      await loadAllReviews();
    } catch (error) {
      showError(error);
      button.disabled = false;
    }
  }

  async function deletePackage() {
    const item = state.packages.hidden.find((preset) => preset.id === state.deleteId);
    if (!item) {
      return;
    }

    const original = elements.confirmDelete.innerHTML;
    elements.confirmDelete.disabled = true;
    elements.confirmDelete.textContent = "正在删除...";

    try {
      await store.deletePresetPackage(store.getClient(), item);
      elements.deleteDialog.close();
      state.deleteId = "";
      showToast("预设及其文件已彻底删除。");
      await loadAllReviews();
    } catch (error) {
      showError(error);
    } finally {
      elements.confirmDelete.disabled = false;
      elements.confirmDelete.innerHTML = original;
      refreshIcons();
    }
  }

  async function previewReviewJson(packageId, button) {
    const item = Object.values(state.packages).flat().find((preset) => preset.id === packageId);
    if (!item?.json_path) {
      return;
    }

    const container = elements.detailBody.querySelector("[data-json-preview]");
    const pre = container?.querySelector("pre");
    if (!container || !pre) {
      return;
    }

    button.disabled = true;
    try {
      const text = await store.getPresetFileText(store.getClient(), item.json_path);
      let formatted = text;
      try {
        formatted = JSON.stringify(JSON.parse(text), null, 2);
      } catch (error) {
        // Keep the original content visible if it cannot be formatted.
      }
      pre.textContent = formatted;
      container.hidden = false;
    } catch (error) {
      showError(error);
    } finally {
      button.disabled = false;
    }
  }

  async function downloadReviewJson(packageId, button) {
    const item = Object.values(state.packages).flat().find((preset) => preset.id === packageId);
    if (!item?.json_path) {
      return;
    }

    button.disabled = true;
    try {
      const url = await store.getDownloadUrl(
        store.getClient(),
        item.json_path,
        `${safeFilename(item.title)}.json`
      );

      if (!url) {
        throw new Error("下载地址生成失败。");
      }

      const link = document.createElement("a");
      link.href = url;
      link.download = `${safeFilename(item.title)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      showError(error);
    } finally {
      button.disabled = false;
    }
  }

  async function rejectPackage(event) {
    event.preventDefault();
    elements.rejectError.textContent = "";
    const reason = String(new FormData(elements.rejectForm).get("reason") || "").trim();

    if (!reason) {
      elements.rejectError.textContent = "请填写拒绝原因。";
      return;
    }

    const submitButton = elements.rejectForm.querySelector("button[type=submit]");
    submitButton.disabled = true;

    try {
      const result = await store.getClient()
        .from("preset_packages")
        .update({
          status: "rejected",
          rejection_reason: reason,
          reviewed_at: new Date().toISOString(),
          reviewed_by: state.user.id
        })
        .eq("id", state.rejectId);

      if (result.error) {
        throw new Error(store.errorMessage(result.error));
      }

      elements.rejectDialog.close();
      elements.rejectForm.reset();
      showToast("投稿已拒绝。");
      await loadAllReviews();
    } catch (error) {
      elements.rejectError.textContent = error.message;
    } finally {
      submitButton.disabled = false;
    }
  }

  async function publishOfficialPackage(event) {
    event.preventDefault();
    elements.officialError.textContent = "";
    const original = elements.officialSubmit.innerHTML;

    const formData = new FormData(elements.officialForm);
    const jsonFile = elements.officialFileInput.files?.[0];
    const screenshots = elements.officialScreenshotInput.files || [];

    try {
      if (!state.parsedOfficialPreset) {
        state.parsedOfficialPreset = await store.readPresetFile(jsonFile);
      }

      const fields = {
        title: formData.get("title"),
        authorName: "PA Keystroke",
        version: formData.get("version"),
        description: formData.get("description")
      };

      store.validatePackageFields(fields);
      elements.officialSubmit.disabled = true;
      elements.officialSubmit.textContent = "正在发布...";

      await store.createPresetPackage(store.getClient(), {
        source: "official",
        status: "approved",
        userId: state.user.id,
        fields,
        parsed: state.parsedOfficialPreset,
        jsonFile,
        screenshots
      });

      elements.officialForm.reset();
      updateOfficialVersionValue();
      setOfficialVersionSupportDisplay(null);
      state.parsedOfficialPreset = null;
      elements.officialJsonSummary.hidden = true;
      elements.officialForm.hidden = true;
      showToast("官方预设已发布。");

      elements.officialSubmit.disabled = false;
      elements.officialSubmit.innerHTML = original;
      refreshIcons();
    } catch (error) {
      elements.officialError.textContent = error.message;
      elements.officialSubmit.disabled = false;
      elements.officialSubmit.innerHTML = original;
      refreshIcons();
    }
  }

  function renderOfficialSummary(parsed) {
    setOfficialVersionSupportDisplay(parsed);
    elements.officialJsonSummary.hidden = false;
    elements.officialJsonSummary.innerHTML = `
      <strong>已识别 ${parsed.presetCount} 个预设</strong>
      <ul>
        ${parsed.items.map((item) => `
          <li>${escapeHtml(item.displayName)}</li>
        `).join("")}
      </ul>
    `;
  }

  function setOfficialVersionSupportDisplay(parsed) {
    if (!elements.officialVersionSupportValue) {
      return;
    }

    elements.officialVersionSupportValue.textContent = parsed
      ? parsed.versionSupportLabel
      : "上传 JSON 后自动识别";
    elements.officialVersionSupportValue.classList.toggle("is-pending", !parsed);
  }

  function renderStatus(status) {
    const labels = {
      pending: "待审核",
      approved: "已通过",
      rejected: "已拒绝"
    };
    return `<span class="preset-status is-${status}">${labels[status] || status}</span>`;
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
