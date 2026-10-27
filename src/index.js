import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { pool } from "./db/pool.js";
import {
  startEventWorker,
  stopEventWorker,
} from "./services/eventWorker.js";

const app = await createApp();

const server = app.listen(env.port, "0.0.0.0", () => {
  console.log(
    `GoodSharing Push Notification Service running on port ${env.port}`,
  );

  void startEventWorker().catch((error) => {
    console.error("EVENT_WORKER_FATAL", {
      error: error?.message,
    });
    process.exitCode = 1;
    void shutdown("EVENT_WORKER_FATAL");
  });
});

let shutdownPromise;

async function shutdown(signal) {
  if (shutdownPromise) {
    return shutdownPromise;
  }

  shutdownPromise = (async () => {
    console.log("SHUTDOWN_STARTED", { signal });

    try {
      await Promise.all([
        new Promise((resolve) => {
          server.close((error) => {
            if (error) {
              console.error("HTTP_SERVER_CLOSE_FAILED", {
                error: error.message,
              });
            }
            resolve();
          });
        }),
        stopEventWorker(),
      ]);

      await pool.end();
      console.log("SHUTDOWN_COMPLETED", { signal });
    } catch (error) {
      process.exitCode = 1;
      console.error("SHUTDOWN_FAILED", {
        error: error?.message,
      });
    }
  })();

  return shutdownPromise;
}

process.once("SIGTERM", () => {
  void shutdown("SIGTERM");
});

process.once("SIGINT", () => {
  void shutdown("SIGINT");
});
