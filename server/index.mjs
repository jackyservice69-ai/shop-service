import { configuration } from "./config.mjs";
import { openDb } from "./db.mjs";
import { createApp } from "./app.mjs";
import { startBotWorker } from "./integrations.mjs";
const config = configuration(),
  db = openDb(config.databasePath),
  app = createApp(db, config),
  worker = startBotWorker(db, config);
const server = app.listen(config.port, config.host, () =>
  console.log(`Hiewly API ready on http://127.0.0.1:${config.port}`),
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    worker.stop();
    server.close(() => {
      db.close();
      process.exit(0);
    });
  });
