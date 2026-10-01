(function () {
  "use strict";

  const store = window.PA_PRESET_STORE;
  const state = {
    packages: {
      official: [],
      community: []
    },
    user: null,
    parsedPreset: null,
    openMineHandled: false,
    hideId: "",
    renderToken: 0,
    currentPage: 1,
    pageSize: 0,
    loading: false
  };

  const elements = {};
  let openPresetSelect = null;
  let openPresetMultiSelect = null;
  let resizeTimer = 0;

  function init() {
    elements.tabs = Array.from(document.querySelectorAll("[data-preset-tab]"));
    elements.tabCounts = Array.from(document.querySelectorAll("[data-tab-count]"));
    elements.filters = document.querySelector("[data-preset-filters]");
    elements.versionSelect = document.querySelector("[data-preset-version]");
    elements.versionMultiSelect = document.querySelector("[data-preset-multi-select='version-support']");
    elements.versionSupportValue = document.querySelector("[data-version-support-value]");
    elements.grid = document.querySelector("[data-preset-grid]");
    elements.pagination = Array.from(document.querySelectorAll("[data-preset-pagination]"));
    elements.feedback = document.querySelector("[data-preset-feedback]");
    elements.configWarning = document.querySelector("[data-config-warning]");
    elements.authButton = document.querySelector("[data-auth-button]");
    elements.authLabel = document.querySelector("[data-auth-label]");
    elements.openSubmit = document.querySelector("[data-open-submit]");
    elements.openMine = document.querySelector("[data-open-mine]");
    elements.submitDialog = document.querySelector("[data-submit-dialog]");
    elements.submitForm = document.querySelector("[data-submit-form]");
    elements.submitError = document.querySelector("[data-submit-error]");
    elements.submitConfirm = document.querySelector("[data-submit-confirm]");
    elements.presetFileInput = elements.submitForm?.elements.presetFile;
    elements.screenshotInput = elements.submitForm?.elements.screenshots;
    elements.jsonSummary = document.querySelector("[data-json-summary]");
    elements.screenshotList = document.querySelector("[data-screenshot-list]");
    elements.detailDialog = document.querySelector("[data-detail-dialog]");
    elements.detailBody = document.querySelector("[data-detail-body]");
    elements.authDialog = document.querySelector("[data-auth-dialog]");
    elements.authDialogLogin = document.querySelector("[data-auth-dialog-login]");
    elements.mineDialog = document.querySelector("[data-mine-dialog]");
    elements.mySubmissions = document.querySelector("[data-my-submissions]");
    elements.hideDialog = document.querySelector("[data-hide-dialog]");
    elements.hideTitle = document.querySelector("[data-hide-title]");
    elements.confirmHide = document.querySelector("[data-confirm-hide]");
    elements.presetSelects = Array.from(document.querySelectorAll("[data-preset-select]"));
    elements.multiSelects = Array.from(document.querySelectorAll("[data-preset-multi-select]"));

    initPresetSelects();
    initPresetMultiSelects();
    setPresetSelectLoading(elements.versionSelect?.closest("[data-preset-select]"));
    setPresetMultiSelectLoading(elements.versionMultiSelect);
    bindEvents();

    const client = store.getClient();
    if (!client) {
      elements.configWarning.hidden = false;
      if (elements.authButton) {
        elements.authButton.disabled = true;
      }
      elements.openSubmit.disabled = true;
      setFeedback("等待完成 Supabase 配置。");
      return;
    }

    client.auth.getSession().then(({ data }) => {
      setUser(data.session?.user || null);
    });

    client.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
    });

    loadReleaseVersions();
    loadPackages();
  }

  function initPresetSelects() {
    elements.presetSelects.forEach((root) => {
      const trigger = root.querySelector("[data-preset-select-trigger]");
      const menu = root.querySelector("[data-preset-select-menu]");
      if (!trigger || !menu) {
        return;
      }

      trigger.setAttribute("aria-label", root.dataset.label || "筛选");
      trigger.addEventListener("click", () => {
        if (root.classList.contains("is-open")) {
          closePresetSelect(root);
        } else {
          openPresetSelectMenu(root);
        }
      });

      trigger.addEventListener("keydown", (event) => {
        if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
          return;
        }

        event.preventDefault();
        openPresetSelectMenu(root);
      });

      menu.addEventListener("click", (event) => {
        const option = event.target.closest("[data-preset-select-option]");
        if (!option) {
          return;
        }

        setPresetSelectValue(root, option.dataset.value, true);
        closePresetSelect(root);
        trigger.focus();
      });

      menu.addEventListener("keydown", (event) => {
        handlePresetSelectMenuKeydown(event, root, trigger);
      });

      root.addEventListener("focusout", () => {
        window.requestAnimationFrame(() => {
          if (!root.contains(document.activeElement)) {
            closePresetSelect(root);
          }
        });
      });
    });

    document.addEventListener("pointerdown", (event) => {
      if (openPresetSelect && !openPresetSelect.contains(event.target)) {
        closePresetSelect(openPresetSelect);
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && openPresetSelect) {
        const root = openPresetSelect;
        closePresetSelect(root);
        root.querySelector("[data-preset-select-trigger]")?.focus();
      }
    });
  }

  function openPresetSelectMenu(root) {
    if (openPresetSelect && openPresetSelect !== root) {
      closePresetSelect(openPresetSelect);
    }
    if (openPresetMultiSelect) {
      closePresetMultiSelect(openPresetMultiSelect);
    }

    const trigger = root.querySelector("[data-preset-select-trigger]");
    const menu = root.querySelector("[data-preset-select-menu]");
    const options = getPresetSelectOptions(root);
    if (!trigger || !menu) {
      return;
    }

    openPresetSelect = root;
    root.classList.add("is-open");
    trigger.setAttribute("aria-expanded", "true");
    menu.hidden = false;

    const selected = options.find((option) => option.classList.contains("is-selected"));
    (selected || options[0])?.focus();
  }

  function closePresetSelect(root) {
    if (!root) {
      return;
    }

    const trigger = root.querySelector("[data-preset-select-trigger]");
    const menu = root.querySelector("[data-preset-select-menu]");
    root.classList.remove("is-open");
    trigger?.setAttribute("aria-expanded", "false");
    if (menu) {
      menu.hidden = true;
    }
    if (openPresetSelect === root) {
      openPresetSelect = null;
    }
  }

  function handlePresetSelectMenuKeydown(event, root, trigger) {
    const options = getPresetSelectOptions(root);
    const currentIndex = options.indexOf(document.activeElement);

    if (event.key === "Escape") {
      event.preventDefault();
      closePresetSelect(root);
      trigger.focus();
      return;
    }

    if (event.key === "Tab") {
      closePresetSelect(root);
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
  }

  function getPresetSelectOptions(root) {
    return Array.from(root.querySelectorAll("[data-preset-select-option]"));
  }

  function setPresetSelectValue(root, value, emitChange) {
    const input = root.querySelector("input[type='hidden']");
    const valueElement = root.querySelector("[data-preset-select-value]");
    const options = getPresetSelectOptions(root);
    const option = options.find((item) => item.dataset.value === String(value));
    if (!input || !valueElement || !option) {
      return;
    }

    input.value = option.dataset.value;
    valueElement.textContent = option.textContent.trim();
    options.forEach((item) => {
      const selected = item === option;
      item.classList.toggle("is-selected", selected);
      item.setAttribute("aria-selected", String(selected));
    });

    if (emitChange) {
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }

  function setPresetSelectOptions(root, options) {
    const input = root?.querySelector("input[type='hidden']");
    const menu = root?.querySelector("[data-preset-select-menu]");
    if (!root || !input || !menu) {
      return;
    }

    const previousValue = input.value;
    menu.innerHTML = options.map((option) => `
      <button class="preset-select-option" type="button" role="option" aria-selected="false" data-preset-select-option data-value="${escapeAttribute(option.value)}">${escapeHtml(option.label)}</button>
    `).join("");

    const nextValue = options.some((option) => String(option.value) === previousValue)
      ? previousValue
      : String(options[0]?.value || "");
    setPresetSelectValue(root, nextValue, false);
  }

  function setPresetSelectLoading(root) {
    const menu = root?.querySelector("[data-preset-select-menu]");
    if (!menu) {
      return;
    }

    menu.innerHTML = `
      <div class="preset-select-loading" aria-hidden="true">
        <span class="preset-skeleton-line"></span>
        <span class="preset-skeleton-line"></span>
        <span class="preset-skeleton-line"></span>
      </div>
    `;
  }

  function setPresetMultiSelectLoading(root) {
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

  function initPresetMultiSelects() {
    elements.multiSelects.forEach((root) => {
      const trigger = root.querySelector("[data-preset-multi-trigger]");
      const menu = root.querySelector("[data-preset-multi-menu]");
      if (!trigger || !menu) {
        return;
      }

      trigger.addEventListener("click", () => {
        if (root.classList.contains("is-open")) {
          closePresetMultiSelect(root);
        } else {
          openPresetMultiSelectMenu(root);
        }
      });

      trigger.addEventListener("keydown", (event) => {
        if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
          return;
        }

        event.preventDefault();
        openPresetMultiSelectMenu(root);
      });

      menu.addEventListener("change", (event) => {
        if (event.target.matches("input[type='checkbox']")) {
          updatePresetMultiSelectValue(root);
        }
      });

      menu.addEventListener("keydown", (event) => {
        handlePresetMultiSelectMenuKeydown(event, root, trigger);
      });

      root.addEventListener("focusout", () => {
        window.requestAnimationFrame(() => {
          if (!root.contains(document.activeElement)) {
            closePresetMultiSelect(root);
          }
        });
      });
    });

    document.addEventListener("pointerdown", (event) => {
      if (openPresetMultiSelect && !openPresetMultiSelect.contains(event.target)) {
        closePresetMultiSelect(openPresetMultiSelect);
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && openPresetMultiSelect) {
        const root = openPresetMultiSelect;
        closePresetMultiSelect(root);
        root.querySelector("[data-preset-multi-trigger]")?.focus();
      }
    });
  }

  function openPresetMultiSelectMenu(root) {
    if (openPresetMultiSelect && openPresetMultiSelect !== root) {
      closePresetMultiSelect(openPresetMultiSelect);
    }
    if (openPresetSelect) {
      closePresetSelect(openPresetSelect);
    }

    const trigger = root.querySelector("[data-preset-multi-trigger]");
    const menu = root.querySelector("[data-preset-multi-menu]");
    const firstOption = menu?.querySelector("input[type='checkbox']");
    if (!trigger || !menu) {
      return;
    }

    openPresetMultiSelect = root;
    root.classList.add("is-open");
    trigger.setAttribute("aria-expanded", "true");
    menu.hidden = false;

    const selected = menu.querySelector("input[type='checkbox']:checked");
    (selected || firstOption)?.focus();
  }

  function closePresetMultiSelect(root) {
    if (!root) {
      return;
    }

    const trigger = root.querySelector("[data-preset-multi-trigger]");
    const menu = root.querySelector("[data-preset-multi-menu]");
    root.classList.remove("is-open");
    trigger?.setAttribute("aria-expanded", "false");
    if (menu) {
      menu.hidden = true;
    }
    if (openPresetMultiSelect === root) {
      openPresetMultiSelect = null;
    }
  }

  function handlePresetMultiSelectMenuKeydown(event, root, trigger) {
    const options = Array.from(root.querySelectorAll("[data-preset-multi-option] input[type='checkbox']"));
    const currentIndex = options.indexOf(document.activeElement);

    if (event.key === "Escape") {
      event.preventDefault();
      closePresetMultiSelect(root);
      trigger.focus();
      return;
    }

    if (event.key === "Tab") {
      closePresetMultiSelect(root);
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
  }

  function updatePresetMultiSelectValue(root) {
    if (!root) {
      return;
    }

    const input = root.querySelector("[data-preset-multi-value]");
    const label = root.querySelector("[data-preset-multi-label]");
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

  function setPresetMultiSelectOptions(root, versions) {
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

    menu.innerHTML = versions.length
      ? versions.map((version) => `
        <label class="preset-select-option preset-multi-option" data-preset-multi-option data-value="${escapeAttribute(version)}" aria-selected="${selected.includes(version)}">
          <input type="checkbox" value="${escapeAttribute(version)}" ${selected.includes(version) ? "checked" : ""}>
          <span>${escapeHtml(version)}</span>
        </label>
      `).join("")
      : `<p class="preset-multi-empty">暂无可选版本</p>`;

    updatePresetMultiSelectValue(root);
  }

  function bindEvents() {
    elements.tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        elements.tabs.forEach((item) => {
          const active = item === tab;
          item.classList.toggle("is-active", active);
          item.setAttribute("aria-selected", String(active));
        });
        state.currentPage = 1;
        renderPackages();
      });
    });

    elements.filters?.addEventListener("input", handleFilterChange);
    elements.filters?.addEventListener("change", handleFilterChange);

    elements.pagination.forEach((pagination) => {
      pagination.addEventListener("click", handlePaginationClick);
    });

    window.addEventListener("resize", handleGridResize);

    elements.authButton?.addEventListener("click", () => {
      if (state.user) {
        openMySubmissions();
      } else {
        elements.authDialog.showModal();
      }
    });

    elements.authDialogLogin?.addEventListener("click", () => {
      store.signInWithGitHub(store.getClient()).catch(showError);
    });

    elements.openSubmit?.addEventListener("click", () => {
      if (!state.user) {
        elements.authDialog.showModal();
        return;
      }

      resetSubmitForm();
      elements.submitDialog.showModal();
    });

    elements.openMine?.addEventListener("click", openMySubmissions);
    window.addEventListener("pa-open-my-submissions", openMySubmissions);

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

    elements.grid?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-open-detail]");
      if (button) {
        openDetail(button.dataset.openDetail);
      }
    });

    elements.detailBody?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-download-package]");
      if (button) {
        downloadPackage(button.dataset.downloadPackage, button);
      }
    });

    elements.mySubmissions?.addEventListener("click", (event) => {
      const signOutButton = event.target.closest("[data-sign-out]");
      if (signOutButton) {
        store.getClient()?.auth.signOut();
        elements.mineDialog.close();
        return;
      }

      const hideButton = event.target.closest("[data-hide-submission]");
      if (hideButton) {
        state.hideId = hideButton.dataset.hideSubmission;
        elements.hideTitle.textContent = hideButton.dataset.hideTitle || "该预设";
        elements.hideDialog.showModal();
      }
    });

    elements.confirmHide?.addEventListener("click", hideOwnSubmission);

    elements.presetFileInput?.addEventListener("change", async () => {
      const file = elements.presetFileInput.files?.[0];
      state.parsedPreset = null;
      elements.jsonSummary.hidden = true;
      elements.submitError.textContent = "";
      setVersionSupportDisplay(null);

      if (!file) {
        return;
      }

      try {
        state.parsedPreset = await store.readPresetFile(file);
        renderJsonSummary(state.parsedPreset);
      } catch (error) {
        elements.submitError.textContent = error.message;
      }
    });

    elements.screenshotInput?.addEventListener("change", () => {
      try {
        const files = store.validateScreenshots(elements.screenshotInput.files);
        elements.screenshotList.textContent = files.length
          ? `已选择 ${files.length} 张截图：${files.map((file) => file.name).join("、")}`
          : "";
        elements.submitError.textContent = "";
      } catch (error) {
        elements.screenshotList.textContent = "";
        elements.submitError.textContent = error.message;
      }
    });

    elements.submitForm?.addEventListener("submit", submitPreset);
  }

  async function loadPackages() {
    const client = store.getClient();
    if (!client) {
      return;
    }

    state.loading = true;
    renderPackages();

    try {
      const [official, community] = await Promise.all([
        store.fetchApprovedPackages(client, "official"),
        store.fetchApprovedPackages(client, "community")
      ]);

      state.packages.official = official;
      state.packages.community = community;
      setFeedback("");
    } catch (error) {
      setFeedback(error.message, true);
    } finally {
      state.loading = false;
      renderPackages();
    }
  }

  async function loadReleaseVersions() {
    if (!elements.versionSelect && !elements.versionMultiSelect) {
      return;
    }

    const versions = await store.fetchReleaseVersions();

    if (elements.versionSelect) {
      setPresetSelectOptions(elements.versionSelect.closest("[data-preset-select]"), [
        { value: "", label: "不限" },
        ...versions.map((version) => ({ value: version, label: version }))
      ]);
    }

    if (elements.versionMultiSelect) {
      setPresetMultiSelectOptions(elements.versionMultiSelect, versions);
    }
  }

  function renderPackages() {
    elements.tabCounts.forEach((count) => {
      count.textContent = String(state.packages[count.dataset.tabCount]?.length || 0);
    });

    const pageSize = getPageSize();
    state.pageSize = pageSize;

    if (state.loading) {
      elements.grid.setAttribute("aria-busy", "true");
      elements.grid.setAttribute("aria-label", "正在加载预设");
      elements.grid.innerHTML = renderLoadingState();
      renderPagination(0, 0);
      return;
    }
    elements.grid.removeAttribute("aria-busy");
    elements.grid.removeAttribute("aria-label");

    const filtered = filterPackages([
      ...state.packages.official,
      ...state.packages.community
    ]);
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    state.currentPage = Math.min(Math.max(state.currentPage, 1), totalPages);

    const startIndex = (state.currentPage - 1) * pageSize;
    renderPackageCards(filtered.slice(startIndex, startIndex + pageSize));
    renderPagination(state.currentPage, totalPages);
    refreshIcons();
  }

  function handleFilterChange() {
    state.currentPage = 1;
    renderPackages();
  }

  function handlePaginationClick(event) {
    const button = event.target.closest("[data-pagination-page]");
    if (!button || button.disabled) {
      return;
    }

    const nextPage = Number(button.dataset.paginationPage);
    if (!Number.isInteger(nextPage) || nextPage === state.currentPage) {
      return;
    }

    state.currentPage = nextPage;
    renderPackages();
    scrollPresetListToTop();
  }

  function handleGridResize() {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      if (getPageSize() !== state.pageSize) {
        renderPackages();
      }
    }, 150);
  }

  function getPageSize() {
    const columns = window.getComputedStyle(elements.grid).gridTemplateColumns;
    const columnCount = columns && columns !== "none"
      ? columns.split(/\s+/).filter(Boolean).length
      : 1;
    return Math.max(1, columnCount) * 5;
  }

  function renderPagination(currentPage, totalPages) {
    elements.pagination.forEach((pagination) => {
      if (state.loading || totalPages <= 1) {
        pagination.hidden = true;
        pagination.innerHTML = "";
        return;
      }

      const pageNumbers = getVisiblePageNumbers(currentPage, totalPages);
      const previousPage = Math.max(1, currentPage - 1);
      const nextPage = Math.min(totalPages, currentPage + 1);

      pagination.hidden = false;
      pagination.innerHTML = `
        <button class="preset-pagination-button preset-pagination-arrow" type="button" data-pagination-page="${previousPage}" aria-label="上一页" ${currentPage === 1 ? "disabled" : ""}>
          <i data-lucide="chevron-left" aria-hidden="true"></i>
          <span>上一页</span>
        </button>
        <div class="preset-pagination-pages">
          ${pageNumbers.map((page) => `
            <button class="preset-pagination-button" type="button" data-pagination-page="${page}" aria-label="第 ${page} 页" ${page === currentPage ? 'aria-current="page"' : ""}>${page}</button>
          `).join("")}
        </div>
        <button class="preset-pagination-button preset-pagination-arrow" type="button" data-pagination-page="${nextPage}" aria-label="下一页" ${currentPage === totalPages ? "disabled" : ""}>
          <span>下一页</span>
          <i data-lucide="chevron-right" aria-hidden="true"></i>
        </button>
      `;
    });
  }

  function getVisiblePageNumbers(currentPage, totalPages) {
    const visibleCount = Math.min(3, totalPages);
    let start = Math.max(1, currentPage - Math.floor(visibleCount / 2));
    let end = start + visibleCount - 1;

    if (end > totalPages) {
      end = totalPages;
      start = Math.max(1, end - visibleCount + 1);
    }

    return Array.from({ length: end - start + 1 }, (_item, index) => start + index);
  }

  function scrollPresetListToTop() {
    const target = elements.pagination[0] || elements.grid;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target?.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "start"
    });
  }

  function renderPackageCards(items) {
    const token = ++state.renderToken;
    const nextIds = new Set(items.map((item) => String(item.id)));
    const existing = new Map(
      Array.from(elements.grid.querySelectorAll("[data-preset-card-id]"))
        .map((card) => [card.dataset.presetCardId, card])
    );

    elements.grid.querySelectorAll(".preset-card-skeleton, .preset-empty").forEach((node) => {
      node.remove();
    });

    existing.forEach((card, id) => {
      window.clearTimeout(Number(card.dataset.removeTimer));
      if (nextIds.has(id)) {
        card.classList.remove("is-leaving");
        card.style.pointerEvents = "";
        return;
      }

      card.classList.add("is-leaving");
      card.dataset.removeTimer = String(window.setTimeout(() => {
        card.remove();
        if (token === state.renderToken && !elements.grid.querySelector("[data-preset-card-id]")) {
          elements.grid.innerHTML = renderEmptyState();
          refreshIcons();
        }
      }, 210));
    });

    if (!items.length) {
      window.setTimeout(() => {
        if (token !== state.renderToken) {
          return;
        }

        if (!elements.grid.querySelector("[data-preset-card-id]")) {
          elements.grid.innerHTML = renderEmptyState();
          refreshIcons();
        }
      }, 210);
      return;
    }

    items.forEach((item) => {
      const id = String(item.id);
      let card = existing.get(id);

      if (!card) {
        const template = document.createElement("template");
        template.innerHTML = renderCard(item).trim();
        card = template.content.firstElementChild;
        card.classList.add("is-entering");
        card.addEventListener("animationend", () => {
          card.classList.remove("is-entering");
        }, { once: true });
      } else if (card.classList.contains("is-leaving")) {
        card.classList.remove("is-leaving");
        card.classList.add("is-entering");
        card.addEventListener("animationend", () => {
          card.classList.remove("is-entering");
        }, { once: true });
      }

      elements.grid.append(card);
    });
  }

  function filterPackages(packages) {
    const formData = new FormData(elements.filters);
    const keyword = normalize(formData.get("keyword"));
    const source = normalize(formData.get("source"));
    const scope = normalize(formData.get("scope"));
    const version = normalize(formData.get("version"));

    return packages.filter((item) => {
      const itemNames = (item.preset_items || [])
        .map((preset) => `${preset.name} ${preset.display_name}`)
        .join(" ");
      const haystack = normalize([
        item.title,
        item.author_name,
        item.version,
        item.pa_version_range,
        item.description,
        itemNames
      ].join(" "));

      if (keyword && !haystack.includes(keyword)) {
        return false;
      }

      if (source && item.source !== source) {
        return false;
      }

      if (scope === "keyboard" && !item.scope_keyboard) {
        return false;
      }

      if (scope === "gamepad" && !item.scope_gamepad) {
        return false;
      }

      if (version && !packageSupportsVersion(item.pa_version_range, version)) {
        return false;
      }

      return true;
    });
  }

  function packageSupportsVersion(range, selectedVersion) {
    const support = parseVersionSupport(range);
    if (support.all) {
      return true;
    }

    if (support.exact.length) {
      return support.exact.includes(normalizeReleaseVersion(selectedVersion));
    }

    const normalizedVersions = support.versions;

    if (!normalizedVersions.length) {
      return true;
    }

    if (normalizedVersions.length === 1) {
      if (/[+]|以上|起/.test(String(range))) {
        return compareVersions(selectedVersion, normalizedVersions[0]) >= 0;
      }

      return compareVersions(selectedVersion, normalizedVersions[0]) === 0;
    }

    const minimum = normalizedVersions[0];
    const maximum = normalizedVersions[normalizedVersions.length - 1];
    return (
      compareVersions(selectedVersion, minimum) >= 0
      && compareVersions(selectedVersion, maximum) <= 0
    );
  }

  function parseVersionSupport(value) {
    const text = String(value || "").trim();
    if (!text) {
      return { all: true, exact: [], versions: [] };
    }

    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        const exact = [...new Set(parsed
          .map(normalizeReleaseVersion)
          .filter((version) => /^\d+(?:\.\d+){1,3}$/.test(version)))];
        return { all: !exact.length, exact, versions: exact };
      }
    } catch (error) {
      // Older entries store a readable range instead of JSON.
    }

    const matches = text.match(/v?(\d+(?:\.\d+){1,3})/gi) || [];
    const versions = matches.map(normalizeReleaseVersion);
    const isList = /[,，、]/.test(text);

    return {
      all: !versions.length,
      exact: isList ? [...new Set(versions)] : [],
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
      return /[+]|以上|起/.test(String(value)) ? `${support.versions[0]} 及以上` : support.versions[0];
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

    if (/[+]|以上|起/.test(String(value))) {
      return escapeHtml(`${support.versions[0]} 及以上`);
    }

    return escapeHtml(`${support.versions[0]} - ${support.versions[support.versions.length - 1]}`);
  }

  function formatAuthorGame(item) {
    const author = String(item.author_name || "").trim();
    const game = String(item.game || "").trim();
    return game ? `${author} · ${game}` : author;
  }

  function normalizeReleaseVersion(value) {
    return String(value || "").trim().replace(/^v/i, "");
  }

  function compareVersions(left, right) {
    const leftParts = normalizeReleaseVersion(left).split(".").map(Number);
    const rightParts = normalizeReleaseVersion(right).split(".").map(Number);
    const length = Math.max(leftParts.length, rightParts.length);

    for (let index = 0; index < length; index += 1) {
      const leftPart = Number.isFinite(leftParts[index]) ? leftParts[index] : 0;
      const rightPart = Number.isFinite(rightParts[index]) ? rightParts[index] : 0;
      if (leftPart !== rightPart) {
        return leftPart > rightPart ? 1 : -1;
      }
    }

    return 0;
  }

  function renderCard(item) {
    const scopes = renderScopeBadges(item);
    const description = item.description || "作者暂未填写预设介绍。";

    return `
      <article class="preset-card" data-preset-card-id="${escapeAttribute(item.id)}">
        <div class="preset-card-content">
          <div class="preset-card-meta">
            ${renderSourceBadge(item.source)}
            ${scopes}
            <span class="preset-badge">支持版本：${escapeHtml(formatVersionSupport(item.pa_version_range))}</span>
          </div>
          <h2 class="preset-card-title">${escapeHtml(item.title)}</h2>
          <p class="preset-card-author">${escapeHtml(formatAuthorGame(item))}</p>
          <p class="preset-card-description">${escapeHtml(description)}</p>
          <div class="preset-card-footer">
            <span><strong>${Number(item.preset_count) || 0} 个预设</strong></span>
            <button class="preset-card-action" type="button" data-open-detail="${escapeAttribute(item.id)}" aria-label="查看 ${escapeAttribute(item.title)}">
              <i data-lucide="arrow-up-right" aria-hidden="true"></i>
            </button>
          </div>
        </div>
      </article>
    `;
  }

  function renderScopeBadges(item) {
    const badges = [];
    if (item.scope_keyboard) {
      badges.push(`<span class="preset-badge is-accent">键鼠</span>`);
    }
    if (item.scope_gamepad) {
      badges.push(`<span class="preset-badge is-accent">手柄</span>`);
    }
    return badges.join("");
  }

  function renderSourceBadge(source) {
    return source === "official"
      ? `<span class="preset-badge is-accent">官方</span>`
      : `<span class="preset-badge">社区</span>`;
  }

  function renderEmptyState() {
    return `
      <div class="preset-empty is-entering">
        <div>
          <i data-lucide="package-open" aria-hidden="true"></i>
          <h2>没有符合条件的预设</h2>
          <p>可以调整关键词或筛选条件后再试。</p>
        </div>
      </div>
    `;
  }

  function renderLoadingState() {
    return Array.from({ length: 6 }, () => `
      <article class="preset-card preset-card-skeleton" aria-hidden="true">
        <div class="preset-card-content">
          <div class="preset-skeleton-meta">
            <span class="preset-skeleton-chip"></span>
            <span class="preset-skeleton-chip is-short"></span>
            <span class="preset-skeleton-chip"></span>
          </div>
          <div class="preset-skeleton-line is-title"></div>
          <div class="preset-skeleton-line is-author"></div>
          <div class="preset-skeleton-line is-description"></div>
          <div class="preset-skeleton-line is-description-short"></div>
          <div class="preset-skeleton-footer"></div>
        </div>
      </article>
    `).join("");
  }

  function renderSubmissionSkeleton() {
    return `
      <div class="preset-loading-list" aria-label="正在加载投稿">
        ${Array.from({ length: 3 }, () => `
          <div class="preset-loading-row">
            <span class="preset-skeleton-line"></span>
            <span class="preset-skeleton-line"></span>
            <span class="preset-skeleton-line"></span>
          </div>
        `).join("")}
      </div>
    `;
  }

  function renderDetailSkeleton() {
    return `
      <div class="preset-loading-detail" aria-label="正在加载详情">
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

  async function openDetail(packageId) {
    const item = [...state.packages.official, ...state.packages.community]
      .find((preset) => preset.id === packageId);

    if (!item) {
      return;
    }

    elements.detailBody.innerHTML = renderDetailSkeleton();
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
            <div class="preset-detail-head-main">
              <div class="preset-detail-meta">
                ${renderScopeBadges(item)}
                <span class="preset-badge">${escapeHtml(item.source === "official" ? "官方" : "社区")}</span>
              </div>
              <div class="preset-detail-title-row">
                <h2>${escapeHtml(item.title)}</h2>
                <button class="button button-primary preset-detail-download" type="button" data-download-package="${escapeAttribute(item.id)}">
                  <i data-lucide="download" aria-hidden="true"></i>
                  下载
                </button>
              </div>
              <p class="preset-card-author">${escapeHtml(formatAuthorGame(item))}</p>
            </div>
          </div>
          <dl class="preset-detail-facts">
            <div><dt>投稿版本</dt><dd>${escapeHtml(item.version || "未标注")}</dd></div>
            <div><dt>支持版本</dt><dd>${renderVersionSupportDetail(item.pa_version_range)}</dd></div>
            <div><dt>包含预设</dt><dd>${Number(item.preset_count) || 0} 个</dd></div>
            <div><dt>发布时间</dt><dd>${formatDate(item.created_at)}</dd></div>
          </dl>
          <p class="preset-detail-description">${escapeHtml(item.description || "作者暂未填写预设介绍。")}</p>
          <div class="preset-detail-section">
            <h3>包含的预设</h3>
            <div class="preset-detail-list">${presetItems}</div>
          </div>
        </div>
      `;
      initScreenshotCarousels(elements.detailBody);
      refreshIcons();
    } catch (error) {
      elements.detailBody.innerHTML = `<p class="preset-feedback is-error">${escapeHtml(error.message)}</p>`;
    }
  }

  async function downloadPackage(packageId, button) {
    const item = [...state.packages.official, ...state.packages.community]
      .find((preset) => preset.id === packageId);

    if (!item) {
      return;
    }

    const original = button.innerHTML;
    button.disabled = true;
    button.textContent = "正在准备下载...";

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
      button.innerHTML = original;
      refreshIcons();
    }
  }

  async function submitPreset(event) {
    event.preventDefault();
    elements.submitError.textContent = "";
    const original = elements.submitConfirm.innerHTML;

    const formData = new FormData(elements.submitForm);
    const jsonFile = elements.presetFileInput.files?.[0];
    const screenshots = elements.screenshotInput.files || [];

    try {
      if (!state.parsedPreset) {
        state.parsedPreset = await store.readPresetFile(jsonFile);
      }

      const fields = {
        title: formData.get("title"),
        authorName: getUsername(state.user),
        version: formData.get("version"),
        description: formData.get("description")
      };

      store.validatePackageFields(fields);

      elements.submitConfirm.disabled = true;
      elements.submitConfirm.textContent = "正在提交...";

      await store.createPresetPackage(store.getClient(), {
        source: "community",
        status: "pending",
        userId: state.user.id,
        fields,
        parsed: state.parsedPreset,
        jsonFile,
        screenshots
      });

      elements.submitDialog.close();
      resetSubmitForm();
      showToast("投稿已提交，等待审核。");
      await openMySubmissions();

      elements.submitConfirm.disabled = false;
      elements.submitConfirm.innerHTML = original;
      refreshIcons();
    } catch (error) {
      elements.submitError.textContent = error.message;
      elements.submitConfirm.disabled = false;
      elements.submitConfirm.innerHTML = original;
      refreshIcons();
    }
  }

  function resetSubmitForm() {
    elements.submitForm.reset();
    updatePresetMultiSelectValue(elements.versionMultiSelect);
    state.parsedPreset = null;
    elements.submitError.textContent = "";
    elements.jsonSummary.hidden = true;
    elements.screenshotList.textContent = "";
    setVersionSupportDisplay(null);
  }

  function renderJsonSummary(parsed) {
    setVersionSupportDisplay(parsed);
    elements.jsonSummary.hidden = false;
    elements.jsonSummary.innerHTML = `
      <strong>已识别 ${parsed.presetCount} 个预设</strong>
      <ul>
        ${parsed.items.map((item) => `
          <li>${escapeHtml(item.displayName)}</li>
        `).join("")}
      </ul>
    `;
  }

  function setVersionSupportDisplay(parsed) {
    if (!elements.versionSupportValue) {
      return;
    }

    elements.versionSupportValue.textContent = parsed
      ? parsed.versionSupportLabel
      : "上传 JSON 后自动识别";
    elements.versionSupportValue.classList.toggle("is-pending", !parsed);
  }

  function openMySubmissions() {
    if (!state.user) {
      elements.authDialog.showModal();
      return;
    }

    window.location.href = "account.html";
  }

  async function hideOwnSubmission() {
    if (!state.hideId) {
      return;
    }

    const original = elements.confirmHide.innerHTML;
    elements.confirmHide.disabled = true;
    elements.confirmHide.textContent = "正在删除...";

    try {
      await store.hideOwnPresetPackage(store.getClient(), state.hideId);
      elements.hideDialog.close();
      state.hideId = "";
      showToast("预设已删除。");
      await openMySubmissions();
    } catch (error) {
      showError(error);
    } finally {
      elements.confirmHide.disabled = false;
      elements.confirmHide.innerHTML = original;
      refreshIcons();
    }
  }

  function renderStatus(status) {
    const labels = {
      pending: "待审核",
      approved: "已通过",
      rejected: "已拒绝"
    };
    return `<span class="preset-status is-${status}">${labels[status] || status}</span>`;
  }

  function setUser(user) {
    state.user = user;
    const label = user?.user_metadata?.user_name
      || user?.user_metadata?.preferred_username
      || user?.email
      || "";
    if (elements.authLabel) {
      elements.authLabel.textContent = user ? (label ? `@${label}` : "已登录") : "使用 GitHub 登录";
    }
    if (elements.openMine) {
      elements.openMine.hidden = !user;
    }

    const openMine = new URLSearchParams(window.location.search).get("open") === "mine";
    if (user && openMine && !state.openMineHandled) {
      state.openMineHandled = true;
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete("open");
      window.history.replaceState({}, "", cleanUrl);
      openMySubmissions();
    }
  }

  function setFeedback(message, isError) {
    elements.feedback.textContent = message || "";
    elements.feedback.classList.toggle("is-error", Boolean(isError));
  }

  function showError(error) {
    setFeedback(store.errorMessage(error), true);
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

  function normalize(value) {
    return String(value || "").trim().toLocaleLowerCase("zh-CN");
  }

  function getUsername(user) {
    return user?.user_metadata?.user_name
      || user?.user_metadata?.preferred_username
      || user?.email?.split("@")[0]
      || "GitHub User";
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
