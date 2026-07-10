const DEFAULT_GROUP_NAME = "未分组";
const KNOWN_TITLE_SUFFIXES = new Set([
  "github",
  "gitlab",
  "openai",
  "google",
  "google docs",
  "stack overflow",
  "youtube",
  "mdn web docs",
  "microsoft learn",
  "notion",
  "figma",
  "reddit",
  "x",
  "twitter",
  "jira",
  "confluence",
  "npm"
]);

export function createEmptyData() {
  return { version: 1, groups: [] };
}

export function normalizeData(input) {
  if (!input || typeof input !== "object" || !Array.isArray(input.groups)) {
    return createEmptyData();
  }

  return {
    version: Number.isInteger(input.version) ? input.version : 1,
    groups: input.groups
      .map(normalizeGroup)
      .filter((group) => group.name && Array.isArray(group.pages))
  };
}

export function cleanPageTitle(title, fallbackUrl = "") {
  const original = String(title || "").trim();
  const fallback = titleFromUrl(fallbackUrl);
  if (!original) return fallback;

  const separators = [" - ", " | ", " — ", " – "];
  for (const separator of separators) {
    const index = original.lastIndexOf(separator);
    if (index <= 0) continue;

    const prefix = original.slice(0, index).trim();
    const suffix = original.slice(index + separator.length).trim().toLowerCase();
    if (prefix.length >= 2 && KNOWN_TITLE_SUFFIXES.has(suffix)) {
      return prefix;
    }
  }

  return original.length >= 2 ? original : fallback;
}

export function createPageDraft(tab) {
  const url = normalizeUrl(tab?.url || "");
  return {
    title: cleanPageTitle(tab?.title || "", url),
    url,
    domain: domainFromUrl(url)
  };
}

export function addPageToGroup(data, request) {
  const source = normalizeData(data);
  const url = normalizeUrl(request?.url || "");
  if (!url) {
    return {
      status: "error",
      message: "页面地址无效",
      data: source
    };
  }

  const duplicate = findPageByUrl(source, url);
  if (duplicate) {
    return {
      status: "duplicate",
      existingGroupId: duplicate.group.id,
      existingGroupName: duplicate.group.name,
      page: duplicate.page,
      data: source
    };
  }

  const now = new Date().toISOString();
  const groupName = String(request?.groupName || DEFAULT_GROUP_NAME).trim() || DEFAULT_GROUP_NAME;
  const pageTitle = String(request?.pageTitle || "").trim() || cleanPageTitle("", url);
  const groups = source.groups.map(cloneGroup);
  let group = groups.find((item) => item.name.toLowerCase() === groupName.toLowerCase());

  if (!group) {
    group = {
      id: createId("group"),
      name: groupName,
      createdAt: now,
      updatedAt: now,
      pages: [],
      children: []
    };
    groups.push(group);
  }

  const page = {
    id: createId("page"),
    title: pageTitle,
    url,
    domain: domainFromUrl(url),
    createdAt: now,
    updatedAt: now,
    tags: []
  };
  group.pages.push(page);
  group.updatedAt = now;

  return {
    status: "saved",
    group,
    page,
    data: { version: source.version, groups }
  };
}

export function searchTree(data, query) {
  const source = normalizeData(data);
  const value = String(query || "").trim().toLowerCase();
  if (!value) return source.groups.map(cloneGroup);

  return source.groups.reduce((results, group) => {
    const groupMatches = group.name.toLowerCase().includes(value);
    const pages = groupMatches
      ? group.pages.map(clonePage)
      : group.pages.filter((page) => pageMatches(page, value)).map(clonePage);

    if (groupMatches || pages.length > 0) {
      results.push({ ...cloneGroup(group), pages });
    }
    return results;
  }, []);
}

export function renameGroup(data, groupId, name) {
  const source = normalizeData(data);
  const nextName = String(name || "").trim();
  if (!nextName) return source;
  const now = new Date().toISOString();

  return {
    ...source,
    groups: source.groups.map((group) =>
      group.id === groupId ? { ...cloneGroup(group), name: nextName, updatedAt: now } : cloneGroup(group)
    )
  };
}

export function deleteGroup(data, groupId) {
  const source = normalizeData(data);
  return {
    ...source,
    groups: source.groups.filter((group) => group.id !== groupId).map(cloneGroup)
  };
}

export function renamePage(data, pageId, title) {
  const source = normalizeData(data);
  const nextTitle = String(title || "").trim();
  if (!nextTitle) return source;
  const now = new Date().toISOString();

  return {
    ...source,
    groups: source.groups.map((group) => {
      const pages = group.pages.map((page) =>
        page.id === pageId ? { ...clonePage(page), title: nextTitle, updatedAt: now } : clonePage(page)
      );
      const changed = pages.some((page, index) => page !== group.pages[index]);
      return changed ? { ...cloneGroup(group), pages, updatedAt: now } : { ...cloneGroup(group), pages };
    })
  };
}

export function deletePage(data, pageId) {
  const source = normalizeData(data);
  const now = new Date().toISOString();

  return {
    ...source,
    groups: source.groups.map((group) => {
      const pages = group.pages.filter((page) => page.id !== pageId).map(clonePage);
      return pages.length === group.pages.length
        ? { ...cloneGroup(group), pages }
        : { ...cloneGroup(group), pages, updatedAt: now };
    })
  };
}

function normalizeGroup(group) {
  if (!group || typeof group !== "object") return null;
  const now = new Date().toISOString();
  const name = String(group.name || "").trim();
  const pages = Array.isArray(group.pages)
    ? group.pages.map(normalizePage).filter(Boolean)
    : [];

  return {
    id: String(group.id || createId("group")),
    name,
    createdAt: String(group.createdAt || now),
    updatedAt: String(group.updatedAt || group.createdAt || now),
    pages,
    children: Array.isArray(group.children) ? group.children : []
  };
}

function normalizePage(page) {
  if (!page || typeof page !== "object") return null;
  const url = normalizeUrl(page.url || "");
  if (!url) return null;
  const now = new Date().toISOString();

  return {
    id: String(page.id || createId("page")),
    title: String(page.title || cleanPageTitle("", url)).trim(),
    url,
    domain: String(page.domain || domainFromUrl(url)),
    createdAt: String(page.createdAt || now),
    updatedAt: String(page.updatedAt || page.createdAt || now),
    tags: Array.isArray(page.tags) ? page.tags : []
  };
}

function cloneGroup(group) {
  return {
    ...group,
    pages: group.pages.map(clonePage),
    children: Array.isArray(group.children) ? [...group.children] : []
  };
}

function clonePage(page) {
  return {
    ...page,
    tags: Array.isArray(page.tags) ? [...page.tags] : []
  };
}

function pageMatches(page, query) {
  return [page.title, page.domain, page.url].some((field) =>
    String(field || "").toLowerCase().includes(query)
  );
}

function findPageByUrl(data, url) {
  for (const group of data.groups) {
    const page = group.pages.find((item) => item.url === url);
    if (page) return { group, page };
  }
  return null;
}

function normalizeUrl(url) {
  try {
    const parsed = new URL(String(url || ""));
    return parsed.href;
  } catch {
    return "";
  }
}

function domainFromUrl(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function titleFromUrl(url) {
  const domain = domainFromUrl(url);
  return domain || "未命名页面";
}

function createId(prefix) {
  const random = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`;
}
