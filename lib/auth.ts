import jwt from "jsonwebtoken";
import { NextRequest } from "next/server";

const SECRET = process.env.JWT_SECRET;

if (!SECRET || SECRET === "change-me-to-a-real-random-secret") {
  console.warn(
    "[auth] JWT_SECRET is missing or using the placeholder default. Set a real random value in .env before any real deployment."
  );
}

export type AuthedMerchant = { merchantId: string };

export function signMerchantToken(merchantId: string): string {
  return jwt.sign({ merchantId }, SECRET ?? "insecure-dev-fallback", { expiresIn: "12h" });
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

// Extracts and verifies the bearer token. Never trusts a merchantId
// supplied by the client body/query — only the token's signed payload.
export function requireAuth(req: NextRequest): AuthedMerchant {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new AuthError("Missing or malformed Authorization header");
  }

  const token = authHeader.slice("Bearer ".length);

  try {
    const payload = jwt.verify(token, SECRET ?? "insecure-dev-fallback") as { merchantId: string };
    if (!payload.merchantId) throw new AuthError("Token missing merchantId claim");
    return { merchantId: payload.merchantId };
  } catch (e) {
    throw new AuthError("Invalid or expired token");
  }
}
