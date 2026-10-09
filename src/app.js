import express from "express";
import crypto from "crypto";
import cors from "cors";
import { ApolloServer } from "@apollo/server";
import { buildSubgraphSchema } from "@apollo/subgraph";
import { expressMiddleware } from "@as-integrations/express5";

import { typeDefs } from "./graphql/schema.js";
import { resolvers } from "./graphql/resolvers.js";
import { checkDatabaseConnection } from "./db/pool.js";

import { getFirebaseApp } from "./config/firebase.js";
import { env } from "./config/env.js";
import { processPostCreatedEvent } from "./services/postCreatedEventService.js";

export async function createApp() {
  getFirebaseApp();
  const app = express();

  const schema = buildSubgraphSchema({
    typeDefs,
    resolvers,
  });

  const apolloServer = new ApolloServer({
    schema,
    includeStacktraceInErrorResponses: false,
  });

  await apolloServer.start();

  app.use(cors());

  app.post("/internal/events/post-created", express.json(), async (req, res) => {
    const providedToken = req.headers["x-internal-event-token"];

    if (
      typeof providedToken !== "string" ||
      typeof env.internalEventAuthToken !== "string"
    ) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const provided = Buffer.from(providedToken);
    const expected = Buffer.from(env.internalEventAuthToken);

    if (
      provided.length !== expected.length ||
      !crypto.timingSafeEqual(provided, expected)
    ) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      const result = await processPostCreatedEvent(req.body);

      return res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error) {
      console.error("POST_CREATED_EVENT_REJECTED", {
        error: error?.message,
      });

      return res.status(400).json({
        error: error?.message || "Invalid event",
      });
    }
  });

  app.get("/health", async (_req, res) => {
    try {
      await checkDatabaseConnection();

      res.status(200).json({
        status: "ok",
      });
    } catch (error) {
      console.error("Health check failed");

      res.status(503).json({
        status: "unhealthy",
      });
    }
  });

  app.use(
    "/graphql",
    express.json(),
    expressMiddleware(apolloServer, {
      context: async ({ req }) => {
        const rawUser = req.headers["x-user"];

        // Safe diagnostic logs: do not log JWT or FCM token values
        console.log("GRAPHQL OPERATION:", req.body?.operationName);
        console.log("HAS X-USER:", Boolean(rawUser));
        console.log("X-USER TYPE:", typeof rawUser);

        if (!rawUser) {
          return {
            userId: null,
          };
        }

        if (typeof rawUser !== "string") {
          throw new Error("Invalid x-user header");
        }

        try {
          const user = JSON.parse(rawUser);

          if (!user || typeof user !== "object") {
            throw new Error("Invalid user context");
          }

          const userId = user.id;

          if (!userId || typeof userId !== "string") {
            throw new Error("Invalid user context");
          }

          return {
            userId,
          };
        } catch {
          throw new Error("Invalid x-user header");
        }
      },
    }),
  );

  return app;
}
