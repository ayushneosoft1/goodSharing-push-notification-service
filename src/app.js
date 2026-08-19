import express from "express";
import cors from "cors";
import { ApolloServer } from "@apollo/server";
import { buildSubgraphSchema } from "@apollo/subgraph";
import { expressMiddleware } from "@as-integrations/express5";

import { typeDefs } from "./graphql/schema.js";
import { resolvers } from "./graphql/resolvers.js";
import { checkDatabaseConnection } from "./db/pool.js";

export async function createApp() {
  const app = express();

  const schema = buildSubgraphSchema({
    typeDefs,
    resolvers,
  });

  const apolloServer = new ApolloServer({
    schema,
  });

  await apolloServer.start();

  app.use(cors());

  app.get("/health", async (_req, res) => {
    try {
      await checkDatabaseConnection();

      res.status(200).json({
        status: "ok",
      });
    } catch (error) {
      console.error("Health check failed:", error.message);

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

          const userId = user.userId;

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
