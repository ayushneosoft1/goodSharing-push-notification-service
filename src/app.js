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
import { persistPostCreatedEvent } from "./services/eventPersistenceService.js";

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
      const result = await persistPostCreatedEvent(req.body);

      return res.status(202).json({
        accepted: true,
        ...result,
      });
    } catch (error) {
      const validationMessages = [
        "Event payload is required",
        "Invalid eventType",
        "eventId is required",
        "postId is required",
        "authorId is required",
        "categoryId is required",
        "title is required",
        "createdAt is required",
        "Invalid createdAt",
      ];

      const isValidationError = validationMessages.includes(error?.message);

      console.error("POST_CREATED_EVENT_PERSISTENCE_FAILED", {
        error: error?.message,
      });

      return res.status(isValidationError ? 400 : 500).json({
        error: isValidationError ? error.message : "Failed to persist event",
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
