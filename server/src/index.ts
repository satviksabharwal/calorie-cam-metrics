import { config } from "./config.js";
import { createApp } from "./app.js";
import { startCleanupJob } from "./jobs/cleanup.job.js";

const app = createApp();

app.listen(config.PORT, () => {
  console.log(`CalorieCam API listening on :${config.PORT}`);
  startCleanupJob();
});
