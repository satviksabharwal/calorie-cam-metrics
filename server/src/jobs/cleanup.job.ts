import cron from "node-cron";
import { clearImagePaths, getExpiredImages } from "../services/meals.service.js";
import { removeImages } from "../services/storage.service.js";

const BATCH_SIZE = 200;

export async function runImageCleanup(): Promise<void> {
  let total = 0;
  try {
    // Loop until no expired images remain (batched).
    for (;;) {
      const expired = await getExpiredImages(BATCH_SIZE);
      if (expired.length === 0) break;
      const paths = expired.map((m) => m.image_path).filter((p): p is string => !!p);
      await removeImages(paths);
      await clearImagePaths(expired.map((m) => m.id));
      total += expired.length;
      if (expired.length < BATCH_SIZE) break;
    }
    if (total > 0) console.log(`Image cleanup: removed ${total} expired images`);
  } catch (err) {
    console.error("Image cleanup failed:", err);
  }
}

export function startCleanupJob(): void {
  // Daily at 00:05. node-cron skips missed ticks, so also run once on boot
  // to catch windows where the process was asleep or redeploying.
  cron.schedule("5 0 * * *", runImageCleanup);
  void runImageCleanup();
}
