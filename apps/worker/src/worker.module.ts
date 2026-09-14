import { Module } from "@nestjs/common";

import { WorkerService } from "./worker.service.js";

@Module({
  providers: [WorkerService],
})
export class WorkerModule {}
