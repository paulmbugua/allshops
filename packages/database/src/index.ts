import { Prisma, PrismaClient } from "@prisma/client";

type QueryLoggingClient = PrismaClient<Prisma.PrismaClientOptions, "query">;

const prismaGlobal = globalThis as unknown as {
  allshopsPrisma?: QueryLoggingClient;
};

const slowQueryThreshold = Number(process.env.SLOW_QUERY_THRESHOLD_MS ?? 1000);
const log: Prisma.LogDefinition[] = [
  { emit: "stdout", level: "error" },
  { emit: "event", level: "query" },
];
if (process.env.NODE_ENV === "development")
  log.push({ emit: "stdout", level: "warn" });

const client: QueryLoggingClient =
  prismaGlobal.allshopsPrisma ??
  new PrismaClient({
    log,
  });

client.$on("query", (event) => {
  if (event.duration < slowQueryThreshold) return;
  process.stdout.write(
    `${JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "warn",
      service: process.env.ALLSHOPS_SERVICE ?? "database",
      event: "slow_query",
      durationMs: event.duration,
      query: event.query,
    })}\n`,
  );
});

export const prisma = client;

if (process.env.NODE_ENV !== "production") {
  prismaGlobal.allshopsPrisma = prisma;
}

export * from "@prisma/client";
