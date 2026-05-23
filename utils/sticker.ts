import fs from "fs";

export interface StickerData {
  id: string; // Telegram sticker file_id
  emoji?: string; // 貼圖的 emoji
  setName?: string; // 貼圖包名稱
  userId: number; // 發送者的 user ID
  userName: string; // 發送者名稱
  chatId: number; // 聊天室 ID
  addedAt: string; // 新增時間
  usageCount: number; // 使用次數
  moodTags?: string[]; // 語意標籤，維持全域貼圖池但讓 AI 更會挑
}

const STICKERS_FILE = "./data/stickers.json";

// 確保 data 目錄存在
const dataDir = "./data";
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// 讀取貼圖資料
function readStickers(): StickerData[] {
  try {
    if (fs.existsSync(STICKERS_FILE)) {
      const data = fs.readFileSync(STICKERS_FILE, "utf8");
      return JSON.parse(data);
    }
    return [];
  } catch (error) {
    console.error("讀取貼圖資料時發生錯誤:", error);
    return [];
  }
}

// 寫入貼圖資料
function writeStickers(stickers: StickerData[]): boolean {
  try {
    fs.writeFileSync(STICKERS_FILE, JSON.stringify(stickers, null, 2));
    return true;
  } catch (error) {
    console.error("寫入貼圖資料時發生錯誤:", error);
    return false;
  }
}

const MOOD_KEYWORDS: Record<string, string[]> = {
  happy: ["happy", "開心", "高興", "爽", "讚", "好耶", "慶祝", "kira"],
  laugh: ["laugh", "lol", "笑", "笑死", "好笑", "哈哈", "www", "xdddd"],
  awkward: ["awkward", "尷尬", "尬", "乾", "呃", "無言"],
  angry: ["angry", "生氣", "氣", "怒", "森七七", "不爽", "火大"],
  sad: ["sad", "難過", "哭", "可憐", "委屈", "emo"],
  sleepy: ["sleepy", "睡", "睏", "累", "蓋被被", "zzz"],
  shocked: ["shocked", "震驚", "驚", "挖賽", "蛤", "怕"],
  love: ["love", "愛", "喜歡", "心", "可愛"],
  confused: ["confused", "困惑", "問號", "蛤", "不懂", "奇"],
};

const EMOJI_MOOD_HINTS: Record<string, string[]> = {
  "😀": ["happy"],
  "😄": ["happy", "laugh"],
  "😂": ["laugh"],
  "🤣": ["laugh"],
  "😅": ["awkward", "laugh"],
  "🙂": ["awkward"],
  "😡": ["angry"],
  "😠": ["angry"],
  "😭": ["sad"],
  "😢": ["sad"],
  "😴": ["sleepy"],
  "😪": ["sleepy"],
  "😱": ["shocked"],
  "😮": ["shocked"],
  "❤️": ["love"],
  "💕": ["love"],
  "🤔": ["confused"],
  "❓": ["confused"],
};

