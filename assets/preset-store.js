(function () {
  "use strict";

  const PRESET_FILE_BUCKET = "preset-files";
  const SCREENSHOT_BUCKET = "preset-screenshots";
  const MAX_JSON_SIZE = 5 * 1024 * 1024;
  const MAX_SCREENSHOT_SIZE = 5 * 1024 * 1024;
  const MAX_SCREENSHOTS = 5;
  const FALLBACK_PA_VERSIONS = ["1.0.01", "1.0.00"];

  let client = null;

  function getConfig() {
    return window.PA_SUPABASE_CONFIG || {};
  }

  function isConfigured() {
    const config = getConfig();
    return Boolean(
      config.url
      && config.anonKey
      && window.supabase
      && typeof window.supabase.createClient === "function"
    );
  }

  function getClient() {
    if (!isConfigured()) {
      return null;
    }

    if (!client) {
      const config = getConfig();
      client = window.supabase.createClient(config.url, config.anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      });
    }

    return client;
  }

  function errorMessage(error) {
    if (!error) {
      return "发生未知错误。";
    }

    if (typeof error === "string") {
      return error;
    }

    return error.message || error.error_description || "发生未知错误。";
  }

  function normalizeText(value) {
    return String(value || "").trim();
  }

  function parsePresetVersion(value) {
    if (value === 1 || normalizeText(value) === "1") {
      return {
        version: 1,
        paVersionRange: "",
        versionSupportLabel: "全部版本"
      };
    }

    const normalized = normalizeReleaseVersion(value);
    if (!/^\d+(?:\.\d+){2,3}$/.test(normalized)) {
      throw new Error("预设文件的 version 缺失或格式不正确。version 为 1 时表示支持全部版本，其他情况请填写类似 1.0.00 的版本号。");
    }

    return {
      version: normalized,
      paVersionRange: `${normalized} 以上`,
      versionSupportLabel: `${normalized} 及以上`
    };
  }

  function validatePresetPayload(data) {
    if (!data || typeof data !== "object") {
      throw new Error("JSON 内容不是有效的预设对象。");
    }

    if (data.format !== "pa-keystroke-presets") {
      throw new Error("这不是 PA Keystroke 支持的预设文件。");
    }

    const versionSupport = parsePresetVersion(data.version);

    if (!Array.isArray(data.presets) || !data.presets.length) {
      throw new Error("预设文件中没有可用的预设。");
    }

    const items = [];
    const seen = new Set();

    data.presets.forEach((entry, index) => {
      if (!entry || typeof entry !== "object") {
        throw new Error(`第 ${index + 1} 个预设格式不正确。`);
      }

      const scope = normalizeText(entry.scope).toLowerCase();
      const name = normalizeText(entry.name);
      const displayName = normalizeText(entry.display_name) || name;

      if (!["keyboard", "gamepad"].includes(scope)) {
        throw new Error(`第 ${index + 1} 个预设缺少有效的 scope。`);
      }

      if (!name || !Array.isArray(entry.keys)) {
        throw new Error(`第 ${index + 1} 个预设缺少名称或控件数据。`);
      }

      const key = `${scope}:${name}`;
      if (seen.has(key)) {
        throw new Error(`预设 ${displayName} 重复出现。`);
      }

      seen.add(key);
      items.push({
        scope,
        name,
        displayName,
        sortOrder: items.length
      });
    });

    return {
      items,
      presetCount: items.length,
      scopes: [...new Set(items.map((item) => item.scope))],
      ...versionSupport
    };
  }

  async function readPresetFile(file) {
    if (!file) {
      throw new Error("请选择预设 JSON 文件。");
    }

    if (!file.name.toLowerCase().endsWith(".json")) {
      throw new Error("预设文件必须是 JSON 格式。");
    }

    if (file.size > MAX_JSON_SIZE) {
      throw new Error("预设 JSON 文件不能超过 5 MB。");
    }

    let data;
    try {
      data = JSON.parse(await file.text());
    } catch (error) {
      throw new Error("JSON 文件无法解析。");
    }

    return validatePresetPayload(data);
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

  async function fetchReleaseVersions() {
    let versions = [];
    const cacheKey = "pa-keystroke-release-versions";

    try {
      const cached = JSON.parse(window.sessionStorage.getItem(cacheKey) || "null");
      if (cached?.timestamp && Date.now() - cached.timestamp < 60 * 60 * 1000) {
        versions = cached.versions || [];
      }
    } catch (error) {
      // Ignore corrupted local cache and fetch fresh data.
    }

    if (!versions.length) {
      try {
        const response = await fetch(
          "https://api.github.com/repos/PA-Keystroke/PA-Keystroke-Releases/releases?per_page=100",
          {
            headers: {
              Accept: "application/vnd.github+json"
            }
          }
        );

        if (!response.ok) {
          throw new Error(`GitHub Releases 请求失败：${response.status}`);
        }

        const releases = await response.json();
        versions = [...new Set(releases
          .filter((release) => !release.draft && !release.prerelease)
          .map((release) => normalizeReleaseVersion(release.tag_name))
          .filter((version) => /^\d+(?:\.\d+){1,3}$/.test(version)))]
          .sort((a, b) => compareVersions(b, a));

        window.sessionStorage.setItem(cacheKey, JSON.stringify({
          timestamp: Date.now(),
          versions
        }));
      } catch (error) {
        versions = FALLBACK_PA_VERSIONS;
      }
    }

    return versions.length ? versions : FALLBACK_PA_VERSIONS;
  }

  function validateScreenshots(screenshots) {
    const files = Array.from(screenshots || []);
    const imageExtensions = /\.(avif|bmp|gif|jpe?g|png|webp)$/i;

    if (files.length > MAX_SCREENSHOTS) {
      throw new Error("每个投稿最多上传 5 张截图。");
    }

    files.forEach((file) => {
      if (!file.type.startsWith("image/") && !imageExtensions.test(file.name || "")) {
        throw new Error("截图只能上传图片文件。");
      }

      if (file.size > MAX_SCREENSHOT_SIZE) {
        throw new Error("每张截图不能超过 5 MB。");
      }
    });

    return files;
  }

  function imageContentType(file) {
    if (file.type?.startsWith("image/")) {
      return file.type;
    }

    const extension = String(file.name || "").split(".").pop()?.toLowerCase();
    return {
      avif: "image/avif",
      bmp: "image/bmp",
      gif: "image/gif",
      jpeg: "image/jpeg",
      jpg: "image/jpeg",
      png: "image/png",
      webp: "image/webp"
    }[extension] || "application/octet-stream";
  }

  function validatePackageFields(fields) {
    const required = [
      ["title", "预设包标题"],
      ["authorName", "作者名"],
      ["version", "版本号"]
    ];

    required.forEach(([key, label]) => {
      if (!normalizeText(fields[key])) {
        throw new Error(`请填写${label}。`);
      }
    });

  }

  function safeExtension(file, fallback) {
    const match = String(file?.name || "").match(/\.([a-z0-9]{1,8})$/i);
    return match ? `.${match[1].toLowerCase()}` : fallback;
  }

  async function removeFiles(supabase, paths, strict = false) {
    const objects = paths
      .map((item) => ({ bucket: item.bucket, path: item.path }))
      .filter((item) => item.path);

    if (!objects.length) {
      return;
    }

    const grouped = objects.reduce((result, item) => {
      result[item.bucket] = result[item.bucket] || [];
      result[item.bucket].push(item.path);
      return result;
    }, {});

    await Promise.all(Object.entries(grouped).map(async ([bucket, bucketPaths]) => {
      try {
        await supabase.storage.from(bucket).remove(bucketPaths);
      } catch (error) {
        if (strict) {
          throw error;
        }
      }
    }));
  }

  async function createPresetPackage(supabase, options) {
    const {
      source,
      status,
      userId,
      fields,
      parsed,
      jsonFile,
      screenshots
    } = options;

    validatePackageFields(fields);

    if (!userId) {
      throw new Error("请先登录。");
    }

    if (!parsed || !parsed.presetCount) {
      throw new Error("请先选择并解析预设文件。");
    }

    const screenshotFiles = validateScreenshots(screenshots);
    const packageId = crypto.randomUUID();
    const jsonPath = `${packageId}/preset.json`;
    const screenshotPaths = screenshotFiles.map((file, index) => (
      `${packageId}/screenshot-${index + 1}${safeExtension(file, ".png")}`
    ));
    const uploadedFiles = [];

    const payload = {
      id: packageId,
      owner_id: userId,
      source,
      status,
      title: normalizeText(fields.title),
      author_name: normalizeText(fields.authorName),
      game: "",
      version: normalizeText(fields.version),
      pa_version_range: parsed.paVersionRange,
      scope_keyboard: parsed.scopes.includes("keyboard"),
      scope_gamepad: parsed.scopes.includes("gamepad"),
      description: normalizeText(fields.description),
      json_path: jsonPath,
      json_size: jsonFile.size,
      screenshot_paths: screenshotPaths,
      preset_count: parsed.presetCount
    };

    const insertResult = await supabase.from("preset_packages").insert(payload);
    if (insertResult.error) {
      throw new Error(errorMessage(insertResult.error));
    }

    try {
      const jsonUpload = await supabase.storage
        .from(PRESET_FILE_BUCKET)
        .upload(jsonPath, jsonFile, {
          cacheControl: "3600",
          contentType: "application/json",
          upsert: false
        });

      if (jsonUpload.error) {
        throw new Error(errorMessage(jsonUpload.error));
      }
      uploadedFiles.push({ bucket: PRESET_FILE_BUCKET, path: jsonPath });

      for (let index = 0; index < screenshotFiles.length; index += 1) {
        const file = screenshotFiles[index];
        const path = screenshotPaths[index];
        const uploadResult = await supabase.storage
          .from(SCREENSHOT_BUCKET)
          .upload(path, file, {
            cacheControl: "3600",
            contentType: imageContentType(file),
            upsert: false
          });

        if (uploadResult.error) {
          throw new Error(errorMessage(uploadResult.error));
        }
        uploadedFiles.push({ bucket: SCREENSHOT_BUCKET, path });
      }

      const itemResult = await supabase.from("preset_items").insert(
        parsed.items.map((item) => ({
          package_id: packageId,
          scope: item.scope,
          name: item.name,
          display_name: item.displayName,
          sort_order: item.sortOrder
        }))
      );

      if (itemResult.error) {
        throw new Error(errorMessage(itemResult.error));
      }

      return { packageId };
    } catch (error) {
      await removeFiles(supabase, uploadedFiles);
      await supabase.from("preset_packages").delete().eq("id", packageId);
      throw error;
    }
  }

  async function hideOwnPresetPackage(supabase, packageId) {
    const result = await supabase.rpc("hide_own_preset_package", {
      p_package_id: packageId
    });

    if (result.error) {
      throw new Error(errorMessage(result.error));
    }
  }

  async function setPresetPackageVisibility(supabase, packageId, isHidden, userId) {
    const result = await supabase
      .from("preset_packages")
      .update({
        is_hidden: Boolean(isHidden),
        hidden_at: isHidden ? new Date().toISOString() : null,
        hidden_by: isHidden ? userId : null,
        updated_at: new Date().toISOString()
      })
      .eq("id", packageId);

    if (result.error) {
      throw new Error(errorMessage(result.error));
    }
  }

  async function deletePresetPackage(supabase, item) {
    if (!item?.id) {
      throw new Error("预设记录不存在。");
    }

    await removeFiles(supabase, [
      { bucket: PRESET_FILE_BUCKET, path: item.json_path },
      ...(item.screenshot_paths || []).map((path) => ({
        bucket: SCREENSHOT_BUCKET,
        path
      }))
    ], true);

    const result = await supabase
      .from("preset_packages")
      .delete()
      .eq("id", item.id);

    if (result.error) {
      throw new Error(errorMessage(result.error));
    }
  }

  async function fetchApprovedPackages(supabase, source) {
    const result = await supabase
      .from("preset_packages")
      .select(`
        id,
        owner_id,
        source,
        title,
        author_name,
        game,
        version,
        pa_version_range,
        scope_keyboard,
        scope_gamepad,
        description,
        json_path,
        screenshot_paths,
        preset_count,
        is_hidden,
        created_at,
        preset_items(id, scope, name, display_name, sort_order)
      `)
      .eq("source", source)
      .eq("status", "approved")
      .eq("is_hidden", false)
      .order("created_at", { ascending: false });

    if (result.error) {
      throw new Error(errorMessage(result.error));
    }

    return result.data || [];
  }

  async function fetchOwnPackages(supabase, userId) {
    const result = await supabase
      .from("preset_packages")
      .select(`
        id,
        source,
        title,
        status,
        rejection_reason,
        is_hidden,
        hidden_at,
        created_at,
        reviewed_at,
        preset_count,
        screenshot_paths
      `)
      .eq("owner_id", userId)
      .order("created_at", { ascending: false });

    if (result.error) {
      throw new Error(errorMessage(result.error));
    }

    return result.data || [];
  }

  async function fetchOwnPackagePage(supabase, userId, options) {
    const {
      status = "",
      query = "",
      page = 1,
      pageSize = 10
    } = options || {};

    const safePage = Math.max(1, Number(page) || 1);
    const safePageSize = Math.min(50, Math.max(1, Number(pageSize) || 10));
    const from = (safePage - 1) * safePageSize;
    const to = from + safePageSize - 1;

    let request = supabase
      .from("preset_packages")
      .select(`
        id,
        source,
        title,
        author_name,
        game,
        version,
        pa_version_range,
        scope_keyboard,
        scope_gamepad,
        description,
        status,
        rejection_reason,
        json_path,
        json_size,
        screenshot_paths,
        preset_count,
        is_hidden,
        created_at,
        updated_at,
        reviewed_at
      `, { count: "exact" })
      .eq("owner_id", userId)
      .eq("is_hidden", false)
      .order("updated_at", { ascending: false })
      .range(from, to);

    if (status) {
      request = request.eq("status", status);
    }

    const keyword = String(query || "").trim().replace(/[%_]/g, "");
    if (keyword) {
      request = request.ilike("title", `%${keyword}%`);
    }

    const result = await request;
    if (result.error) {
      throw new Error(errorMessage(result.error));
    }

    return {
      items: result.data || [],
      total: Number(result.count) || 0
    };
  }

  async function fetchOwnPackageDetail(supabase, userId, packageId) {
    const result = await supabase
      .from("preset_packages")
      .select(`
        id,
        owner_id,
        source,
        title,
        author_name,
        game,
        version,
        pa_version_range,
        scope_keyboard,
        scope_gamepad,
        description,
        status,
        rejection_reason,
        json_path,
        json_size,
        screenshot_paths,
        preset_count,
        is_hidden,
        created_at,
        reviewed_at,
        preset_items(id, scope, name, display_name, sort_order)
      `)
      .eq("id", packageId)
      .eq("owner_id", userId)
      .maybeSingle();

    if (result.error) {
      throw new Error(errorMessage(result.error));
    }

    return result.data || null;
  }

  async function fetchOwnSubmissionStats(supabase, userId) {
    const buildQuery = (status) => {
      let request = supabase
        .from("preset_packages")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", userId)
        .eq("is_hidden", false);

      if (status) {
        request = request.eq("status", status);
      }

      return request;
    };

    const [all, pending, approved, rejected] = await Promise.all([
      buildQuery(""),
      buildQuery("pending"),
      buildQuery("approved"),
      buildQuery("rejected")
    ]);

    const results = [all, pending, approved, rejected];
    const failed = results.find((result) => result.error);
    if (failed) {
      throw new Error(errorMessage(failed.error));
    }

    return {
      all: Number(all.count) || 0,
      pending: Number(pending.count) || 0,
      approved: Number(approved.count) || 0,
      rejected: Number(rejected.count) || 0
    };
  }

  async function fetchUnseenReviewResults(supabase, userId, seenAt) {
    let request = supabase
      .from("preset_packages")
      .select("id, title, status, reviewed_at")
      .eq("owner_id", userId)
      .eq("is_hidden", false)
      .in("status", ["approved", "rejected"])
      .order("reviewed_at", { ascending: false })
      .limit(200);

    if (seenAt) {
      request = request.gt("reviewed_at", seenAt);
    }

    const result = await request;
    if (result.error) {
      throw new Error(errorMessage(result.error));
    }

    return result.data || [];
  }

  async function resubmitOwnPresetPackage(supabase, options) {
    const {
      packageId,
      fields,
      presetContent,
      parsed,
      current,
      keepScreenshotPaths,
      screenshots
    } = options;

    if (!packageId) {
      throw new Error("预设记录不存在。");
    }
    if (!presetContent) {
      throw new Error("预设 JSON 内容不能为空。");
    }
    if (!parsed || !parsed.presetCount) {
      throw new Error("预设文件中没有可用的预设。");
    }

    validatePackageFields(fields);

    const newScreenshots = validateScreenshots(screenshots);
    const keptScreenshots = [...new Set((keepScreenshotPaths || []).filter(Boolean))];
    if (keptScreenshots.length + newScreenshots.length > MAX_SCREENSHOTS) {
      throw new Error(`每个预设最多保留 ${MAX_SCREENSHOTS} 张截图。`);
    }

    const blob = new Blob([presetContent], { type: "application/json" });
    if (blob.size > MAX_JSON_SIZE) {
      throw new Error("预设 JSON 文件不能超过 5 MB。");
    }

    const uploadedFiles = [];
    const removedFiles = [];
    let jsonPath = "";
    let jsonSize = blob.size;

    try {
      jsonPath = `${packageId}/preset-${Date.now()}.json`;
      const jsonUpload = await supabase.storage
        .from(PRESET_FILE_BUCKET)
        .upload(jsonPath, blob, {
          cacheControl: "3600",
          contentType: "application/json",
          upsert: false
        });

      if (jsonUpload.error) {
        throw new Error(errorMessage(jsonUpload.error));
      }
      uploadedFiles.push({ bucket: PRESET_FILE_BUCKET, path: jsonPath });

      if (current?.json_path && current.json_path !== jsonPath) {
        removedFiles.push({ bucket: PRESET_FILE_BUCKET, path: current.json_path });
      }

      const addedScreenshotPaths = [];
      for (let index = 0; index < newScreenshots.length; index += 1) {
        const file = newScreenshots[index];
        const path = `${packageId}/screenshot-${Date.now()}-${index + 1}${safeExtension(file, ".png")}`;
        const uploadResult = await supabase.storage
          .from(SCREENSHOT_BUCKET)
          .upload(path, file, {
            cacheControl: "3600",
            contentType: imageContentType(file),
            upsert: false
          });

        if (uploadResult.error) {
          throw new Error(errorMessage(uploadResult.error));
        }

        uploadedFiles.push({ bucket: SCREENSHOT_BUCKET, path });
        addedScreenshotPaths.push(path);
      }

      const screenshotPaths = [...keptScreenshots, ...addedScreenshotPaths];
      const keptSet = new Set(keptScreenshots);
      (current?.screenshot_paths || []).forEach((path) => {
        if (path && !keptSet.has(path)) {
          removedFiles.push({ bucket: SCREENSHOT_BUCKET, path });
        }
      });

      const rpcResult = await supabase.rpc("resubmit_own_preset_package", {
        p_package_id: packageId,
        p_title: normalizeText(fields.title),
        p_game: normalizeText(fields.game),
        p_version: normalizeText(fields.version),
        p_description: normalizeText(fields.description),
        p_json_path: jsonPath,
        p_json_size: jsonSize,
        p_screenshot_paths: screenshotPaths,
        p_pa_version_range: parsed.paVersionRange,
        p_scope_keyboard: parsed.scopes.includes("keyboard"),
        p_scope_gamepad: parsed.scopes.includes("gamepad"),
        p_preset_count: parsed.presetCount,
        p_items: parsed.items.map((item) => ({
          scope: item.scope,
          name: item.name,
          display_name: item.displayName,
          sort_order: item.sortOrder
        }))
      });

      if (rpcResult.error) {
        throw new Error(errorMessage(rpcResult.error));
      }

      await removeFiles(supabase, removedFiles, false);
      return { packageId, jsonPath };
    } catch (error) {
      await removeFiles(supabase, uploadedFiles, false);
      throw error;
    }
  }

  async function fetchReviewPackages(supabase, status) {
    let query = supabase
      .from("preset_packages")
      .select(`
        id,
        owner_id,
        source,
        title,
        author_name,
        game,
        version,
        pa_version_range,
        scope_keyboard,
        scope_gamepad,
        description,
        status,
        rejection_reason,
        json_path,
        json_size,
        screenshot_paths,
        preset_count,
        is_hidden,
        hidden_at,
        hidden_by,
        created_at,
        reviewed_at,
        preset_items(id, scope, name, display_name, sort_order)
      `)
      .eq("source", "community");

    query = status === "hidden"
      ? query.eq("is_hidden", true)
      : query.eq("status", status).eq("is_hidden", false);

    const result = await query.order("created_at", { ascending: true });

    if (result.error) {
      throw new Error(errorMessage(result.error));
    }

    return result.data || [];
  }

  async function fetchAllPackages(supabase) {
    const result = await supabase
      .from("preset_packages")
      .select(`
        id,
        owner_id,
        source,
        title,
        author_name,
        game,
        version,
        pa_version_range,
        scope_keyboard,
        scope_gamepad,
        description,
        status,
        rejection_reason,
        json_path,
        json_size,
        screenshot_paths,
        preset_count,
        is_hidden,
        hidden_at,
        hidden_by,
        created_at,
        reviewed_at,
        preset_items(id, scope, name, display_name, sort_order)
      `)
      .order("created_at", { ascending: false });

    if (result.error) {
      throw new Error(errorMessage(result.error));
    }

    return result.data || [];
  }

  async function updatePresetPackage(supabase, options) {
    const {
      packageId,
      fields,
      presetContent,
      parsed,
      current,
      keepScreenshotPaths,
      screenshots
    } = options;

    if (!packageId) {
      throw new Error("预设记录不存在。");
    }

    validatePackageFields(fields);

    const newScreenshots = validateScreenshots(screenshots);
    const keptScreenshots = [...new Set((keepScreenshotPaths || []).filter(Boolean))];
    if (keptScreenshots.length + newScreenshots.length > MAX_SCREENSHOTS) {
      throw new Error(`每个预设最多保留 ${MAX_SCREENSHOTS} 张截图。`);
    }

    const uploadedFiles = [];
    const removedFiles = [];
    const now = new Date().toISOString();
    let jsonPath = current?.json_path || "";
    let jsonSize = null;
    let packageUpdated = false;

    try {
      if (presetContent != null) {
        const blob = new Blob([presetContent], { type: "application/json" });
        if (blob.size > MAX_JSON_SIZE) {
          throw new Error("预设 JSON 文件不能超过 5 MB。");
        }

        const nextJsonPath = `${packageId}/preset-${Date.now()}.json`;
        const jsonUpload = await supabase.storage
          .from(PRESET_FILE_BUCKET)
          .upload(nextJsonPath, blob, {
            cacheControl: "3600",
            contentType: "application/json",
            upsert: false
          });

        if (jsonUpload.error) {
          throw new Error(errorMessage(jsonUpload.error));
        }

        uploadedFiles.push({ bucket: PRESET_FILE_BUCKET, path: nextJsonPath });
        if (jsonPath && jsonPath !== nextJsonPath) {
          removedFiles.push({ bucket: PRESET_FILE_BUCKET, path: jsonPath });
        }
        jsonPath = nextJsonPath;
        jsonSize = blob.size;
      }

      const addedScreenshotPaths = [];
      for (let index = 0; index < newScreenshots.length; index += 1) {
        const file = newScreenshots[index];
        const path = `${packageId}/screenshot-${Date.now()}-${index + 1}${safeExtension(file, ".png")}`;
        const uploadResult = await supabase.storage
          .from(SCREENSHOT_BUCKET)
          .upload(path, file, {
            cacheControl: "3600",
            contentType: imageContentType(file),
            upsert: false
          });

        if (uploadResult.error) {
          throw new Error(errorMessage(uploadResult.error));
        }

        uploadedFiles.push({ bucket: SCREENSHOT_BUCKET, path });
        addedScreenshotPaths.push(path);
      }

      const screenshotPaths = [...keptScreenshots, ...addedScreenshotPaths];
      const keptSet = new Set(keptScreenshots);
      (current?.screenshot_paths || []).forEach((path) => {
        if (path && !keptSet.has(path)) {
          removedFiles.push({ bucket: SCREENSHOT_BUCKET, path });
        }
      });

      const payload = {
        title: normalizeText(fields.title),
        author_name: normalizeText(fields.authorName),
        game: normalizeText(fields.game),
        version: normalizeText(fields.version),
        description: normalizeText(fields.description),
        status: fields.status,
        is_hidden: Boolean(fields.isHidden),
        hidden_at: fields.isHidden ? now : null,
        hidden_by: fields.isHidden ? (fields.userId || null) : null,
        rejection_reason: fields.status === "rejected" ? normalizeText(fields.rejectionReason) : null,
        screenshot_paths: screenshotPaths,
        updated_at: now
      };

      if (fields.status === "pending") {
        payload.reviewed_at = null;
        payload.reviewed_by = null;
      } else if (fields.status !== current?.status) {
        payload.reviewed_at = now;
        payload.reviewed_by = fields.userId || null;
      }

      if (jsonPath) {
        payload.json_path = jsonPath;
      }
      if (jsonSize != null) {
        payload.json_size = jsonSize;
      }
      if (parsed) {
        payload.pa_version_range = parsed.paVersionRange;
        payload.scope_keyboard = parsed.scopes.includes("keyboard");
        payload.scope_gamepad = parsed.scopes.includes("gamepad");
        payload.preset_count = parsed.presetCount;
      }

      const updateResult = await supabase
        .from("preset_packages")
        .update(payload)
        .eq("id", packageId)
        .select("id");

      if (updateResult.error) {
        throw new Error(errorMessage(updateResult.error));
      }
      if (!updateResult.data?.length) {
        throw new Error("没有找到要修改的预设，或当前账号没有修改权限。");
      }
      packageUpdated = true;

      if (parsed) {
        const deleteResult = await supabase
          .from("preset_items")
          .delete()
          .eq("package_id", packageId);

        if (deleteResult.error) {
          throw new Error(errorMessage(deleteResult.error));
        }

        const itemResult = await supabase.from("preset_items").insert(
          parsed.items.map((item) => ({
            package_id: packageId,
            scope: item.scope,
            name: item.name,
            display_name: item.displayName,
            sort_order: item.sortOrder
          }))
        );

        if (itemResult.error) {
          throw new Error(errorMessage(itemResult.error));
        }
      }

      await removeFiles(supabase, removedFiles, false);
      return { packageId, jsonPath };
    } catch (error) {
      if (!packageUpdated) {
        await removeFiles(supabase, uploadedFiles, false);
      }
      throw error;
    }
  }

  async function getSignedUrls(supabase, bucket, paths, expiresIn) {
    const uniquePaths = [...new Set((paths || []).filter(Boolean))];
    if (!uniquePaths.length) {
      return {};
    }

    const result = await supabase.storage
      .from(bucket)
      .createSignedUrls(uniquePaths, expiresIn || 3600);

    if (result.error) {
      throw new Error(errorMessage(result.error));
    }

    return (result.data || []).reduce((urls, item) => {
      if (item.signedUrl && item.path) {
        urls[item.path] = item.signedUrl;
      }
      return urls;
    }, {});
  }

  async function getDownloadUrl(supabase, path, filename) {
    const result = await supabase.storage
      .from(PRESET_FILE_BUCKET)
      .createSignedUrl(path, 600, { download: filename || true });

    if (result.error) {
      throw new Error(errorMessage(result.error));
    }

    return result.data?.signedUrl || "";
  }

  async function getPresetFileText(supabase, path) {
    const result = await supabase.storage.from(PRESET_FILE_BUCKET).download(path);

    if (result.error) {
      throw new Error(errorMessage(result.error));
    }

    return result.data.text();
  }

  async function getProfile(supabase, userId) {
    const result = await supabase
      .from("profiles")
      .select("id, github_login, display_name, avatar_url, is_admin")
      .eq("id", userId)
      .maybeSingle();

    if (result.error) {
      throw new Error(errorMessage(result.error));
    }

    return result.data;
  }

  async function markPresetReviewsSeen(supabase, seenAt) {
    const value = seenAt || new Date().toISOString();
    const result = await supabase.auth.updateUser({
      data: {
        preset_reviews_seen_at: value
      }
    });

    if (result.error) {
      throw new Error(errorMessage(result.error));
    }

    return value;
  }

  async function signInWithGitHub(supabase, returnPath) {
    const redirectTo = new URL(returnPath || window.location.pathname, window.location.href).href;
    const result = await supabase.auth.signInWithOAuth({
      provider: "github",
      options: { redirectTo }
    });

    if (result.error) {
      throw new Error(errorMessage(result.error));
    }
  }

  window.PA_PRESET_STORE = {
    PRESET_FILE_BUCKET,
    SCREENSHOT_BUCKET,
    MAX_JSON_SIZE,
    MAX_SCREENSHOT_SIZE,
    MAX_SCREENSHOTS,
    getClient,
    isConfigured,
    errorMessage,
    readPresetFile,
    fetchReleaseVersions,
    validateScreenshots,
    validatePackageFields,
    createPresetPackage,
    hideOwnPresetPackage,
    setPresetPackageVisibility,
    deletePresetPackage,
    fetchApprovedPackages,
    fetchOwnPackages,
    fetchOwnPackagePage,
    fetchOwnPackageDetail,
    fetchOwnSubmissionStats,
    fetchUnseenReviewResults,
    resubmitOwnPresetPackage,
    fetchReviewPackages,
    fetchAllPackages,
    updatePresetPackage,
    getSignedUrls,
    getDownloadUrl,
    getPresetFileText,
    getProfile,
    markPresetReviewsSeen,
    signInWithGitHub,
    validatePresetPayload
  };
})();
