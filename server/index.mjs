import { configuration } from "./config.mjs";
import { openDb } from "./db.mjs";
import { createApp } from "./app.mjs";
import { startBotWorker } from "./integrations.mjs";
import { existsSync } from "node:fs";
const config = configuration();
if (
  process.env.REQUIRE_EXISTING_DATABASE === "1" &&
  !existsSync(config.databasePath)
)
  throw new Error("Database must be restored before starting this deployment");
const db = openDb(config.databasePath),
  app = createApp(db, config),
  worker = startBotWorker(db, config);
const server = app.listen(config.port, config.host, () => {
  config.bankCardRenderOrigin = `http://127.0.0.1:${server.address().port}`;
  console.log(`Hiewly API ready on http://127.0.0.1:${config.port}`);
});
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    worker.stop();
    server.close(() => {
      db.close();
      process.exit(0);
    });
  });
