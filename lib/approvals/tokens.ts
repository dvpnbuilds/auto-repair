import "server-only";
import {
  createApprovalTokenWithSecret,
  hashApprovalToken,
  parseApprovalTokenWithSecret,
} from "@/lib/approvals/token-core";

function approvalSecret(): string {
  const secret = process.env.APPROVAL_TOKEN_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new Error("APPROVAL_TOKEN_SECRET must contain at least 32 characters");
  }
  return secret;
}

export function createApprovalToken(requestId: string): string {
  return createApprovalTokenWithSecret(requestId, approvalSecret());
}

export function parseApprovalToken(token: string) {
  return parseApprovalTokenWithSecret(token, approvalSecret());
}

export {hashApprovalToken};
