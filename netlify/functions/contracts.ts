import { getStore } from "@netlify/blobs";
import type { Config, Context } from "@netlify/functions";
import { getUser } from "@netlify/identity";

declare const Netlify: {
  env: {
    get(name: string): string | undefined;
  };
};

type ContractPayload = {
  data?: Record<string, string>;
  signatureImage?: string;
  emailConsentChecked?: boolean;
};

type ContractRecord = ContractPayload & {
  id: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
};

type ContractSummary = {
  id: string;
  buyerName: string;
  vehicleName: string;
  totalPrice: string;
  savedAt: string;
  updatedAt: string;
};

const store = getStore({ name: "order-auto-contracts", consistency: "strong" });
const indexKey = "index.json";
const maxPayloadBytes = 2_000_000;

export default async (req: Request, context: Context) => {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return json({ error: admin.message }, admin.status);
  }

  const id = context.params?.id;

  try {
    switch (req.method) {
      case "GET":
        return id ? getContract(id) : listContracts();
      case "POST":
        return saveContract(req, id || createId(), admin.email);
      case "DELETE":
        return id ? deleteContract(id) : json({ error: "Contract id is required" }, 400);
      default:
        return json({ error: "Method not allowed" }, 405);
    }
  } catch {
    return json({ error: "Server error" }, 500);
  }
};

export const config: Config = {
  path: ["/api/contracts", "/api/contracts/:id"],
  method: ["GET", "POST", "DELETE"],
};

async function requireAdmin(): Promise<{ ok: true; email: string } | { ok: false; status: number; message: string }> {
  const user = await getUser();
  if (!user?.email) {
    return { ok: false, status: 401, message: "Unauthorized" };
  }

  if (isAdminUser(user)) {
    return { ok: true, email: user.email };
  }

  return { ok: false, status: 403, message: "Forbidden" };
}

function isAdminUser(user: any) {
  const allowedEmails = String(Netlify.env.get("ADMIN_EMAILS") || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  const emailAllowed = allowedEmails.includes(String(user.email || "").toLowerCase());
  const roles = [
    ...(user.app_metadata?.roles || []),
    ...(user.appMetadata?.roles || []),
    ...(user.user_metadata?.roles || []),
    ...(user.userMetadata?.roles || []),
  ].map((role) => String(role).toLowerCase());

  return emailAllowed || roles.includes("admin");
}

async function listContracts() {
  const summaries = await getIndex();
  return json({ contracts: summaries });
}

async function getContract(id: string) {
  const safeId = sanitizeId(id);
  if (!safeId) {
    return json({ error: "Invalid contract id" }, 400);
  }

  const contract = await store.get(contractKey(safeId), { type: "json" }) as ContractRecord | null;
  if (!contract) {
    return json({ error: "Not found" }, 404);
  }

  return json({ contract });
}

async function saveContract(req: Request, id: string, adminEmail: string) {
  const contentLength = Number(req.headers.get("content-length") || 0);
  if (contentLength > maxPayloadBytes) {
    return json({ error: "Payload too large" }, 413);
  }

  const safeId = sanitizeId(id);
  if (!safeId) {
    return json({ error: "Invalid contract id" }, 400);
  }

  const payload = await req.json() as ContractPayload;
  const cleanPayload = normalizePayload(payload);
  const now = new Date().toISOString();
  const existing = await store.get(contractKey(safeId), { type: "json" }) as ContractRecord | null;
  const contract: ContractRecord = {
    ...cleanPayload,
    id: safeId,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    createdBy: existing?.createdBy || adminEmail,
    updatedBy: adminEmail,
  };

  await store.setJSON(contractKey(safeId), contract, {
    metadata: {
      buyerName: cleanPayload.data?.buyerName || "",
      vehicleName: cleanPayload.data?.vehicleName || "",
      updatedAt: now,
    },
  });
  await upsertIndex(toSummary(contract));

  return json({ contract: toSummary(contract) });
}

async function deleteContract(id: string) {
  const safeId = sanitizeId(id);
  if (!safeId) {
    return json({ error: "Invalid contract id" }, 400);
  }

  await store.delete(contractKey(safeId));
  await removeFromIndex(safeId);
  return json({ ok: true });
}

function normalizePayload(payload: ContractPayload): ContractPayload {
  const data = Object.fromEntries(
    Object.entries(payload?.data || {}).map(([key, value]) => [key, String(value || "").slice(0, 5000)]),
  );
  const signatureImage = String(payload?.signatureImage || "");

  return {
    data,
    signatureImage: signatureImage.startsWith("data:image/png;base64,") ? signatureImage.slice(0, 1_500_000) : "",
    emailConsentChecked: Boolean(payload?.emailConsentChecked),
  };
}

async function getIndex(): Promise<ContractSummary[]> {
  const summaries = await store.get(indexKey, { type: "json" }) as ContractSummary[] | null;
  return Array.isArray(summaries) ? summaries : [];
}

async function upsertIndex(summary: ContractSummary) {
  const summaries = await getIndex();
  const next = [summary, ...summaries.filter((item) => item.id !== summary.id)]
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .slice(0, 500);
  await store.setJSON(indexKey, next);
}

async function removeFromIndex(id: string) {
  const summaries = await getIndex();
  await store.setJSON(indexKey, summaries.filter((item) => item.id !== id));
}

function toSummary(contract: ContractRecord): ContractSummary {
  return {
    id: contract.id,
    buyerName: contract.data?.buyerName || "",
    vehicleName: contract.data?.vehicleName || "",
    totalPrice: formatYen(contract.data?.totalPrice || ""),
    savedAt: contract.createdAt,
    updatedAt: contract.updatedAt,
  };
}

function formatYen(value: string) {
  const amount = Number(String(value || "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(amount) && amount > 0 ? `金 ${amount.toLocaleString("ja-JP")} 円` : "";
}

function createId() {
  return `contract-${Date.now()}-${crypto.randomUUID()}`;
}

function sanitizeId(id: string) {
  const cleaned = String(id || "").replace(/[^a-zA-Z0-9_-]/g, "");
  return cleaned.length > 0 && cleaned.length <= 120 ? cleaned : "";
}

function contractKey(id: string) {
  return `contracts/${id}.json`;
}

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}
