import {createHash, createHmac, timingSafeEqual} from "node:crypto";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SIGNATURE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const TOKEN_CONTEXT = "autoshop-approval:v1";

export type ParsedApprovalToken = {
  requestId: string;
  token: string;
};

export function createApprovalTokenWithSecret(
  requestId: string,
  secret: string
): string {
  if (!UUID_PATTERN.test(requestId)) throw new Error("Invalid approval request id");
  if (secret.length < 32) throw new Error("Approval token secret is too short");
  const signature = createHmac("sha256", secret)
    .update(`${TOKEN_CONTEXT}:${requestId.toLowerCase()}`)
    .digest("base64url");
  return `${requestId.toLowerCase()}.${signature}`;
}

export function parseApprovalTokenWithSecret(
  token: string,
  secret: string
): ParsedApprovalToken | null {
  if (token.length > 96 || secret.length < 32) return null;
  const [requestId, signature, extra] = token.split(".");
  if (extra !== undefined || !UUID_PATTERN.test(requestId) || !SIGNATURE_PATTERN.test(signature)) {
    return null;
  }
  const expected = createApprovalTokenWithSecret(requestId, secret).split(".")[1];
  const suppliedBuffer = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  if (
    suppliedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(suppliedBuffer, expectedBuffer)
  ) {
    return null;
  }
  return {requestId: requestId.toLowerCase(), token};
}

export function hashApprovalToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
