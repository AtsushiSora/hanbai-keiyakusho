import {
  allowedOrigin,
  clean,
  corsHeaders,
  jsonResponse,
  serviceHeaders,
  supabaseUrl,
} from "../_shared/http.ts";

const PDF_BUCKET = "order-auto-contract-files";

function validPdfDataUrl(value: unknown): value is string {
  return typeof value === "string"
    && value.startsWith("data:application/pdf")
    && value.includes(";base64,JVBERi0")
    && value.length >= 5000
    && value.length <= 20_000_000;
}

function pdfBytes(dataUrl: string): Uint8Array {
  const binary = atob(dataUrl.split(",", 2)[1] || "");
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function uploadCustomerPdf(contractId: string, dataUrl: string): Promise<string> {
  const path = `${contractId}/signed/customer-copy.pdf`;
  const headers = new Headers(serviceHeaders());
  headers.set("Content-Type", "application/pdf");
  headers.set("x-upsert", "true");
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const response = await fetch(supabaseUrl(`/storage/v1/object/${PDF_BUCKET}/${encodedPath}`), {
    method: "POST",
    headers,
    body: pdfBytes(dataUrl),
  });
  if (!response.ok) throw new Error(`PDF upload failed: ${response.status}`);
  return path;
}

Deno.serve(async (request) => {
  const origin = allowedOrigin(request);
  if (!origin) return new Response("Origin not allowed", { status: 403 });
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405, origin);

  let submitted: Record<string, unknown> | null = null;
  try {
    const body = await request.json();
    if (!validPdfDataUrl(body.customerPdfDataUrl)) {
      return jsonResponse({ error: "Signed contract PDF is required" }, 422, origin);
    }
    const rpcResponse = await fetch(supabaseUrl("/rest/v1/rpc/submit_order_auto_remote_contract_for_review"), {
      method: "POST",
      headers: serviceHeaders(),
      body: JSON.stringify({
        p_access_token: body.accessToken,
        p_passcode: body.passcode,
        p_signer_name: body.signerName,
        p_consent_items: body.consentItems,
        p_signature_data_url: body.signatureDataUrl,
        p_customer_data: body.customerData,
      }),
    });
    if (!rpcResponse.ok) throw new Error(`Review RPC failed: ${rpcResponse.status}`);
    submitted = (await rpcResponse.json())?.[0] || null;
    if (!submitted?.contract_id || !submitted?.remote_id) {
      return jsonResponse({ error: "Contract link is invalid, expired, or already used" }, 409, origin);
    }

    const contractId = clean(submitted.contract_id, 120);
    const remoteId = clean(submitted.remote_id, 100);
    const customerPdfPath = await uploadCustomerPdf(contractId, body.customerPdfDataUrl);
    const now = new Date().toISOString();
    const [contractUpdate, remoteUpdate] = await Promise.all([
      fetch(supabaseUrl(`/rest/v1/order_auto_contracts?id=eq.${encodeURIComponent(contractId)}&status=eq.${encodeURIComponent("確認待ち")}`), {
        method: "PATCH",
        headers: serviceHeaders("return=minimal"),
        body: JSON.stringify({ customer_pdf_path: customerPdfPath, updated_at: now }),
      }),
      fetch(supabaseUrl(`/rest/v1/order_auto_remote_contracts?id=eq.${encodeURIComponent(remoteId)}&status=eq.${encodeURIComponent("確認待ち")}`), {
        method: "PATCH",
        headers: serviceHeaders("return=minimal"),
        body: JSON.stringify({ customer_pdf_path: customerPdfPath, updated_at: now }),
      }),
    ]);
    if (!contractUpdate.ok || !remoteUpdate.ok) throw new Error("PDF path could not be saved");

    const contractData = submitted.contract_data && typeof submitted.contract_data === "object"
      ? submitted.contract_data as Record<string, unknown>
      : {};
    const buyerName = clean(contractData.buyerName || body.signerName, 120);
    const buyerEmail = clean(submitted.buyer_email, 254);
    const contractNumber = clean(submitted.contract_number, 40);
    await fetch(supabaseUrl("/rest/v1/order_auto_admin_notifications"), {
      method: "POST",
      headers: serviceHeaders("return=minimal"),
      body: JSON.stringify({
        owner_user_id: submitted.owner_user_id,
        notification_type: "sales_contract_pending_review",
        title: "販売契約の電子署名を受け付けました",
        message: `契約番号 ${contractNumber || "未入力"} / ${buyerName} 様`,
        payload: { contractId, remoteId, buyerName, buyerEmail, signedAt: submitted.signed_at },
      }),
    });

    return jsonResponse({ ok: true, contractId, completedAt: submitted.signed_at, status: "確認待ち" }, 200, origin);
  } catch (error) {
    console.error("submit-sales-consent", error);
    if (submitted?.contract_id && submitted?.remote_id) {
      await Promise.allSettled([
        fetch(supabaseUrl(`/rest/v1/order_auto_contracts?id=eq.${encodeURIComponent(clean(submitted.contract_id, 120))}&status=eq.${encodeURIComponent("確認待ち")}`), {
          method: "PATCH",
          headers: serviceHeaders("return=minimal"),
          body: JSON.stringify({ status: "送信済み", customer_pdf_path: null, confirmation_email_status: "submit_failed" }),
        }),
        fetch(supabaseUrl(`/rest/v1/order_auto_remote_contracts?id=eq.${encodeURIComponent(clean(submitted.remote_id, 100))}&status=eq.${encodeURIComponent("確認待ち")}`), {
          method: "PATCH",
          headers: serviceHeaders("return=minimal"),
          body: JSON.stringify({ status: "開封済み", customer_pdf_path: null }),
        }),
      ]);
    }
    return jsonResponse({ error: "Signed contract could not be saved" }, 500, origin);
  }
});
