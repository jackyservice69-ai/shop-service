export const browserNames = {
  "chrome-android": "Chrome",
  samsung: "Samsung Internet",
  "chrome-ios": "Chrome",
  safari: "Safari",
  same: "เบราว์เซอร์เดิม",
};
export function detectBrowser(ua = "") {
  if (/SamsungBrowser/i.test(ua) && /Android/i.test(ua)) return "samsung";
  if (/\bLine\/|FBAN|FBAV|Instagram|; wv\)/i.test(ua)) return "same";
  if (/iPhone|iPad|iPod/i.test(ua) && /CriOS\//.test(ua)) return "chrome-ios";
  if (/Android/i.test(ua) && /Chrome\//.test(ua) && !/EdgA|OPR\//.test(ua))
    return "chrome-android";
  if (
    /Safari\//.test(ua) &&
    /Version\//.test(ua) &&
    !/Chrome|Chromium|Edg|OPR|FxiOS/.test(ua)
  )
    return "safari";
  return "same";
}
export function browserReturnUrl(target, fallback, browser) {
  const url = new URL(target),
    backup = new URL(fallback);
  if (
    !/^https?:$/.test(url.protocol) ||
    url.origin !== backup.origin ||
    url.username ||
    url.password ||
    url.hash ||
    backup.username ||
    backup.password ||
    !Object.hasOwn(browserNames, browser)
  )
    throw new Error("Invalid browser destination");
  if (browser === "chrome-ios")
    return url.href
      .replace(/^https:/, "googlechromes:")
      .replace(/^http:/, "googlechrome:");
  if (browser === "chrome-android" || browser === "samsung") {
    const packageName =
      browser === "samsung"
        ? "com.sec.android.app.sbrowser"
        : "com.android.chrome";
    return `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=${url.protocol.slice(0, -1)};package=${packageName};S.browser_fallback_url=${encodeURIComponent(backup.href)};end`;
  }
  // Safari has no documented website API for selecting it as the destination.
  // The recovery page also offers copying this URL into the original Safari tab.
  return url.href;
}
export function validCallback(provider, query) {
  const pattern =
    provider === "line" ? /^[a-f0-9]{64}$/ : /^[A-Za-z0-9_-]{43}$/;
  return (
    (provider === "line" || provider === "google") &&
    typeof query.state === "string" &&
    pattern.test(query.state) &&
    ((typeof query.code === "string" &&
      query.code.length > 0 &&
      query.code.length <= 4096 &&
      !query.error) ||
      (typeof query.error === "string" &&
        query.error.length > 0 &&
        query.error.length <= 200 &&
        !query.code))
  );
}
