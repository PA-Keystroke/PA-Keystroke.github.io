document.documentElement.classList.add("js");

const PAGE_TRANSITION_MS = 170;
const COMPACT_NAV_QUERY = window.matchMedia("(max-width: 960px)");

const VIDEO_PRESETS = {
  keyboard: {
    src: "assets/videos/keyboard-preview.mp4",
    poster: "assets/videos/keyboard-preview-poster.jpg",
    title: "键盘输入覆盖层",
    description: "按下键盘时，对应按键会实时高亮；适合教学、直播和输入展示。"
  },
  gamepad: {
    src: "assets/videos/gamepad-preview.mp4",
    poster: "assets/videos/gamepad-preview-poster.jpg",
    title: "手柄输入覆盖层",
    description: "整只手柄会响应按钮、摇杆和扳机状态；也可以拆成独立控件使用。"
  }
};

const releaseFallback = {
  version: "v1.0.01",
  size: "48.2 MB",
  date: "2026-09-29",
  notes: `### Changelog
**特性优化**
- 优化中英文混排字体显示。
- 优化预设列表显示、重命名体验和新建预设后的滚动定位。
- 优化自动识别模式下的预览、只读锁定和设备切换。
- 优化弹窗标题栏。

**问题修复**
- 修复文本描边重影和部分中英文混排问题。
- 修复左右 Shift、Ctrl、Alt 无法识别的问题。
- 修复 Win 键显示错误、控件高度异常和圆角不一致。`
};

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "";
  }

  const megabytes = bytes / 1024 / 1024;
  return megabytes >= 10 ? `${megabytes.toFixed(1)} MB` : `${megabytes.toFixed(2)} MB`;
}

function formatDate(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date).replaceAll("/", "-");
}

function setupNavigation() {
  const toggle = document.querySelector("[data-nav-toggle]");
  const nav = document.querySelector("[data-nav]");
  const header = document.querySelector("[data-header]");

  if (toggle && nav) {
    const setNavOpen = (isOpen) => {
      nav.classList.toggle("is-open", isOpen);
      toggle.classList.toggle("is-open", isOpen);
      toggle.setAttribute("aria-expanded", String(isOpen));
      const label = toggle.querySelector(".sr-only");
      if (label) {
        label.textContent = isOpen ? "关闭导航" : "打开导航";
      }
      document.body.classList.toggle("nav-open", isOpen);

      if (!isOpen) {
        closeCommunityMenus();
      }
    };

    toggle.addEventListener("click", () => {
      setNavOpen(!nav.classList.contains("is-open"));
    });

    nav.addEventListener("click", (event) => {
      if (event.target.closest("a")) {
        setNavOpen(false);
      }
    });

    document.addEventListener("click", (event) => {
      if (!nav.classList.contains("is-open")) {
        return;
      }

      if (!nav.contains(event.target) && !toggle.contains(event.target)) {
        setNavOpen(false);
      }
    });

    window.addEventListener("resize", () => {
      if (window.innerWidth > 900) {
        setNavOpen(false);
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && nav.classList.contains("is-open")) {
        setNavOpen(false);
        toggle.focus();
      }
    });
  }

  if (header) {
    const updateHeader = () => {
      header.classList.toggle("is-scrolled", window.scrollY > 12);
    };

    updateHeader();
    window.addEventListener("scroll", updateHeader, { passive: true });
  }
}

function shouldAnimatePageLink(link, event) {
  if (
    event.defaultPrevented
    || event.button !== 0
    || event.metaKey
    || event.ctrlKey
    || event.shiftKey
    || event.altKey
    || link.matches("[data-no-transition]")
    || link.hasAttribute("download")
  ) {
    return false;
  }

  if (link.target && link.target !== "_self") {
    return false;
  }

  const href = link.getAttribute("href");
  if (!href || href.startsWith("#")) {
    return false;
  }

  const url = new URL(link.href, window.location.href);
  if (
    url.origin !== window.location.origin
    || !["http:", "https:"].includes(url.protocol)
  ) {
    return false;
  }

  return !(
    url.pathname === window.location.pathname
    && url.search === window.location.search
    && url.hash
  );
}

function setupPageTransitions() {
  let isNavigating = false;

  const revealPage = () => {
    document.body.classList.remove("page-leaving");
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        document.body.classList.add("page-visible");
      });
    });
  };

  revealPage();

  document.addEventListener("click", (event) => {
    const link = event.target.closest("a[href]");
    if (!link || isNavigating || !shouldAnimatePageLink(link, event)) {
      return;
    }

    event.preventDefault();
    isNavigating = true;
    document.body.classList.remove("page-visible");
    document.body.classList.add("page-leaving");

    window.setTimeout(() => {
      window.location.href = link.href;
    }, PAGE_TRANSITION_MS);
  });

  window.addEventListener("pageshow", (event) => {
    if (event.persisted) {
      isNavigating = false;
      revealPage();
    }
  });
}

