import { createMemoryStore } from "./memoryStore.mjs";

export async function createStore() {
  if (!process.env.DATABASE_URL) {
    if (process.env.ALLOW_MEMORY_STORE === "true") {
      console.warn("DATABASE_URL not found. ALLOW_MEMORY_STORE=true, so Magen3 API is using temporary in-memory storage.");
      return createMemoryStore();
    }

    throw new Error("DATABASE_URL is required. Magen3 no longer falls back to temporary or mock storage by default.");
  }

  try {
    const { createPostgresStore } = await import("./postgresStore.mjs");
    const store = await createPostgresStore();
    console.log("Magen3 API connected to PostgreSQL through Drizzle.");
    return store;
  } catch (error) {
    if (process.env.ALLOW_MEMORY_STORE === "true") {
      console.warn("Failed to connect to PostgreSQL. ALLOW_MEMORY_STORE=true, so Magen3 API is using temporary in-memory storage.");
      console.warn(error?.message || error);
      return createMemoryStore();
    }

    throw error;
  }
}
