import { table, integer, text, json, boolean, index, primaryKey } from "sdk/db";

export const chats = table("chats", {
  id: integer("id").primaryKey(),
  title: text("title").notNull(),
  type: text("type").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const users = table("users", {
  id: integer("id").primaryKey(),
  firstName: text("first_name").notNull(),
  username: text("username"),
  updatedAt: integer("updated_at").notNull(),
});

// Cached getChatMember verdicts that gate every Mini App read of a chat.
export const memberships = table(
  "memberships",
  {
    chatId: integer("chat_id").notNull(),
    userId: integer("user_id").notNull(),
    isMember: boolean("is_member").notNull(),
    checkedAt: integer("checked_at").notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.chatId, t.userId] }),
    byUser: index("idx_memberships_user").on(t.userId),
  })
);

export const polls = table(
  "polls",
  {
    id: text("id").primaryKey(),
    chatId: integer("chat_id").notNull(),
    messageId: integer("message_id"),
    creatorId: integer("creator_id"),
    kind: text("kind").notNull(),
    question: text("question").notNull(),
    options: json("options").notNull(),
    isClosed: boolean("is_closed").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => ({
    byChat: index("idx_polls_chat_created").on(t.chatId, t.createdAt),
  })
);

export const pollVotes = table(
  "poll_votes",
  {
    pollId: text("poll_id").notNull(),
    userId: integer("user_id").notNull(),
    optionIds: json("option_ids").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.pollId, t.userId] }),
  })
);

// One row per number change on the shop's board, keyed by the board's own change time.
export const observations = table("observations", {
  observedAt: integer("observed_at").primaryKey(),
  number: integer("number").notNull(),
});

// Each session's service curve (a ModelDay), rebuilt from observations once the day is over. Keyed by
// sessionKey ("2026-11-06 16:33"); rows from before the board had two sessions are keyed by the bare date.
export const queueDays = table("queue_days", {
  date: text("date").primaryKey(),
  day: json("day").notNull(),
});

export const subscriptions = table(
  "subscriptions",
  {
    chatId: integer("chat_id").notNull(),
    userId: integer("user_id").notNull(),
    firstName: text("first_name").notNull(),
    targetNumber: integer("target_number").notNull(),
    messageId: integer("message_id").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.chatId, t.userId] }),
  })
);

export const kv = table("kv", {
  key: text("key").primaryKey(),
  value: json("value").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

// Telegram profile photos, smallest size, cached so each person is fetched at most weekly.
export const avatars = table("avatars", {
  userId: integer("user_id").primaryKey(),
  fileUniqueId: text("file_unique_id"),
  photo: text("photo"),
  checkedAt: integer("checked_at").notNull(),
});