function setCommunityMenuOpen(dropdown, isOpen) {
  const trigger = dropdown.querySelector("[data-community-toggle]");
  const menu = dropdown.querySelector("[data-community-menu]");
  if (!trigger || !menu) {
    return;
  }

  window.clearTimeout(menu._closeTimer);
  trigger.setAttribute("aria-expanded", String(isOpen));

  if (!COMPACT_NAV_QUERY.matches) {
    menu.classList.toggle("is-open", isOpen);
    menu.hidden = !isOpen;
    return;
  }

  if (isOpen) {
    menu.hidden = false;
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        menu.classList.add("is-open");
      });
    });
    return;
  }

  menu.classList.remove("is-open");
  menu._closeTimer = window.setTimeout(() => {
    if (!menu.classList.contains("is-open")) {
      menu.hidden = true;
    }
  }, 380);
}

function closeCommunityMenus(except = null) {
  document.querySelectorAll("[data-community-dropdown]").forEach((dropdown) => {
    if (dropdown === except) {
      return;
    }

    setCommunityMenuOpen(dropdown, false);
  });
}

function setupCommunityMenus() {
  const dropdowns = Array.from(document.querySelectorAll("[data-community-dropdown]"));
  if (!dropdowns.length) {
    return;
  }

  dropdowns.forEach((dropdown) => {
    const trigger = dropdown.querySelector("[data-community-toggle]");
    const menu = dropdown.querySelector("[data-community-menu]");
    if (!trigger || !menu) {
      return;
    }

    trigger.addEventListener("click", (event) => {
      event.stopPropagation();
      const willOpen = trigger.getAttribute("aria-expanded") !== "true";
      closeCommunityMenus(dropdown);
      setCommunityMenuOpen(dropdown, willOpen);
    });

    trigger.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        closeCommunityMenus(dropdown);
        setCommunityMenuOpen(dropdown, true);
        window.setTimeout(() => {
          menu.querySelector("a")?.focus();
        }, 40);
      }
    });

    menu.addEventListener("click", (event) => {
      if (event.target.closest("a")) {
        closeCommunityMenus();
      }
    });
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest("[data-community-dropdown]")) {
      closeCommunityMenus();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") {
      return;
    }

    const openDropdown = document.querySelector("[data-community-toggle][aria-expanded='true']");
    closeCommunityMenus();
    openDropdown?.focus();
  });

  COMPACT_NAV_QUERY.addEventListener("change", () => {
    closeCommunityMenus();
  });
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
  }, 2200);
}

async function copyText(value) {
  const text = String(value || "").trim();
  if (!text) {
    return false;
  }

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }

    showToast(`已复制：${text}`);
    return true;
  } catch (error) {
    showToast("复制失败，请手动选择群号");
    return false;
  }
}

function setupCopyButtons() {
  document.querySelectorAll("[data-copy]").forEach((button) => {
    button.addEventListener("click", () => {
      copyText(button.dataset.copy);
    });
  });
}

function setupVideoDemo() {
  const video = document.querySelector("#demo-video");
  const buttons = Array.from(document.querySelectorAll("[data-video-mode]"));
  const title = document.querySelector("[data-video-title]");
  const description = document.querySelector("[data-video-description]");

  if (!video || !buttons.length) {
    return;
  }

  let currentMode = video.dataset.videoMode || "keyboard";
  video.controls = false;
  video.autoplay = true;
  video.loop = true;
  video.muted = true;
  video.poster = VIDEO_PRESETS[currentMode].poster;

  video.addEventListener("loadeddata", () => {
    video.play().catch(() => {});
  });

  video.addEventListener("contextmenu", (event) => {
    event.preventDefault();
  });

  const selectMode = (mode, shouldPlay = true) => {
    const preset = VIDEO_PRESETS[mode];
    if (!preset || mode === currentMode) {
      if (shouldPlay && video.readyState > 0) {
        video.play().catch(() => {});
      }
      return;
    }

    currentMode = mode;
    video.dataset.videoMode = mode;
    video.pause();
    video.poster = preset.poster;
    video.querySelector("source")?.remove();
    video.src = preset.src;
    video.load();

    buttons.forEach((button) => {
      const active = button.dataset.videoMode === mode;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
    });

    if (title) {
      title.textContent = preset.title;
    }

    if (description) {
      description.textContent = preset.description;
    }

    if (shouldPlay) {
      video.play().catch(() => {});
    }
  };

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      selectMode(button.dataset.videoMode, true);
    });
  });
}

