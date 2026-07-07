import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { startScheduler } from "./jobs/scheduler.js";

const app = createApp();

app.listen(env.port, () => {
  console.log(`API listening on http://localhost:${env.port}`);
  startScheduler();
});
