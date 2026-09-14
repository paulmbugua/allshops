import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp, { type Metadata } from "sharp";

export interface ProductImageUpload {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

const acceptedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const acceptedFormats = new Set(["jpeg", "png", "webp"]);

@Injectable()
export class ProductImagesService {
  private readonly directory = path.resolve(
    process.env.PRODUCT_IMAGE_DIRECTORY ?? "var/product-images",
  );
  private readonly maximumBytes = Number(
    process.env.PRODUCT_IMAGE_MAX_BYTES ?? 5 * 1024 * 1024,
  );

  async save(organizationId: string, file?: ProductImageUpload) {
    if (!file)
      throw new BadRequestException({
        code: "PRODUCT_IMAGE_REQUIRED",
        message: "Choose a product image to upload.",
      });
    if (!acceptedMimeTypes.has(file.mimetype) || file.size > this.maximumBytes)
      throw this.invalidImage();

    let metadata: Metadata;
    try {
      metadata = await sharp(file.buffer, {
        failOn: "warning",
        limitInputPixels: 40_000_000,
      }).metadata();
    } catch {
      throw this.invalidImage();
    }
    if (!metadata.format || !acceptedFormats.has(metadata.format))
      throw this.invalidImage();

    const imageId = randomUUID();
    const organizationDirectory = path.join(this.directory, organizationId);
    const filename = `${imageId}.webp`;
    const destination = path.join(organizationDirectory, filename);
    const temporary = path.join(organizationDirectory, `${imageId}.tmp`);
    await mkdir(organizationDirectory, { recursive: true });
    try {
      const optimized = await sharp(file.buffer, {
        failOn: "warning",
        limitInputPixels: 40_000_000,
      })
        .rotate()
        .resize({
          width: 1_200,
          height: 1_200,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 82, effort: 4 })
        .toBuffer();
      await writeFile(temporary, optimized, { flag: "wx" });
      await rename(temporary, destination);
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => undefined);
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException({
        code: "PRODUCT_IMAGE_PROCESSING_FAILED",
        message: "The image could not be processed. Try a different file.",
      });
    }

    const apiUrl = (process.env.API_URL ?? "http://localhost:4000").replace(
      /\/$/,
      "",
    );
    const apiRoot = apiUrl.endsWith("/api/v1") ? apiUrl : `${apiUrl}/api/v1`;
    return {
      imageUrl: `${apiRoot}/product-images/${organizationId}/${filename}`,
      contentType: "image/webp",
    };
  }

  async read(organizationId: string, filename: string): Promise<Buffer> {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$/i.test(
        filename,
      )
    )
      throw this.notFound();
    try {
      return await readFile(
        path.join(this.directory, organizationId, filename),
      );
    } catch {
      throw this.notFound();
    }
  }

  private invalidImage() {
    return new BadRequestException({
      code: "INVALID_PRODUCT_IMAGE",
      message: `Use a JPEG, PNG, or WebP image up to ${Math.floor(this.maximumBytes / 1024 / 1024)} MB.`,
    });
  }

  private notFound() {
    return new NotFoundException({
      code: "PRODUCT_IMAGE_NOT_FOUND",
      message: "Product image not found.",
    });
  }
}
