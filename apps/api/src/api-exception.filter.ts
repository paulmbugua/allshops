import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";

import type { RequestContext, ResponseContext } from "./security.types.js";
import { captureError, safeError } from "./observability.js";

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<ResponseContext>();
    const request = context.getRequest<RequestContext>();
    const databaseCode =
      typeof exception === "object" &&
      exception !== null &&
      "code" in exception &&
      typeof exception.code === "string"
        ? exception.code
        : undefined;
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : databaseCode === "P2002"
          ? HttpStatus.CONFLICT
          : databaseCode === "P2034"
            ? HttpStatus.CONFLICT
            : databaseCode === "P2025"
              ? HttpStatus.NOT_FOUND
              : databaseCode === "P2003" || databaseCode === "P2023"
                ? HttpStatus.BAD_REQUEST
                : HttpStatus.INTERNAL_SERVER_ERROR;
    const details =
      exception instanceof HttpException ? exception.getResponse() : undefined;
    const object =
      typeof details === "object" && details !== null
        ? (details as Record<string, unknown>)
        : {};
    const message =
      typeof details === "string"
        ? details
        : typeof object.message === "string"
          ? object.message
          : databaseCode === "P2002"
            ? "A record with these values already exists."
            : databaseCode === "P2034"
              ? "The resource changed concurrently; retry the request."
              : status === 500
                ? "An unexpected error occurred."
                : "Request failed.";

    if (status >= 500) {
      const safe = safeError(exception);
      process.stderr.write(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          level: "error",
          service: "allshops-api",
          environment: process.env.NODE_ENV,
          requestId: request.requestId,
          route: request.originalUrl?.split("?")[0],
          method: request.method,
          userId: request.user?.id,
          organizationId: request.tenant?.organizationId,
          errorClass: safe.name,
          message: safe.message,
          stack: safe.stack,
        }) + "\n",
      );
      captureError(exception, {
        requestId: request.requestId,
        route: request.originalUrl?.split("?")[0],
        method: request.method,
        userId: request.user?.id,
        organizationId: request.tenant?.organizationId,
      });
    }

    response.status(status).json({
      statusCode: status,
      code:
        typeof object.code === "string"
          ? object.code
          : databaseCode === "P2002"
            ? "CONFLICT"
            : databaseCode === "P2034"
              ? "CONCURRENT_UPDATE"
              : databaseCode === "P2025"
                ? "NOT_FOUND"
                : databaseCode
                  ? "DATABASE_REQUEST_INVALID"
                  : status >= 500
                    ? "INTERNAL_ERROR"
                    : (HttpStatus[status] ?? "ERROR"),
      message,
      ...(object.issues ? { issues: object.issues } : {}),
      requestId: request.requestId,
    });
  }
}
