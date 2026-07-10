import test from "node:test";
import assert from "node:assert/strict";
import {
  addPageToGroup,
  cleanPageTitle,
  createEmptyData,
  createPageDraft,
  deletePage,
  normalizeData,
  renameGroup,
  renamePage,
  searchTree
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
            title: "Docs",
            url: "https://example.com/docs"
          }
        ]
      },
      { name: "", pages: "bad" }
    ]
  });

  assert.equal(normalized.version, 1);
  assert.equal(normalized.groups.length, 1);
  assert.deepEqual(normalized.groups[0].children, []);
  assert.deepEqual(normalized.groups[0].pages[0].tags, []);
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
  assert.equal(withoutPage.groups[0].pages.length, 0);
});

test("createPageDraft falls back to cleaned tab title", () => {
  const draft = createPageDraft({
    title: "Example Article - GitHub",
    url: "https://github.com/example/article"
  });

  assert.equal(draft.title, "Example Article");
  assert.equal(draft.domain, "github.com");
});
