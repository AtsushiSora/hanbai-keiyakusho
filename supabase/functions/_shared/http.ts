const DEFAULT_ORIGINS = [
  "https://atsushisora.github.io",
  "http://127.0.0.1:5174",
  "http://localhost:5174",
];

export function allowedOrigin(request: Request): string | null {
  const origin = request.headers.get("origin");
  if (!origin) return DEFAULT_ORIGINS[0];
  const configured = (Deno.env.get("ALLOWED_ORIGINS") || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return (configured.length ? configured : DEFAULT_ORIGINS).includes(origin) ? origin : null;
}

export function corsHeaders(origin: string): HeadersInit {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Cache-Control": "no-store",
    Vary: "Origin",
  };
}

export function jsonResponse(body: unknown, status: number, origin: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json; charset=utf-8" },
  });
}

export function serviceHeaders(prefer = ""): HeadersInit {
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is missing");
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...(prefer ? { Prefer: prefer } : {}),
  };
}

export function supabaseUrl(path: string): string {
  const base = Deno.env.get("SUPABASE_URL");
  if (!base) throw new Error("SUPABASE_URL is missing");
  return `${base.replace(/\/$/, "")}${path}`;
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function clean(value: unknown, max = 200): string {
  return String(value ?? "").trim().slice(0, max);
}
