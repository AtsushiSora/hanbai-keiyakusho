import {
  allowedOrigin,
  corsHeaders,
  jsonResponse,
  serviceHeaders,
  sha256Hex,
  supabaseUrl,
} from "../_shared/http.ts";

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

function safeFilename(value: unknown): string {
  const number = String(value ?? "").replace(/[^0-9A-Za-z_-]/g, "").slice(0, 40);
  return `sales-contract-${number || "customer-copy"}.pdf`;
}

Deno.serve(async (request) => {
  const origin = allowedOrigin(request);
  if (!origin) return new Response("Origin not allowed", { status: 403 });
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405, origin);

  try {
    const token = String((await request.json())?.token || "").trim();
    if (!/^[A-Za-z0-9_-]{32}$/.test(token)) return jsonResponse({ error: "Invalid request" }, 400, origin);
    const tokenHash = await sha256Hex(token);
    const query = new URLSearchParams({
      download_access_hash: `eq.${tokenHash}`,
      select: "id,status,data,customer_pdf_path,download_access_hash,download_access_expires_at",
      limit: "1",
    });
    const contractResponse = await fetch(supabaseUrl(`/rest/v1/order_auto_contracts?${query}`), { headers: serviceHeaders() });
    if (!contractResponse.ok) throw new Error(await contractResponse.text());
    const contract = (await contractResponse.json())?.[0];
    if (!contract || !constantTimeEqual(tokenHash, contract.download_access_hash || "")) {
      return jsonResponse({ error: "Download link is invalid or expired" }, 404, origin);
    }
    const expiresAt = Date.parse(contract.download_access_expires_at || "");
    if (contract.status !== "完了" || !contract.customer_pdf_path || !Number.isFinite(expiresAt) || Date.now() > expiresAt) {
      return jsonResponse({ error: "Download link is invalid or expired" }, 403, origin);
    }

    const path = String(contract.customer_pdf_path).split("/").map(encodeURIComponent).join("/");
    const headers = new Headers(serviceHeaders());
    headers.delete("Content-Type");
    const storageResponse = await fetch(supabaseUrl(`/storage/v1/object/order-auto-contract-files/${path}`), { headers });
    if (!storageResponse.ok) throw new Error(`PDF download failed: ${storageResponse.status}`);
    return new Response(storageResponse.body, {
      status: 200,
      headers: {
        ...corsHeaders(origin),
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safeFilename(contract.data?.estimateNo)}"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("download-sales-contract", error);
    return jsonResponse({ error: "Contract PDF could not be downloaded" }, 500, origin);
  }
});
