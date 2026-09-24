import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Location, Report, Source } from "@/lib/roadcheck";

export type Store = {
  locations: Location[];
  reports: Report[];
  sources: Source[];
};

const empty: Store = { locations: [], reports: [], sources: [] };
const filePath = path.join(
  process.env.ROADCHECK_DATA_DIR || path.join(process.cwd(), "data"),
  "roadcheck.json",
);
let queue: Promise<unknown> = Promise.resolve();

async function readStore(): Promise<Store> {
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as Store;
    return {
      locations: parsed.locations ?? [],
      reports: parsed.reports ?? [],
      sources: parsed.sources ?? [],
    };
  } catch {
    return { ...empty, locations: [], reports: [], sources: [] };
  }
}

async function writeStore(store: Store) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

export function withStore<T>(fn: (store: Store) => Promise<T> | T) {
  const run = queue.then(async () => {
    const store = await readStore();
    const result = await fn(store);
    await writeStore(store);
    return result;
  });
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export async function getStore() {
  return withStore(async (store) => structuredClone(store));
}
