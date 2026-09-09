import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// Prisma 7 no longer loads .env on its own, and ours lives at the workspace
// root rather than next to the schema.
config({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  // Prisma 7 keeps the connection URL out of schema.prisma. The CLI reads it
  // from here; the runtime client gets it through the pg adapter instead.
  datasource: {
    url: process.env.DATABASE_URL ?? "",
  },
});
