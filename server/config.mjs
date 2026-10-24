import "dotenv/config";
import { googleConfiguration } from "./google-config.mjs";
export function configuration() {
  const production = process.env.NODE_ENV === "production";
  const origin = process.env.APP_ORIGIN || "http://127.0.0.1:5174";
  const encryptionKey = process.env.SETTINGS_ENCRYPTION_KEY || "";
  if (!/^[0-9a-f]{64}$/i.test(encryptionKey))
    throw new Error(
      "SETTINGS_ENCRYPTION_KEY must be 32 random bytes in hex. Run npm run setup.",
    );
  if (production && !origin.startsWith("https://"))
    throw new Error("Production requires HTTPS APP_ORIGIN");
  return {
    production,
    host: process.env.HOST || "127.0.0.1",
    origin,
    encryptionKey,
    trustProxy: process.env.TRUST_PROXY === "1",
    port: Number(process.env.PORT || 3002),
    databasePath: process.env.DATABASE_PATH || "./data/hiewly.sqlite",
    google: googleConfiguration(origin),
    secrets: {
      easyslipApiKey: process.env.EASYSLIP_API_KEY || "",
      lineChannelSecret: process.env.LINE_CHANNEL_SECRET || "",
      lineChannelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || "",
      lineLoginChannelSecret: process.env.LINE_LOGIN_CHANNEL_SECRET || "",
      openaiApiKey: process.env.OPENAI_API_KEY || "",
    },
  };
}
