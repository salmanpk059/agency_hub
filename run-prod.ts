import "dotenv/config";
import app from "./server";
import path from "path";
import express from "express";

const PORT = Number(process.env.PORT) || 3000;
const distPath = path.join(process.cwd(), "dist");
app.use(express.static(distPath));
app.get("*", (req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`AgencyHub active and listening on http://localhost:${PORT}`);
});
