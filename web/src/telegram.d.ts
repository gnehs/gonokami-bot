type ServerlessError = { message: string; type?: string; parameters?: { code?: string } };

interface TelegramWebApp {
  initData: string;
  ready(): void;
  expand(): void;
  Serverless: {
    call(name: string, input: object, callback: (err: ServerlessError | null, result?: unknown) => void): void;
  };
}

interface Window {
  Telegram?: { WebApp?: TelegramWebApp };
}
