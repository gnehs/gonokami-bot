export interface MemoryRecord {
  id: string;
  content: string;
  createdAt: Date | string;
  updatedAt?: Date | string;
  userName?: string;
  userId?: number;
  chatId: number;
  scope?: "personal" | "group";
}

export interface MemorySearchOptions {
  query?: string;
  userId?: number;
  includeGroup?: boolean;
  limit?: number;
}

function normalizeText(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function memoryTime(memory: MemoryRecord): number {
  const value = memory.updatedAt || memory.createdAt;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function matchesQuery(memory: MemoryRecord, query?: string): boolean {
  const normalizedQuery = normalizeText(query || "");
  if (!normalizedQuery) return true;

  const haystack = normalizeText(
    [memory.content, memory.userName, memory.scope].filter(Boolean).join(" ")
  );
  return normalizedQuery
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => haystack.includes(token));
}

function isVisibleToUser(memory: MemoryRecord, userId?: number): boolean {
  if (memory.scope === "group") return true;
  if (userId === undefined) return true;
  return memory.userId === userId;
}

export function searchMemoryRecords(
  memories: MemoryRecord[],
  options: MemorySearchOptions = {}
): MemoryRecord[] {
  const limit = options.limit ?? 15;
  return memories
    .filter((memory) => {
      if (!isVisibleToUser(memory, options.userId)) return false;
      if (!options.includeGroup && memory.scope === "group") return false;
      return matchesQuery(memory, options.query);
    })
    .sort((a, b) => memoryTime(b) - memoryTime(a))
    .slice(0, limit);
}

export function selectMemoryContext(
  memories: MemoryRecord[],
  options: MemorySearchOptions = {}
): MemoryRecord[] {
  const result = searchMemoryRecords(memories, {
    ...options,
    includeGroup: true,
    limit: options.limit ?? 5,
  });
  if (result.length > 0 || !options.query?.trim()) return result;

  return searchMemoryRecords(memories, {
    ...options,
    query: undefined,
    includeGroup: true,
    limit: options.limit ?? 5,
  });
}
