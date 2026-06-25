import { createMemoryStore } from "./memoryStore.mjs";

export async function createStore() {
  if (!process.env.DATABASE_URL) {
    console.warn("DATABASE_URL not found. Magen3 API is using in-memory storage.");
    return createMemoryStore();
  }

  try {
    const { createPostgresStore } = await import("./postgresStore.mjs");
    const store = await createPostgresStore();
    console.log("Magen3 API connected to PostgreSQL through Drizzle.");
    return store;
  } catch (error) {
    console.warn("Failed to connect to PostgreSQL. Falling back to in-memory storage.");
    console.warn(error?.message || error);
    return createMemoryStore();
  }
}
