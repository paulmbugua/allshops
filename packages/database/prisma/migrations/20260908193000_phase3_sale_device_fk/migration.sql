ALTER TABLE "sales" ALTER COLUMN "deviceId" TYPE UUID USING "deviceId"::UUID;
CREATE INDEX "sales_deviceId_idx" ON "sales"("deviceId");
ALTER TABLE "sales" ADD CONSTRAINT "sales_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