function normalizeTag(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function inferMoodTags(emoji?: string, setName?: string): string[] {
  const tags = new Set<string>();
  if (emoji && EMOJI_MOOD_HINTS[emoji]) {
    EMOJI_MOOD_HINTS[emoji].forEach((tag) => tags.add(tag));
  }

  const text = normalizeTag([emoji, setName].filter(Boolean).join(" "));
  for (const [tag, keywords] of Object.entries(MOOD_KEYWORDS)) {
    if (keywords.some((keyword) => text.includes(normalizeTag(keyword)))) {
      tags.add(tag);
    }
  }
  return Array.from(tags);
}

export function normalizeMoodQuery(query?: string): string[] {
  const normalized = normalizeTag(query || "");
  if (!normalized) return [];

  const tags = new Set<string>();
  for (const [tag, keywords] of Object.entries(MOOD_KEYWORDS)) {
    if (
      tag.includes(normalized) ||
      keywords.some((keyword) => normalized.includes(normalizeTag(keyword)))
    ) {
      tags.add(tag);
    }
  }
  if (tags.size === 0) tags.add(normalized);
  return Array.from(tags);
}

/**
 * 新增貼圖到資料庫
 */
export function addSticker(
  stickerId: string,
  emoji: string | undefined,
  setName: string | undefined,
  userId: number,
  userName: string,
  chatId: number
): boolean {
  try {
    const stickers = readStickers();

    // 檢查是否已經存在這個貼圖
    const existingSticker = stickers.find((s) => s.id === stickerId);
    if (existingSticker) {
      // 如果已存在，更新使用次數
      existingSticker.usageCount++;
      writeStickers(stickers);
      return false; // 表示沒有新增，只是更新
    }

    // 新增貼圖
    const newSticker: StickerData = {
      id: stickerId,
      emoji,
      setName,
      userId,
      userName,
      chatId,
      addedAt: new Date().toISOString(),
      usageCount: 1,
      moodTags: inferMoodTags(emoji, setName),
    };

    stickers.push(newSticker);
    writeStickers(stickers);
    return true; // 表示成功新增
  } catch (error) {
    console.error("新增貼圖時發生錯誤:", error);
    return false;
  }
}

/**
 * 取得所有貼圖
 */
export function getAllStickers(): StickerData[] {
  try {
    return readStickers();
  } catch (error) {
    console.error("取得貼圖列表時發生錯誤:", error);
    return [];
  }
}

/**
 * 取得隨機貼圖
 */
export function getRandomSticker(): StickerData | null {
  try {
    const stickers = readStickers();
    if (stickers.length === 0) return null;

    const randomIndex = Math.floor(Math.random() * stickers.length);
    return stickers[randomIndex];
  } catch (error) {
    console.error("取得隨機貼圖時發生錯誤:", error);
    return null;
  }
}

/**
 * 根據 emoji 搜尋貼圖
 */
export function getStickersByEmoji(emoji: string): StickerData[] {
  try {
    const stickers = readStickers();
    return stickers.filter((s) => s.emoji === emoji);
  } catch (error) {
    console.error("搜尋貼圖時發生錯誤:", error);
    return [];
  }
}

export function getStickersByMood(mood: string): StickerData[] {
  try {
    const stickers = readStickers();
    const tags = normalizeMoodQuery(mood);
    if (tags.length === 0) return [];

    return stickers.filter((sticker) => {
      const stickerTags = new Set([
        ...(sticker.moodTags || []),
        ...inferMoodTags(sticker.emoji, sticker.setName),
      ]);
      return tags.some((tag) => stickerTags.has(tag));
    });
  } catch (error) {
    console.error("搜尋語意貼圖時發生錯誤:", error);
    return [];
  }
}

export function incrementStickerUsage(stickerId: string): boolean {
  try {
    const stickers = readStickers();
    const sticker = stickers.find((s) => s.id === stickerId);
    if (!sticker) return false;
    sticker.usageCount++;
    writeStickers(stickers);
    return true;
  } catch (error) {
    console.error("更新貼圖使用次數時發生錯誤:", error);
    return false;
  }
}

/**
 * 取得最常使用的貼圖
 */
export function getPopularStickers(limit: number = 10): StickerData[] {
  try {
    const stickers = readStickers();
    return stickers.sort((a, b) => b.usageCount - a.usageCount).slice(0, limit);
  } catch (error) {
    console.error("取得熱門貼圖時發生錯誤:", error);
    return [];
  }
}

/**
 * 取得貼圖統計資訊
 */
export function getStickerStats(): {
  totalStickers: number;
  totalUsage: number;
  uniqueUsers: number;
  mostUsedSticker: StickerData | null;
} {
  try {
    const stickers = readStickers();

    if (stickers.length === 0) {
      return {
        totalStickers: 0,
        totalUsage: 0,
        uniqueUsers: 0,
        mostUsedSticker: null,
      };
    }

    const totalUsage = stickers.reduce((sum, s) => sum + s.usageCount, 0);
    const uniqueUsers = new Set(stickers.map((s) => s.userId)).size;
    const mostUsedSticker = stickers.reduce((prev, current) =>
      prev.usageCount > current.usageCount ? prev : current
    );

    return {
      totalStickers: stickers.length,
      totalUsage,
      uniqueUsers,
      mostUsedSticker,
    };
  } catch (error) {
    console.error("取得貼圖統計時發生錯誤:", error);
    return {
      totalStickers: 0,
      totalUsage: 0,
      uniqueUsers: 0,
      mostUsedSticker: null,
    };
  }
}

/**
 * 刪除貼圖
 */
export function removeSticker(stickerId: string): boolean {
  try {
    const stickers = readStickers();
    const index = stickers.findIndex((s) => s.id === stickerId);

    if (index === -1) return false;

    stickers.splice(index, 1);
    writeStickers(stickers);
    return true;
  } catch (error) {
    console.error("刪除貼圖時發生錯誤:", error);
    return false;
  }
}
