import { BadRequestException } from "@nestjs/common";
import type { output, ZodTypeAny } from "zod";
import { z } from "zod";

export function parseInput<TSchema extends ZodTypeAny>(
  schema: TSchema,
  input: unknown,
): output<TSchema> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new BadRequestException({
      code: "VALIDATION_ERROR",
      message: "The request payload is invalid.",
      issues: result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
  }
  return result.data;
}

export function assertUuid(value: string | undefined, field: string): string {
  const result = z.string().uuid().safeParse(value);
  if (!result.success) {
    throw new BadRequestException({
      code: "VALIDATION_ERROR",
      message: `${field} must be a valid UUID.`,
    });
  }
  return result.data;
}
