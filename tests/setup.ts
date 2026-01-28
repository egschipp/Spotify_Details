import { afterAll, afterEach, beforeAll, beforeEach } from "vitest";
import { setupServer } from "msw/node";
import { promises as fs } from "fs";
import path from "path";

export const server = setupServer();

const dataDir = path.join(process.cwd(), "data-test");

beforeAll(() => {
  process.env.SPOTIFY_CRED_ENCRYPTION_KEY =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  process.env.SPOTIFY_DATA_DIR = dataDir;
  server.listen();
});

beforeEach(async () => {
  await fs.rm(dataDir, { recursive: true, force: true });
});

afterEach(() => server.resetHandlers());

afterAll(() => server.close());