function applyReleaseData(release) {
  document.querySelectorAll("[data-release-version]").forEach((node) => {
    node.textContent = release.version || releaseFallback.version;
  });

  document.querySelectorAll("[data-release-size]").forEach((node) => {
    node.textContent = release.size || releaseFallback.size;
  });

  document.querySelectorAll("[data-release-date]").forEach((node) => {
    node.textContent = release.date || releaseFallback.date;
  });

  document.querySelectorAll("[data-release-notes-version]").forEach((node) => {
    node.textContent = release.version || releaseFallback.version;
  });

  if (release.notes) {
    renderReleaseNotes(release.notes);
  }
}

function appendInlineText(parent, value) {
  const parts = String(value).split(/\*\*(.+?)\*\*/g);
  parts.forEach((part, index) => {
    if (!part) {
      return;
    }

    if (index % 2 === 1) {
      const strong = document.createElement("strong");
      strong.textContent = part;
      parent.appendChild(strong);
      return;
    }

    parent.appendChild(document.createTextNode(part));
  });
}

function renderReleaseNotes(notes) {
  const container = document.querySelector("[data-release-notes]");
  if (!container) {
    return;
  }

  container.textContent = "";
  let list = null;

  String(notes || "").replaceAll("\r", "").split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      list = null;
      return;
    }

    if (trimmed.startsWith("### ")) {
      const heading = document.createElement("h4");
      heading.textContent = trimmed.slice(4);
      container.appendChild(heading);
      list = null;
      return;
    }

    if (trimmed.startsWith("- ")) {
      if (!list) {
        list = document.createElement("ul");
        container.appendChild(list);
      }

      const item = document.createElement("li");
      appendInlineText(item, trimmed.slice(2));
      list.appendChild(item);
      return;
    }

    const paragraph = document.createElement("p");
    appendInlineText(paragraph, trimmed);
    container.appendChild(paragraph);
    list = null;
  });
}

async function setupLatestRelease() {
  if (!document.querySelector("[data-release-version]")) {
    return;
  }

  const cacheKey = "pa-keystroke-release-v2";
  const cached = sessionStorage.getItem(cacheKey);
  if (cached) {
    try {
      applyReleaseData(JSON.parse(cached));
      return;
    } catch (error) {
      sessionStorage.removeItem(cacheKey);
    }
  }

  try {
    const response = await fetch("https://api.github.com/repos/PA-Keystroke/PA-Keystroke-Releases/releases/latest", {
      headers: {
        Accept: "application/vnd.github+json"
      }
    });

    if (!response.ok) {
      throw new Error(`GitHub API returned ${response.status}`);
    }

    const payload = await response.json();
    const executable = Array.isArray(payload.assets)
      ? payload.assets.find((asset) => /^PA-Keystroke.*\.exe$/i.test(asset.name || ""))
      : null;

    const release = {
      version: payload.tag_name || payload.name || releaseFallback.version,
      size: executable ? formatBytes(Number(executable.size)) : releaseFallback.size,
      date: formatDate(payload.published_at) || releaseFallback.date,
      notes: payload.body || releaseFallback.notes
    };

    applyReleaseData(release);
    sessionStorage.setItem(cacheKey, JSON.stringify(release));
  } catch (error) {
    applyReleaseData(releaseFallback);
  }
}

function setupLightbox() {
  const lightbox = document.querySelector("[data-lightbox]");
  const lightboxImage = document.querySelector("[data-lightbox-image]");
  const closeButton = document.querySelector("[data-lightbox-close]");
  const zoomButtons = Array.from(document.querySelectorAll("[data-zoom]"));

  if (!lightbox || !lightboxImage || !closeButton || !zoomButtons.length) {
    return;
  }

  let previousFocus = null;

  const close = () => {
    lightbox.hidden = true;
    document.body.classList.remove("lightbox-open");
    lightboxImage.src = "";
    lightboxImage.alt = "";
    previousFocus?.focus();
  };

  const open = (button) => {
    previousFocus = button;
    const sourceImage = button.querySelector("img");
    lightboxImage.src = button.dataset.zoom;
    lightboxImage.alt = sourceImage?.alt || "PA Keystroke 界面预览";
    lightbox.hidden = false;
    document.body.classList.add("lightbox-open");
    closeButton.focus();
  };

  zoomButtons.forEach((button) => {
    button.addEventListener("click", () => open(button));
  });

  closeButton.addEventListener("click", close);
  lightbox.addEventListener("click", (event) => {
    if (event.target === lightbox) {
      close();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !lightbox.hidden) {
      close();
    }
  });
}

