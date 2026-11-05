export type User = { id: number; is_bot?: boolean; first_name: string; username?: string };

export type Chat = { id: number; type: string; title?: string; first_name?: string };

export type Message = {
  message_id: number;
  from?: User;
  chat: Chat;
  date: number;
  text?: string;
};

export type CallbackQuery = {
  id: string;
  from: User;
  message?: Message;
  data?: string;
};

export type Poll = {
  id: string;
  question: string;
  options: { text: string; voter_count: number }[];
  is_closed: boolean;
};

export type PollAnswer = { poll_id: string; user?: User; option_ids: number[] };

export type ChatMemberUpdated = { chat: Chat; from: User; new_chat_member: { status: string } };

export type ChatMember = { status: string; is_member?: boolean };

export function chatTitle(chat: Chat): string {
  return chat.title ?? chat.first_name ?? String(chat.id);
}

export function isMemberStatus(member: ChatMember): boolean {
  if (member.status === "restricted") return member.is_member === true;
  return member.status === "creator" || member.status === "administrator" || member.status === "member";
}

export function escapeHtml(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export function mention(userId: number, name: string): string {
  return `<a href="tg://user?id=${userId}">${escapeHtml(name)}</a>`;
}

/** "/number@gonokami_bot 1050" → { command: "number", args: ["1050"], botName: "gonokami_bot" } */
export function parseCommand(text: string | undefined) {
  const match = /^\/([a-z0-9_]+)(?:@([a-z0-9_]+))?(?:\s+([\s\S]*))?$/i.exec(text?.trim() ?? "");
  if (!match) return null;
  return {
    command: match[1].toLowerCase(),
    botName: match[2] ?? null,
    args: match[3]?.trim().split(/\s+/) ?? [],
  };
}
