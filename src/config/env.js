import "dotenv/config";

const requiredEnv = [
  "PORT",
  "DATABASE_URL",
  "FIREBASE_PROJECT_ID",
  "FIREBASE_CLIENT_EMAIL",
  "FIREBASE_PRIVATE_KEY",
  "INTERNAL_EVENT_AUTH_TOKEN",
];

for (const key of requiredEnv) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

const databaseUrl = process.env.DATABASE_URL;
const databaseSsl = process.env.DATABASE_SSL !== "false";
const databaseHost = new URL(databaseUrl).hostname;
const localDatabaseHosts = ["localhost", "127.0.0.1", "::1", "[::1]"];

if (!databaseSsl && !localDatabaseHosts.includes(databaseHost)) {
  throw new Error("DATABASE_SSL=false is only allowed for localhost database connections");
}

export const env = {
  port: Number(process.env.PORT),
  databaseUrl,
  databaseSsl,

  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY,
  },

  internalEventAuthToken: process.env.INTERNAL_EVENT_AUTH_TOKEN,
};
