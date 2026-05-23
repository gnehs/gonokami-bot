import test from "node:test";
import assert from "node:assert/strict";
import {
  searchMemoryRecords,
  selectMemoryContext,
  type MemoryRecord,
} from "../utils/memory.ts";

const memories: MemoryRecord[] = [
  {
    id: "old-personal",
    content: "Alice 喜歡醬油拉麵",
    createdAt: "2026-01-01T00:00:00.000Z",
    userId: 1,
    userName: "Alice",
    chatId: 100,
    scope: "personal",
  },
  {
    id: "new-personal",
    content: "Alice 不吃蔥",
    createdAt: "2026-01-03T00:00:00.000Z",
    userId: 1,
    userName: "Alice",
    chatId: 100,
    scope: "personal",
  },
  {
    id: "other-personal",
    content: "Bob 喜歡辣",
    createdAt: "2026-01-04T00:00:00.000Z",
    userId: 2,
    userName: "Bob",
    chatId: 100,
    scope: "personal",
  },
  {
    id: "group",
    content: "群組週五常吃五之神",
    createdAt: "2026-01-02T00:00:00.000Z",
    userId: 2,
    userName: "Bob",
    chatId: 100,
    scope: "group",
  },
];

test("searchMemoryRecords filters by query and user-visible scope", () => {
  const result = searchMemoryRecords(memories, {
    query: "拉麵",
    userId: 1,
    includeGroup: true,
  });

  assert.deepEqual(
    result.map((memory) => memory.id),
    ["old-personal"]
  );
});

test("searchMemoryRecords includes group memories but hides other personal memories", () => {
  const result = searchMemoryRecords(memories, {
    userId: 1,
    includeGroup: true,
  });

  assert.deepEqual(
    result.map((memory) => memory.id),
    ["new-personal", "group", "old-personal"]
  );
});

test("selectMemoryContext returns newest relevant memories first", () => {
  const result = selectMemoryContext(memories, {
    query: "五之神",
    userId: 1,
  });

  assert.deepEqual(
    result.map((memory) => memory.id),
    ["group"]
  );
});

test("selectMemoryContext falls back to recent visible memories when query misses", () => {
  const result = selectMemoryContext(memories, {
    query: "完全不存在",
    userId: 1,
    limit: 2,
  });

  assert.deepEqual(
    result.map((memory) => memory.id),
    ["new-personal", "group"]
  );
});
