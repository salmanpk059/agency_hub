import "dotenv/config";
import app from "./server";
import { createServer as createViteServer } from "vite";

const PORT = Number(process.env.PORT) || 3001;

async function startServer() {
  console.log("Starting server in development mode...");
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "spa",
    envDir: process.cwd(),
  });
  app.use(vite.middlewares);

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`AgencyHub active and listening on http://localhost:${PORT}`);
  });
}

startServer();
