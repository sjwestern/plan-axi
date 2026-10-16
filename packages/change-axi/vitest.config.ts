import { defineConfig } from "vitest/config";
// Tests spawn many git/tasks-axi processes; parallel files can exceed the 5s default.
export default defineConfig({ test: { include: ["test/**/*.test.ts"], testTimeout: 30000, hookTimeout: 30000 } });
