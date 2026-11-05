import "dotenv/config";
import { defineConfig } from "prisma/config";

// Migrations run as the database's owner, on the direct (non-pooled) connection when the host provides one.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || "",
  },
});