function setupReveal() {
  const targets = Array.from(document.querySelectorAll(".reveal"));
  if (!targets.length) {
    return;
  }

  document.querySelectorAll("[data-reveal-group]").forEach((group) => {
    Array.from(group.querySelectorAll(".reveal")).forEach((target, index) => {
      target.style.setProperty("--reveal-delay", `${Math.min(index, 5) * 70}ms`);
    });
  });

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) {
    targets.forEach((target) => target.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.14,
    rootMargin: "0px 0px -40px"
  });

  targets.forEach((target) => observer.observe(target));
}

function setupWikiNavigation() {
  const nav = document.querySelector("[data-wiki-nav]");
  const navToggle = document.querySelector("[data-wiki-toggle]");
  const sidebar = document.querySelector("[data-wiki-sidebar]");
  const currentSectionLabel = document.querySelector("[data-wiki-current-section]");
  const links = Array.from(document.querySelectorAll(".wiki-nav a"));
  const sections = links
    .map((link) => document.querySelector(link.getAttribute("href")))
    .filter(Boolean);

  if (navToggle && nav) {
    const setWikiNavOpen = (isOpen) => {
      nav.classList.toggle("is-open", isOpen);
      navToggle.setAttribute("aria-expanded", String(isOpen));
    };

    navToggle.addEventListener("click", () => {
      setWikiNavOpen(!nav.classList.contains("is-open"));
    });

    nav.addEventListener("click", (event) => {
      if (event.target.closest("a")) {
        setWikiNavOpen(false);
      }
    });

    document.addEventListener("click", (event) => {
      if (!nav.classList.contains("is-open")) {
        return;
      }

      if (!sidebar?.contains(event.target)) {
        setWikiNavOpen(false);
      }
    });

    window.addEventListener("resize", () => {
      if (window.innerWidth > 960) {
        setWikiNavOpen(false);
      }
    });
  }

  if (!links.length || !sections.length) {
    return;
  }

  if (sidebar) {
    const updateStickyState = () => {
      const stickyTop = Number.parseFloat(window.getComputedStyle(sidebar).top) || 0;
      const isStuck = sidebar.getBoundingClientRect().top <= stickyTop + 1;
      sidebar.classList.toggle("is-stuck", isStuck);
    };

    updateStickyState();
    window.addEventListener("scroll", updateStickyState, { passive: true });
    window.addEventListener("resize", updateStickyState);
  }

  const updateActiveLink = () => {
    const offset = window.scrollY + 150;
    let activeSection = sections[0];

    sections.forEach((section) => {
      if (section.offsetTop <= offset) {
        activeSection = section;
      }
    });

    links.forEach((link) => {
      const active = link.getAttribute("href") === `#${activeSection.id}`;
      link.classList.toggle("is-active", active);

      if (active && currentSectionLabel) {
        const nextLabel = link.textContent.trim();
        if (currentSectionLabel.textContent !== nextLabel) {
          currentSectionLabel.textContent = nextLabel;

          if (
            sidebar?.classList.contains("is-stuck")
            && !window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ) {
            currentSectionLabel.animate(
              [
                { opacity: 0, transform: "translateX(-6px)" },
                { opacity: 1, transform: "translateX(0)" }
              ],
              {
                duration: 280,
                easing: "cubic-bezier(0.22, 1, 0.36, 1)"
              }
            );
          }
        }
      }
    });
  };

  let ticking = false;
  window.addEventListener("scroll", () => {
    if (ticking) {
      return;
    }

    ticking = true;
    window.requestAnimationFrame(() => {
      updateActiveLink();
      ticking = false;
    });
  }, { passive: true });

  updateActiveLink();
}

function setupBackToTop() {
  const button = document.querySelector("[data-back-to-top]");
  if (!button) {
    return;
  }

  const update = () => {
    button.classList.toggle("is-visible", window.scrollY > 700);
  };

  button.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  update();
  window.addEventListener("scroll", update, { passive: true });
}

function setupCurrentYear() {
  const year = String(new Date().getFullYear());
  document.querySelectorAll("[data-current-year]").forEach((node) => {
    node.textContent = year;
  });
}

function initializeIcons() {
  if (window.lucide && typeof window.lucide.createIcons === "function") {
    window.lucide.createIcons({
      attrs: {
        "stroke-width": 1.8
      }
    });
  }
}

function init() {
  initializeIcons();
  setupPageTransitions();
  setupNavigation();
  setupCommunityMenus();
  setupCopyButtons();
  setupVideoDemo();
  setupLatestRelease();
  setupLightbox();
  setupReveal();
  setupWikiNavigation();
  setupBackToTop();
  setupCurrentYear();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}
