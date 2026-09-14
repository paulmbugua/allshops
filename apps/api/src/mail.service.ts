import { Injectable } from "@nestjs/common";
import nodemailer from "nodemailer";

type InvitationMail = {
  recipient: string;
  recipientName: string;
  organizationName: string;
  roleName: string;
  branchName?: string | null;
  invitationToken: string;
  expiresAt: Date;
  logoUrl?: string | null;
  primaryColor?: string;
  accentColor?: string;
};

const escapeHtml = (value: string) =>
  value.replace(/[&<>'"]/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;",
    };
    return entities[character] ?? character;
  });

@Injectable()
export class MailService {
  private transporter() {
    const host = process.env.SMTP_HOST?.trim();
    if (!host) return null;
    const user = process.env.SMTP_USER?.trim();
    const password =
      process.env.SMTP_PASSWORD?.trim() || process.env.SMTP_PASS || "";
    return nodemailer.createTransport({
      host,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE?.toLowerCase() === "true",
      ...(user
        ? {
            auth: {
              user,
              pass: password,
            },
          }
        : {}),
    });
  }

  async sendInvitation(input: InvitationMail) {
    const transporter = this.transporter();
    if (!transporter) return { status: "NOT_CONFIGURED" as const };
    const appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(
      /\/$/,
      "",
    );
    const invitationUrl = `${appUrl}/accept-invite?token=${encodeURIComponent(input.invitationToken)}`;
    const branch = input.branchName ? ` at ${input.branchName}` : "";
    const primary = input.primaryColor ?? "#172C2B";
    const accent = input.accentColor ?? "#FFCF5C";
    const fromAddress = process.env.MAIL_FROM_ADDRESS?.trim();
    const fromName = process.env.MAIL_FROM_NAME?.trim();
    const from =
      (fromAddress
        ? fromName
          ? `${fromName} <${fromAddress}>`
          : fromAddress
        : process.env.MAIL_FROM?.trim()) ||
      process.env.SMTP_FROM?.trim() ||
      "AllShops <no-reply@allshops.app>";
    const logo = input.logoUrl
      ? `<img src="${escapeHtml(input.logoUrl)}" alt="" width="64" height="64" style="display:block;object-fit:contain;border-radius:14px;background:white;margin-bottom:18px" />`
      : "";
    await transporter.sendMail({
      from,
      ...(process.env.MAIL_REPLY_TO?.trim()
        ? { replyTo: process.env.MAIL_REPLY_TO.trim() }
        : {}),
      to: input.recipient,
      subject: `Your ${input.organizationName} AllShops account is ready`,
      text: [
        `Hello ${input.recipientName},`,
        "",
        `${input.organizationName} has created an AllShops account for you as ${input.roleName}${branch}.`,
        `Create your private password here: ${invitationUrl}`,
        `This secure link expires ${input.expiresAt.toISOString()}.`,
        "",
        "If you were not expecting this invitation, you can ignore this email.",
      ].join("\n"),
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:${primary}">
        <div style="padding:28px;border-radius:18px;background:#f1fbf7;border-top:8px solid ${accent}">
          ${logo}<p style="color:${primary};font-weight:700">ALLSHOPS TEAM ACCESS</p>
          <h1 style="margin:8px 0">Welcome, ${escapeHtml(input.recipientName)}</h1>
          <p>${escapeHtml(input.organizationName)} has created an account for you as <strong>${escapeHtml(input.roleName)}</strong>${escapeHtml(branch)}.</p>
          <p style="margin:28px 0"><a href="${escapeHtml(invitationUrl)}" style="padding:14px 20px;border-radius:10px;background:${primary};color:white;text-decoration:none;font-weight:700">Create my password</a></p>
          <p style="font-size:13px;color:#60766f">This one-time link expires ${escapeHtml(input.expiresAt.toLocaleString("en-QA"))}. Never share it with anyone.</p>
        </div>
      </div>`,
    });
    return { status: "SENT" as const };
  }
}
