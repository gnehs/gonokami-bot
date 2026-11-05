// Types for the tgcloud runtime SDK, covering the surface this project uses.
// Reference: docs/tgcloud-sdk.md in a scaffolded tgcloud project.

declare module "sdk/db" {
  type Builder = any;
  export function table(name: string, columns: Record<string, Builder>, extras?: (t: any) => Record<string, Builder>): any;
  export function integer(name?: string, opts?: { mode?: "boolean" | "timestamp" | "timestamp_ms" }): Builder;
  export function text(name?: string, opts?: { mode?: "json" }): Builder;
  export function real(name?: string): Builder;
  export function boolean(name?: string): Builder;
  export function json(name?: string): Builder;
  export function index(name: string): Builder;
  export function uniqueIndex(name: string): Builder;
  export function primaryKey(config: { columns: any[] }): Builder;
  export function sql(strings: TemplateStringsArray, ...values: unknown[]): any;
  export function eq(a: any, b: unknown): any;
  export function ne(a: any, b: unknown): any;
  export function gt(a: any, b: unknown): any;
  export function gte(a: any, b: unknown): any;
  export function lt(a: any, b: unknown): any;
  export function lte(a: any, b: unknown): any;
  export function and(...conditions: any[]): any;
  export function inArray(a: any, values: unknown[]): any;
  export function asc(a: any): any;
  export function desc(a: any): any;
  const db: {
    select(projection?: Record<string, any>): any;
    insert(table: any): any;
    update(table: any): any;
    delete(table: any): any;
    $count(table: any, where?: any): Promise<number>;
    run(query: any, params?: Record<string, unknown>): Promise<{ rowsAffected: number; lastInsertRowid: number; rows: any[] }>;
    all<T = any>(query: any, params?: Record<string, unknown>): Promise<T[]>;
    get<T = any>(query: any, params?: Record<string, unknown>): Promise<T | null>;
  };
  export default db;
}

declare module "sdk" {
  export { default as db } from "sdk/db";
  export const api: Record<string, (params?: Record<string, unknown>) => Promise<any>>;
  export function fetch(
    url: string,
    init?: { method?: string; headers?: Record<string, string>; body?: unknown }
  ): Promise<{ ok: boolean; status: number; statusText: string; json(): Promise<any>; text(): Promise<string> }>;
  export class BotApiError extends Error {
    code: number;
    description: string;
    method: string;
    parameters?: Record<string, unknown>;
  }
  export class EndpointError extends Error {
    constructor(description: string, parameters?: Record<string, unknown>);
  }
}

declare var console: {
  log(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
};
