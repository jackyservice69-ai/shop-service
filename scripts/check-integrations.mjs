import "dotenv/config";
const requests = [
  [
    "EasySlip banks",
    "https://api.easyslip.com/v2/banks",
    process.env.EASYSLIP_API_KEY,
  ],
  [
    "EasySlip accounts",
    "https://api.easyslip.com/v2/bank-accounts",
    process.env.EASYSLIP_API_KEY,
  ],
  [
    "LINE bot info",
    "https://api.line.me/v2/bot/info",
    process.env.LINE_CHANNEL_ACCESS_TOKEN,
  ],
];
for (const [name, url, key] of requests) {
  try {
    const r = await fetch(url, {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(15000),
      }),
      data = await r.json();
    console.log(
      JSON.stringify({
        service: name,
        status: r.status,
        success: data.success ?? r.ok,
        errorCode: data.error?.code,
        bankCount: name.includes("banks") ? data.data?.length : undefined,
        accountResponseShape: name.includes("accounts")
          ? Object.keys(data.data || {})
          : undefined,
        accountCount: name.includes("accounts")
          ? Array.isArray(data.data)
            ? data.data.length
            : data.data?.accounts?.length
          : undefined,
      }),
    );
  } catch (e) {
    console.log(JSON.stringify({ service: name, error: e.name }));
  }
}
