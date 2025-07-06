import { createOpenAI } from "@ai-sdk/openai";
import { withoutTrailingSlash, loadApiKey } from "@ai-sdk/provider-utils";

export interface OpenWebUIProviderSettings {
  /**
   * Base URL for Open WebUI proxy (e.g. http://localhost:3000/api)
   */
  baseURL?: string;
  /**
   * Authentication token – can also be provided via OPENWEBUI_API_KEY env var
   */
  apiKey?: string;
  /**
   * Optional extra headers
   */
  headers?: Record<string, string>;
}

export function createOpenWebUIProvider(
  options: OpenWebUIProviderSettings = {}
) {
  const provider = createOpenAI({
    name: "openwebui", // will show up in usage.provider
    baseURL:
      withoutTrailingSlash(options.baseURL) ||
      withoutTrailingSlash(process.env.OPENWEBUI_BASE_URL) ||
      "http://localhost:3000/api",
    apiKey:
      options.apiKey ||
      loadApiKey({
        apiKey: undefined,
        environmentVariableName: "OPENWEBUI_API_KEY",
        description: "Open WebUI",
      }),
    headers: options.headers,
    compatibility: "strict", // strict OpenAI-compatible mode
  });

  return provider;
}

/**
 * Default provider instance that reads BASE_URL / API_KEY from environment variables
 */
export const openwebui = createOpenWebUIProvider();
