import { serve } from "@hono/node-server";
import { getDb } from "./db/schema";
import app from "./index";

// Init DB at startup
getDb();

const port = parseInt(process.env.PORT ?? "3002");
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[PureRSS] API running on http://localhost:${info.port}`);
});
