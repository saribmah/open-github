import { Hono } from "hono";

const app = new Hono();

app.get("/health", (c) => {
  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

export default app;

// If running as a standalone server
if (import.meta.main) {
  const port = process.env.PORT || 3001;
  console.log(`Server running on http://localhost:${port}`);

  Bun.serve({
    port: 3001,
    fetch: app.fetch,
  });
}
