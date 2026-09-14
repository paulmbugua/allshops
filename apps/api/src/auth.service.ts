import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { prisma } from "@allshops/database";
import { argon2id, hash, verify } from "argon2";
import { randomBytes, randomUUID } from "node:crypto";

import type {
  AcceptInviteInput,
  LoginInput,
  RegisterInput,
} from "@allshops/contracts";
import type { RequestContext } from "./security.types.js";
import { TokenService } from "./token.service.js";

const passwordOptions = {
  type: argon2id as 2,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

@Injectable()
export class AuthService {
  constructor(private readonly tokens: TokenService) {}

  async register(input: RegisterInput, request: RequestContext) {
    const existing = await prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException({
        code: "EMAIL_ALREADY_REGISTERED",
        message: "An account with this email already exists.",
      });
    }
    const passwordHash = await hash(input.password, passwordOptions);
    const user = await prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
        passwordHash,
        auditLogs: {
          create: {
            action: "USER_REGISTERED",
            entityType: "User",
            ipAddress: this.ip(request),
          },
        },
      },
      select: { id: true },
    });
    return this.createSession(user.id, request);
  }

  async login(input: LoginInput, request: RequestContext) {
    const user = await prisma.user.findUnique({
      where: { email: input.email },
    });
    const valid =
      user?.status === "ACTIVE" &&
      (await verify(
        user.passwordHash || (await hash("invalid-password", passwordOptions)),
        input.password,
      ).catch(() => false));
    if (!user || !valid) {
      await prisma.auditLog.create({
        data: {
          userId: user?.id,
          action: "USER_LOGIN_FAILED",
          entityType: "User",
          entityId: user?.id,
          ipAddress: this.ip(request),
          afterJson: { email: input.email },
        },
      });
      throw new UnauthorizedException({
        code: "INVALID_CREDENTIALS",
        message: "The email or password is incorrect.",
      });
    }
    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      }),
      prisma.auditLog.create({
        data: {
          userId: user.id,
          action: "USER_LOGIN",
          entityType: "User",
          entityId: user.id,
          ipAddress: this.ip(request),
        },
      }),
    ]);
    return this.createSession(user.id, request);
  }

  async refresh(refreshToken: string, request: RequestContext) {
    const payload = this.tokens.verifyRefreshToken(refreshToken);
    if (!payload.sid) {
      throw this.invalidRefresh();
    }
    const session = await prisma.authSession.findFirst({
      where: {
        id: payload.sid,
        userId: payload.sub,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        user: { status: "ACTIVE" },
      },
    });
    if (
      !session ||
      !this.tokens.refreshHashMatches(refreshToken, session.refreshTokenHash)
    ) {
      if (session) {
        await prisma.authSession.update({
          where: { id: session.id },
          data: { revokedAt: new Date() },
        });
      }
      throw this.invalidRefresh();
    }

    const nextRefreshToken = this.tokens.createRefreshToken(
      session.userId,
      session.id,
    );
    await prisma.authSession.update({
      where: { id: session.id },
      data: {
        refreshTokenHash: this.tokens.hashRefreshToken(nextRefreshToken),
        lastSeenAt: new Date(),
        userAgent: this.userAgent(request),
        ipAddress: this.ip(request),
      },
    });
    return {
      accessToken: this.tokens.createAccessToken(session.userId),
      refreshToken: nextRefreshToken,
      expiresIn: this.tokens.accessTtlSeconds,
      user: await this.safeUser(session.userId),
    };
  }

  async logout(refreshToken: string | undefined, request: RequestContext) {
    if (refreshToken) {
      try {
        const payload = this.tokens.verifyRefreshToken(refreshToken);
        if (payload.sid) {
          await prisma.authSession.updateMany({
            where: { id: payload.sid, userId: payload.sub, revokedAt: null },
            data: { revokedAt: new Date() },
          });
          await prisma.auditLog.create({
            data: {
              userId: payload.sub,
              action: "USER_LOGOUT",
              entityType: "AuthSession",
              entityId: payload.sid,
              ipAddress: this.ip(request),
            },
          });
        }
      } catch {
        // Logout is intentionally idempotent and still clears an invalid cookie.
      }
    }
    return { success: true };
  }

  async me(userId: string) {
    return this.safeUser(userId);
  }

  async acceptInvite(input: AcceptInviteInput, request: RequestContext) {
    const tokenHash = this.tokens.invitationHash(input.token);
    const invitation = await prisma.invitation.findFirst({
      where: {
        tokenHash,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (!invitation) {
      throw new UnauthorizedException({
        code: "INVALID_INVITATION",
        message: "The invitation is invalid, expired, or already used.",
      });
    }
    const passwordHash = await hash(input.password, passwordOptions);
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: invitation.userId },
        data: {
          passwordHash,
          status: "ACTIVE",
          ...(input.name ? { name: input.name } : {}),
        },
      });
      await tx.organizationUser.update({
        where: {
          organizationId_userId: {
            organizationId: invitation.organizationId,
            userId: invitation.userId,
          },
        },
        data: {
          roleId: invitation.roleId,
          branchId: invitation.branchId,
          status: "ACTIVE",
        },
      });
      await tx.invitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          organizationId: invitation.organizationId,
          userId: invitation.userId,
          action: "USER_INVITATION_ACCEPTED",
          entityType: "OrganizationUser",
          entityId: invitation.userId,
          ipAddress: this.ip(request),
        },
      });
    });
    return this.createSession(invitation.userId, request);
  }

  async createInvitedPasswordHash(): Promise<string> {
    return hash(randomBytes(32).toString("hex"), passwordOptions);
  }

  private async createSession(userId: string, request: RequestContext) {
    const sessionId = randomUUID();
    const refreshToken = this.tokens.createRefreshToken(userId, sessionId);
    await prisma.authSession.create({
      data: {
        id: sessionId,
        userId,
        refreshTokenHash: this.tokens.hashRefreshToken(refreshToken),
        userAgent: this.userAgent(request),
        ipAddress: this.ip(request),
        expiresAt: new Date(Date.now() + this.tokens.refreshTtlSeconds * 1000),
      },
    });
    return {
      accessToken: this.tokens.createAccessToken(userId),
      refreshToken,
      expiresIn: this.tokens.accessTtlSeconds,
      user: await this.safeUser(userId),
    };
  }

  private async safeUser(userId: string) {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        memberships: {
          where: { status: { in: ["ACTIVE", "INVITED"] } },
          select: {
            id: true,
            organizationId: true,
            branchId: true,
            status: true,
            organization: { select: { name: true, status: true } },
            branch: { select: { name: true } },
            role: {
              select: {
                id: true,
                code: true,
                name: true,
                permissions: {
                  select: { permission: { select: { code: true } } },
                },
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      status: user.status,
      memberships: user.memberships.map((membership) => ({
        id: membership.id,
        organizationId: membership.organizationId,
        organizationName: membership.organization.name,
        organizationStatus: membership.organization.status,
        roleId: membership.role.id,
        role: membership.role.code,
        roleName: membership.role.name,
        permissions: membership.role.permissions
          .map(({ permission }) => permission.code)
          .sort(),
        branchId: membership.branchId,
        branchName: membership.branch?.name ?? null,
        status: membership.status,
      })),
    };
  }

  private ip(request: RequestContext): string | undefined {
    return request.ip ?? request.socket?.remoteAddress;
  }

  private userAgent(request: RequestContext): string | undefined {
    const value = request.headers["user-agent"];
    return Array.isArray(value) ? value[0] : value;
  }

  private invalidRefresh(): UnauthorizedException {
    return new UnauthorizedException({
      code: "INVALID_REFRESH_TOKEN",
      message: "The refresh token is invalid or has been revoked.",
    });
  }
}
