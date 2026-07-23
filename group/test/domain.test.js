import test from "node:test";
import assert from "node:assert/strict";
import {
  addPageToGroup,
  cleanPageTitle,
  createEmptyData,
  createPageDraft,
  deletePage,
  getQuickAccessPages,
  incrementPageOpenCount,
  movePageToGroup,
  normalizeData,
  renameGroup,
  renamePage,
  reorderGroups,
  reorderPages,
  searchTree,
  setQuickAccessPinned
} from "../src/shared/domain.js";

test("cleanPageTitle removes common site suffixes", () => {
  assert.equal(cleanPageTitle("Issue 123 - GitHub", "https://github.com/a/b"), "Issue 123");
  assert.equal(cleanPageTitle("A Useful Page | OpenAI", "https://openai.com"), "A Useful Page");
});

test("normalizeData preserves extension fields and removes invalid shapes", () => {
  const normalized = normalizeData({
    version: 1,
    groups: [
      {
        id: "g1",
        name: "Research",
        pages: [
          {
            id: "p1",
            name: "Saved Docs",
            title: "Docs",
            url: "https://example.com/docs"
          },
          {
            id: "p2",
            title: "Legacy Label",
            url: "https://example.com/legacy"
          }
        ]
      },
      { name: "", pages: "bad" }
    ]
  });

  assert.equal(normalized.version, 1);
  assert.equal(normalized.groups.length, 1);
  assert.deepEqual(normalized.groups[0].children, []);
  assert.equal(normalized.groups[0].pages[0].name, "Saved Docs");
  assert.equal(normalized.groups[0].pages[0].title, "Docs");
  assert.equal(normalized.groups[0].pages[1].name, "Legacy Label");
  assert.equal(normalized.groups[0].pages[1].title, "Legacy Label");
  assert.deepEqual(normalized.groups[0].pages[0].tags, []);
  assert.equal(normalized.groups[0].pages[0].openCount, 0);
  assert.equal(normalized.groups[0].pages[0].quickAccessPinned, false);
  assert.equal(normalized.groups[0].pages[0].domain, "example.com");
});

test("addPageToGroup creates a missing group and page", () => {
  const result = addPageToGroup(createEmptyData(), {
    groupName: "设计调研",
    pageTitle: "OpenAI Docs",
    url: "https://platform.openai.com/docs"
  });

  assert.equal(result.status, "saved");
  assert.equal(result.data.groups[0].name, "设计调研");
  assert.equal(result.data.groups[0].pages[0].name, "OpenAI Docs");
  assert.equal(result.data.groups[0].pages[0].title, "OpenAI Docs");
  assert.equal(result.data.groups[0].pages[0].domain, "platform.openai.com");
});

test("addPageToGroup rejects a duplicate URL globally", () => {
  const first = addPageToGroup(createEmptyData(), {
    groupName: "A",
    pageTitle: "Docs",
    url: "https://example.com/docs"
  });
  const second = addPageToGroup(first.data, {
    groupName: "B",
    pageTitle: "Docs again",
    url: "https://example.com/docs"
  });

  assert.equal(second.status, "duplicate");
  assert.equal(second.existingGroupName, "A");
});

test("searchTree keeps page matches under their group", () => {
  const saved = addPageToGroup(createEmptyData(), {
    groupName: "Research",
    pageTitle: "OpenAI Platform Docs",
    url: "https://platform.openai.com/docs"
  }).data;
  const results = searchTree(saved, "platform");

  assert.equal(results.length, 1);
  assert.equal(results[0].pages.length, 1);
  assert.equal(results[0].pages[0].title, "OpenAI Platform Docs");
});

test("quick access ranks pinned pages before frequent pages", () => {
  const data = normalizeData({
    version: 1,
    groups: [
      {
        id: "g1",
        name: "Work",
        pages: [
          { id: "p1", title: "Docs", url: "https://example.com/docs", openCount: 2 },
          { id: "p2", title: "Pinned", url: "https://example.com/pinned", openCount: 1, quickAccessPinned: true },
          { id: "p3", title: "Frequent", url: "https://example.com/frequent", openCount: 5 },
          { id: "p4", title: "Never", url: "https://example.com/never" }
        ]
      }
    ]
  });

  const quickAccess = getQuickAccessPages(data, 3);

  assert.deepEqual(quickAccess.map((page) => page.id), ["p2", "p3", "p1"]);
  assert.equal(quickAccess[0].groupId, "g1");
  assert.equal(quickAccess[0].groupName, "Work");
});

