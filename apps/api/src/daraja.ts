import { ServiceUnavailableException } from "@nestjs/common";

export function darajaConfig(organizationId: string) {
  const {
    MPESA_ORGANIZATION_ID,
    MPESA_CONSUMER_KEY,
    MPESA_CONSUMER_SECRET,
    MPESA_PAYBILL,
    MPESA_PASSKEY,
    MPESA_MODE,
    API_URL,
  } = process.env;
  if (
    organizationId !== MPESA_ORGANIZATION_ID ||
    !MPESA_CONSUMER_KEY ||
    !MPESA_CONSUMER_SECRET ||
    !MPESA_PASSKEY ||
    !MPESA_PAYBILL ||
    !/^\d{5,10}$/.test(MPESA_PAYBILL) ||
    (MPESA_MODE !== "sandbox" && MPESA_MODE !== "production") ||
    !API_URL?.startsWith("https://")
  )
    return null;
  return {
    host:
      MPESA_MODE === "sandbox"
        ? "https://sandbox.safaricom.co.ke"
        : "https://api.safaricom.co.ke",
    shortcode: MPESA_PAYBILL,
    passkey: MPESA_PASSKEY,
    basic: Buffer.from(
      `${MPESA_CONSUMER_KEY}:${MPESA_CONSUMER_SECRET}`,
    ).toString("base64"),
    callback: `${API_URL.replace(/\/$/, "")}/api/v1/organizations/${organizationId}/pos/mpesa/callback`,
  };
}

type DarajaConfig = NonNullable<ReturnType<typeof darajaConfig>>;

export async function darajaToken(config: DarajaConfig) {
  try {
    const response = await fetch(
      `${config.host}/oauth/v1/generate?grant_type=client_credentials`,
      {
        headers: { Authorization: `Basic ${config.basic}` },
        signal: AbortSignal.timeout(10_000),
      },
    );
    const data = (await response.json()) as { access_token?: string };
    if (response.ok && data.access_token) return data.access_token;
  } catch {
    /* The provider response can contain private details. */
  }
  throw new ServiceUnavailableException(
    "M-Pesa authorization is unavailable. Ask the owner to check the Daraja setup.",
  );
}

export async function darajaStk<T>(
  config: DarajaConfig,
  token: string,
  path: string,
  body: object,
): Promise<T> {
  const timestamp = new Date(Date.now() + 3 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 19)
    .replace(/\D/g, "");
  const response = await fetch(`${config.host}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      BusinessShortCode: config.shortcode,
      Password: Buffer.from(
        `${config.shortcode}${config.passkey}${timestamp}`,
      ).toString("base64"),
      Timestamp: timestamp,
      ...body,
    }),
    signal: AbortSignal.timeout(12_000),
  });
  return (await response.json()) as T;
}
