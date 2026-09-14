import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { ProductImagesService } from "../src/product-images.service.js";

const directory = await mkdtemp(path.join(os.tmpdir(), "allshops-images-"));
const previousEnvironment = {
  directory: process.env.PRODUCT_IMAGE_DIRECTORY,
  maximumBytes: process.env.PRODUCT_IMAGE_MAX_BYTES,
  apiUrl: process.env.API_URL,
};
process.env.PRODUCT_IMAGE_DIRECTORY = directory;
process.env.PRODUCT_IMAGE_MAX_BYTES = String(5 * 1024 * 1024);
process.env.API_URL = "https://api.example.test";

try {
  const service = new ProductImagesService();
  const organizationId = "00000000-0000-4000-8000-000000000001";
  const input = await sharp({
    create: {
      width: 1_600,
      height: 800,
      channels: 3,
      background: "#ffcf5c",
    },
  })
    .png()
    .toBuffer();
  const saved = await service.save(organizationId, {
    buffer: input,
    mimetype: "image/png",
    originalname: "product.png",
    size: input.length,
  });
  assert.match(
    saved.imageUrl,
    new RegExp(
      `^https://api\\.example\\.test/api/v1/product-images/${organizationId}/[0-9a-f-]{36}\\.webp$`,
    ),
  );
  const filename = saved.imageUrl.split("/").at(-1)!;
  const stored = await service.read(organizationId, filename);
  const metadata = await sharp(stored).metadata();
  assert.equal(metadata.format, "webp");
  assert.equal(metadata.width, 1_200);
  assert.equal(metadata.height, 600);
  await assert.rejects(
    service.save(organizationId, {
      buffer: Buffer.from("not an image"),
      mimetype: "image/png",
      originalname: "fake.png",
      size: 12,
    }),
    /JPEG, PNG, or WebP/,
  );
  console.log(
    "Product image test passed: validated upload was resized, normalized to WebP, persisted, and readable.",
  );
} finally {
  await rm(directory, { recursive: true, force: true });
  for (const [name, value] of [
    ["PRODUCT_IMAGE_DIRECTORY", previousEnvironment.directory],
    ["PRODUCT_IMAGE_MAX_BYTES", previousEnvironment.maximumBytes],
    ["API_URL", previousEnvironment.apiUrl],
  ] as const) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}
