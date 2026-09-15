import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { prisma } from "@allshops/database";
import { argon2id, hash, verify } from "argon2";
import { randomBytes, randomUUID } from "node:crypto";

import type {
  AcceptInviteInput,
  AccountTokenInput,
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
} from "@allshops/contracts";
import { MailService } from "./mail.service.js";
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
  constructor(
    private readonly tokens: TokenService,
    private readonly mail: MailService,
  ) {}

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
    const activation = await this.issueAccountToken(
      user.id,
      "EMAIL_ACTIVATION",
      24 * 60 * 60 * 1000,
    );
    const emailDelivery = await this.mail
      .sendAccountActivation({
        recipient: input.email,
        recipientName: input.name,
        token: activation.token,
        expiresAt: activation.expiresAt,
      })
      .then((result) => result.status)
      .catch(() => "FAILED" as const);
    return {
      ...(await this.createSession(user.id, request)),
      activationRequired: true,
      emailDelivery,
      ...(process.env.NODE_ENV === "production"
        ? {}
        : { activationToken: activation.token }),
    };
  }

  async activateAccount(input: AccountTokenInput, request: RequestContext) {
    const token = await this.consumeAccountToken(
      input.token,
      "EMAIL_ACTIVATION",
    );
    await prisma.$transaction([
      prisma.user.update({
        where: { id: token.userId },
        data: { emailVerifiedAt: new Date() },
      }),
      prisma.auditLog.create({
        data: {
          userId: token.userId,
          action: "USER_EMAIL_VERIFIED",
          entityType: "User",
          entityId: token.userId,
          ipAddress: this.ip(request),
        },
      }),
    ]);
    return this.createSession(token.userId, request);
  }

  async forgotPassword(input: ForgotPasswordInput, request: RequestContext) {
    const user = await prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true, name: true, email: true, status: true },
    });
    if (user?.email && user.status !== "SUSPENDED") {
      const reset = await this.issueAccountToken(
        user.id,
        "PASSWORD_RESET",
        60 * 60 * 1000,
      );
      await this.mail
        .sendPasswordReset({
          recipient: user.email,
          recipientName: user.name,
          token: reset.token,
          expiresAt: reset.expiresAt,
        })
        .catch(() => undefined);
      await prisma.auditLog.create({
        data: {
          userId: user.id,
          action: "PASSWORD_RESET_REQUESTED",
          entityType: "User",
          entityId: user.id,
          ipAddress: this.ip(request),
        },
      });
    }
    return {
      accepted: true,
      message:
        "If that email belongs to an eligible account, a reset link has been sent.",
    };
  }

  async resendActivation(input: ForgotPasswordInput) {
    const user = await prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true, name: true, email: true, emailVerifiedAt: true },
    });
    if (user?.email && !user.emailVerifiedAt) {
      const activation = await this.issueAccountToken(
        user.id,
        "EMAIL_ACTIVATION",
        24 * 60 * 60 * 1000,
      );
      await this.mail
        .sendAccountActivation({
          recipient: user.email,
          recipientName: user.name,
          token: activation.token,
          expiresAt: activation.expiresAt,
        })
        .catch(() => undefined);
    }
    return {
      accepted: true,
      message:
        "If this account still requires verification, a fresh activation email has been sent.",
    };
  }

  async sendPasswordResetForUser(userId: string) {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, name: true, email: true, status: true },
    });
    if (!user.email || user.status === "SUSPENDED")
      throw new BadRequestException({
        code: "PASSWORD_RESET_UNAVAILABLE",
        message: "This user is not eligible for an emailed password reset.",
      });
    const reset = await this.issueAccountToken(
      user.id,
      "PASSWORD_RESET",
      60 * 60 * 1000,
    );
    const status = await this.mail
      .sendPasswordReset({
        recipient: user.email,
        recipientName: user.name,
        token: reset.token,
        expiresAt: reset.expiresAt,
      })
      .then((result) => result.status)
      .catch(() => "FAILED" as const);
    return { status };
  }

  async resetPassword(input: ResetPasswordInput, request: RequestContext) {
    const token = await this.consumeAccountToken(input.token, "PASSWORD_RESET");
    const passwordHash = await hash(input.password, passwordOptions);
    await prisma.$transaction([
      prisma.user.update({
        where: { id: token.userId },
        data: { passwordHash },
      }),
      prisma.authSession.updateMany({
        where: { userId: token.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      prisma.auditLog.create({
        data: {
          userId: token.userId,
          action: "PASSWORD_RESET_COMPLETED",
          entityType: "User",
          entityId: token.userId,
          ipAddress: this.ip(request),
        },
      }),
    ]);
    return { success: true };
  }

  async login(input: LoginInput, request: RequestContext) {
    const user = await prisma.user.findUnique({
      where: { email: input.email },
      include: {
        accountTokens: {
          where: {
            type: "EMAIL_ACTIVATION",
          },
          select: { id: true },
          take: 1,
        },
      },
    });
    const passwordValid = await verify(
      user?.passwordHash || (await hash("invalid-password", passwordOptions)),
      input.password,
    ).catch(() => false);
    const valid = user?.status === "ACTIVE" && passwordValid;
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
    if (!user.emailVerifiedAt && user.accountTokens.length > 0) {
      throw new UnauthorizedException({
        code: "EMAIL_NOT_VERIFIED",
        message:
          "Activate your account from the secure email before signing in.",
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
          emailVerifiedAt: new Date(),
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

  private async issueAccountToken(
    userId: string,
    type: "EMAIL_ACTIVATION" | "PASSWORD_RESET",
    ttlMs: number,
  ) {
    const token = this.tokens.randomInvitationToken();
    const expiresAt = new Date(Date.now() + ttlMs);
    await prisma.$transaction([
      prisma.accountToken.updateMany({
        where: { userId, type, usedAt: null },
        data: { usedAt: new Date() },
      }),
      prisma.accountToken.create({
        data: {
          userId,
          type,
          tokenHash: this.tokens.invitationHash(token),
          expiresAt,
        },
      }),
    ]);
    return { token, expiresAt };
  }

  private async consumeAccountToken(
    token: string,
    type: "EMAIL_ACTIVATION" | "PASSWORD_RESET",
  ) {
    const record = await prisma.accountToken.findFirst({
      where: {
        tokenHash: this.tokens.invitationHash(token),
        type,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { id: true, userId: true },
    });
    if (!record)
      throw new BadRequestException({
        code: "INVALID_ACCOUNT_TOKEN",
        message: "This secure link is invalid, expired, or already used.",
      });
    const claimed = await prisma.accountToken.updateMany({
      where: { id: record.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (claimed.count !== 1)
      throw new BadRequestException({
        code: "ACCOUNT_TOKEN_USED",
        message: "This secure link has already been used.",
      });
    return record;
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
            employeeNumber: true,
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
        employeeNumber: membership.employeeNumber,
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