test("open counts and quick access pin state update pages", () => {
  const data = normalizeData({
    version: 1,
    groups: [
      {
        id: "g1",
        name: "Work",
        pages: [{ id: "p1", title: "Docs", url: "https://example.com/docs", openCount: 2 }]
      }
    ]
  });

  const opened = incrementPageOpenCount(data, "p1", "2026-07-13T00:00:00.000Z");
  assert.equal(opened.groups[0].pages[0].openCount, 3);
  assert.equal(opened.groups[0].pages[0].lastOpenedAt, "2026-07-13T00:00:00.000Z");

  const pinned = setQuickAccessPinned(opened, "p1", true);
  assert.equal(pinned.groups[0].pages[0].quickAccessPinned, true);

  const unpinned = setQuickAccessPinned(pinned, "p1", false);
  assert.equal(unpinned.groups[0].pages[0].quickAccessPinned, false);
});

test("rename and delete helpers update contents", () => {
  const saved = addPageToGroup(createEmptyData(), {
    groupName: "Old",
    pageTitle: "Page",
    url: "https://example.com"
  }).data;
  const groupId = saved.groups[0].id;
  const pageId = saved.groups[0].pages[0].id;

  const renamedGroup = renameGroup(saved, groupId, "New");
  const renamedPage = renamePage(renamedGroup, pageId, "Better Page");
  const withoutPage = deletePage(renamedPage, pageId);

  assert.equal(withoutPage.groups[0].name, "New");
  assert.equal(renamedPage.groups[0].pages[0].name, "Better Page");
  assert.equal(renamedPage.groups[0].pages[0].title, "Page");
  assert.equal(withoutPage.groups[0].pages.length, 0);
});

test("reorder helpers update groups and pages without crossing page groups", () => {
  const data = normalizeData({
    version: 1,
    groups: [
      {
        id: "g1",
        name: "Work",
        pages: [
          { id: "p1", title: "Docs", url: "https://example.com/docs" },
          { id: "p2", title: "Runs", url: "https://example.com/runs" },
          { id: "p3", title: "Notes", url: "https://example.com/notes" }
        ]
      },
      {
        id: "g2",
        name: "Tools",
        pages: [{ id: "p4", title: "Figma", url: "https://figma.com" }]
      },
      { id: "g3", name: "Archive", pages: [] }
    ]
  });

  const reorderedGroups = reorderGroups(data, "g1", "g3", "after");
  assert.deepEqual(reorderedGroups.groups.map((group) => group.id), ["g2", "g3", "g1"]);

  const reorderedPages = reorderPages(data, "g1", "p1", "p3", "after");
  assert.deepEqual(reorderedPages.groups[0].pages.map((page) => page.id), ["p2", "p3", "p1"]);
  assert.deepEqual(reorderedPages.groups[1].pages.map((page) => page.id), ["p4"]);

  const crossGroupIgnored = reorderPages(data, "g1", "p1", "p4", "before");
  assert.deepEqual(crossGroupIgnored.groups[0].pages.map((page) => page.id), ["p1", "p2", "p3"]);
  assert.deepEqual(crossGroupIgnored.groups[1].pages.map((page) => page.id), ["p4"]);
});

test("movePageToGroup appends a page to the selected target group", () => {
  const data = normalizeData({
    version: 1,
    groups: [
      {
        id: "g1",
        name: "Work",
        pages: [
          { id: "p1", title: "Docs", url: "https://example.com/docs" },
          { id: "p2", title: "Runs", url: "https://example.com/runs" }
        ]
      },
      {
        id: "g2",
        name: "Tools",
        pages: [{ id: "p3", title: "Figma", url: "https://figma.com" }]
      }
    ]
  });

  const moved = movePageToGroup(data, "p2", "g2");
  assert.deepEqual(moved.groups[0].pages.map((page) => page.id), ["p1"]);
  assert.deepEqual(moved.groups[1].pages.map((page) => page.id), ["p3", "p2"]);
  assert.equal(moved.groups[1].pages[1].name, "Runs");

  const sameGroup = movePageToGroup(moved, "p2", "g2");
  assert.deepEqual(sameGroup.groups[1].pages.map((page) => page.id), ["p3", "p2"]);
});

test("createPageDraft falls back to cleaned tab title", () => {
  const draft = createPageDraft({
    title: "Example Article - GitHub",
    url: "https://github.com/example/article"
  });

  assert.equal(draft.title, "Example Article");
  assert.equal(draft.domain, "github.com");
});
