import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

import { pool } from "./pool.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const migrationsDir = path.join(__dirname, "../../migrations");

const migrationFiles = [
  "001_create_device_registrations.sql",
  "002_create_category_subscriptions.sql",
  "003_create_in_app_notifications.sql",
];

try {
  for (const migrationFile of migrationFiles) {
    const migrationPath = path.join(migrationsDir, migrationFile);
    const sql = await fs.readFile(migrationPath, "utf8");

    console.log(`Running migration: ${migrationFile}`);

    await pool.query(sql);

    console.log(`Migration completed: ${migrationFile}`);
  }

  console.log("All migrations completed successfully.");
} catch (error) {
  console.error("Migration failed");
  process.exitCode = 1;
} finally {
  await pool.end();
}
