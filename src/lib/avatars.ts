import { db, api } from "sdk";
import { inArray } from "sdk/db";
import { avatars } from "../schema.ts";
import type { Avatar } from "./api-types.ts";
import { toBase64 } from "./base64.ts";

const AVATAR_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type Cached = { userId: number; fileUniqueId: string | null; photo: string | null; checkedAt: number };
type PhotoSize = { file_id: string; file_unique_id: string; width: number };

/** Data URLs of each user's current profile photo, or null when they have none the bot may see. */
export async function avatarsFor(userIds: number[]): Promise<Avatar[]> {
  const cached: Cached[] = userIds.length
    ? await db.select().from(avatars).where(inArray(avatars.userId, userIds)).all()
    : [];
  const byUser = new Map(cached.map((row) => [row.userId, row]));
  const now = Date.now();

  const refreshed = await Promise.all(
    userIds.map(async (userId) => {
      const row = byUser.get(userId);
      if (row && now - row.checkedAt < AVATAR_TTL_MS) return row;
      try {
        const result = await api.getUserProfilePhotos({ user_id: userId, limit: 1 });
        const smallest: PhotoSize | undefined = result.photos[0]?.[0];
        const next: Cached = {
          userId,
          fileUniqueId: smallest?.file_unique_id ?? null,
          // An unchanged photo keeps its stored bytes; only a new one is downloaded.
          photo:
            !smallest ? null
            : smallest.file_unique_id === row?.fileUniqueId ? row.photo
            : `data:image/jpeg;base64,${toBase64(await api.getFileContent(smallest.file_id))}`,
          checkedAt: now,
        };
        await db
          .insert(avatars)
          .values(next)
          .onConflictDoUpdate({ target: avatars.userId, set: next });
        return next;
      } catch (error) {
        console.warn("avatar fetch failed", { userId, error: String(error) });
        return row ?? { userId, fileUniqueId: null, photo: null, checkedAt: now };
      }
    })
  );
  return refreshed.map(({ userId, photo }) => ({ userId, photo }));
}
