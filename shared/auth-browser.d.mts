export type AuthBrowser =
  "chrome-android" | "chrome-ios" | "samsung" | "safari" | "same";
export const browserNames: Record<AuthBrowser, string>;
export function detectBrowser(userAgent?: string): AuthBrowser;
export function browserReturnUrl(
  target: string,
  fallback: string,
  browser: AuthBrowser,
): string;
export function validCallback(
  provider: string,
  query: { state?: unknown; code?: unknown; error?: unknown },
): boolean;
