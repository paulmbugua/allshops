import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { prisma } from "@allshops/database";
import { Redis } from "ioredis";

export interface ReadinessChecks {
  postgres: "up" | "down";
  redis: "up" | "down";
}

@Injectable()
export class HealthService implements OnModuleDestroy {
  private readonly redis = new Redis(
    process.env.REDIS_URL ?? "redis://localhost:6379",
    {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
    },
  );

  async readiness(): Promise<ReadinessChecks> {
    const [postgres, redis] = await Promise.allSettled([
      prisma.$queryRaw`SELECT 1`,
      this.redis.ping(),
    ]);

    return {
      postgres: postgres.status === "fulfilled" ? "up" : "down",
      redis: redis.status === "fulfilled" ? "up" : "down",
    };
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled([prisma.$disconnect(), this.redis.quit()]);
  }
}
