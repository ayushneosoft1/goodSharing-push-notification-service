import { createApp } from "./app.js";
import { env } from "./config/env.js";

const app = await createApp();

app.listen(env.port, "0.0.0.0", () => {
  console.log(
    `GoodSharing Push Notification Service running on port ${env.port}`,
  );
});
