type ServerlessError = { message: string; type?: string; parameters?: { code?: string } };

interface TelegramWebApp {
  initData: string;
  colorScheme: "light" | "dark";
  ready(): void;
  expand(): void;
  isVersionAtLeast(version: string): boolean;
  setHeaderColor(color: string): void;
  setBackgroundColor(color: string): void;
  onEvent(event: "themeChanged", handler: () => void): void;
  BackButton: {
    show(): void;
    hide(): void;
    onClick(handler: () => void): void;
    offClick(handler: () => void): void;
  };
  Serverless: {
    call(name: string, input: object, callback: (err: ServerlessError | null, result?: unknown) => void): void;
  };
}

interface Window {
  Telegram?: { WebApp?: TelegramWebApp };
}
