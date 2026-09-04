import {
  allowedOrigin,
  clean,
  corsHeaders,
  jsonResponse,
  serviceHeaders,
  sha256Hex,
  supabaseUrl,
} from "../_shared/http.ts";

const DOWNLOAD_LINK_DAYS = 30;

function randomDownloadToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function downloadUrl(origin: string, token: string): string {
  const configured = clean(Deno.env.get("PUBLIC_SITE_URL"), 300).replace(/\/$/, "");
  const site = configured || `${origin}/hanbai-keiyakusho`;
  return `${site}/download.html#d=${token}`;
}

async function authenticatedUserId(request: Request): Promise<string> {
  const authorization = request.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ")) return "";
  const headers = new Headers(serviceHeaders());
  headers.set("Authorization", authorization);
  headers.delete("Content-Type");
  const response = await fetch(supabaseUrl("/auth/v1/user"), { headers });
  if (!response.ok) return "";
  return clean((await response.json())?.id, 100);
}

async function sendCustomerEmail(details: {
  email: string;
  buyerName: string;
  contractNumber: string;
  vehicleName: string;
  totalPrice: string;
  confirmedAt: string;
  pdfUrl: string;
}): Promise<string> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("NOTIFICATION_FROM_EMAIL");
  if (!apiKey || !from) throw new Error("Email notification is not configured");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [details.email],
      subject: `【契約完了】車両販売契約 ${details.contractNumber}`,
      text: [
        `${details.buyerName} 様`,
        "",
        "オーダーオートです。",
        "車両販売契約の内容と電子署名を確認し、契約手続きが完了しました。",
        "",
        `契約番号：${details.contractNumber || "未入力"}`,
        `車両：${details.vehicleName || "未入力"}`,
        `金額：${details.totalPrice || "未入力"}`,
        `確認完了日時：${details.confirmedAt}`,
        "",
        "お客様控え契約書PDF（30日間有効）：",
        details.pdfUrl,
        "",
        "期限内にPDFを保存してください。",
        "",
        "オーダーオート",
        "広島県広島市佐伯区皆賀1-10-20",
        "TEL 070-8996-6421",
      ].join("\n"),
    }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Completion email failed: ${response.status} ${text.slice(0, 300)}`);
  try {
    return clean(JSON.parse(text)?.id, 100) || "accepted";
  } catch {
    return "accepted";
  }
}

Deno.serve(async (request) => {
  const origin = allowedOrigin(request);
  if (!origin) return new Response("Origin not allowed", { status: 403 });
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405, origin);

  try {
    const userId = await authenticatedUserId(request);
    if (!userId) return jsonResponse({ error: "Administrator authentication is required" }, 401, origin);
    const contractId = clean((await request.json())?.contractId, 120);
    if (!contractId) return jsonResponse({ error: "Invalid request" }, 400, origin);

    const query = new URLSearchParams({
      id: `eq.${contractId}`,
      user_id: `eq.${userId}`,
      select: "id,user_id,buyer_name,buyer_email,vehicle_name,total_price,status,data,customer_pdf_path",
      limit: "1",
    });
    const contractResponse = await fetch(supabaseUrl(`/rest/v1/order_auto_contracts?${query}`), { headers: serviceHeaders() });
    if (!contractResponse.ok) throw new Error(await contractResponse.text());
    const contract = (await contractResponse.json())?.[0];
    if (!contract) return jsonResponse({ error: "Contract not found" }, 404, origin);
    if (contract.status !== "確認待ち" || !contract.customer_pdf_path) {
      return jsonResponse({ error: "Contract is not ready for confirmation" }, 409, origin);
    }

    const email = clean(contract.buyer_email || contract.data?.buyerEmail, 254);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonResponse({ error: "Customer email address is missing" }, 422, origin);
    }
    const buyerName = clean(contract.buyer_name || contract.data?.buyerName, 120) || "お客様";
    const contractNumber = clean(contract.data?.estimateNo, 40);
    const vehicleName = clean(contract.vehicle_name || contract.data?.vehicleName, 200);
    const totalPrice = clean(contract.total_price || contract.data?.totalPrice, 100);
    const confirmedAt = new Date().toISOString();
    const token = randomDownloadToken();
    const tokenHash = await sha256Hex(token);
    const expiresAt = new Date(Date.now() + DOWNLOAD_LINK_DAYS * 86400000).toISOString();
    const pdfUrl = downloadUrl(origin, token);

    const lockQuery = new URLSearchParams({
      id: `eq.${contractId}`,
      user_id: `eq.${userId}`,
      status: "eq.確認待ち",
      select: "id",
    });
    const lockResponse = await fetch(supabaseUrl(`/rest/v1/order_auto_contracts?${lockQuery}`), {
      method: "PATCH",
      headers: serviceHeaders("return=representation"),
      body: JSON.stringify({
        confirmation_email_status: "sending",
        download_access_hash: tokenHash,
        download_access_expires_at: expiresAt,
        updated_at: confirmedAt,
      }),
    });
    if (!lockResponse.ok || !(await lockResponse.json())?.length) {
      return jsonResponse({ error: "Contract is already being confirmed" }, 409, origin);
    }

    let emailId = "";
    try {
      emailId = await sendCustomerEmail({ email, buyerName, contractNumber, vehicleName, totalPrice, confirmedAt, pdfUrl });
    } catch (error) {
      await fetch(supabaseUrl(`/rest/v1/order_auto_contracts?id=eq.${encodeURIComponent(contractId)}&user_id=eq.${userId}`), {
        method: "PATCH",
        headers: serviceHeaders("return=minimal"),
        body: JSON.stringify({
          confirmation_email_status: "failed",
          download_access_hash: null,
          download_access_expires_at: null,
          updated_at: new Date().toISOString(),
        }),
      });
      console.error("confirm-sales-contract email", error);
      return jsonResponse({ error: "Completion email could not be sent" }, 502, origin);
    }

    const completedData = {
      ...(contract.data || {}),
      contractStatus: "完了",
      remoteStatus: "完了",
    };
    const completionResponse = await fetch(supabaseUrl(`/rest/v1/order_auto_contracts?id=eq.${encodeURIComponent(contractId)}&user_id=eq.${userId}&status=eq.${encodeURIComponent("確認待ち")}&confirmation_email_status=eq.sending`), {
      method: "PATCH",
      headers: serviceHeaders("return=representation"),
      body: JSON.stringify({
        status: "完了",
        data: completedData,
        completed_at: confirmedAt,
        reviewed_at: confirmedAt,
        customer_confirmation_sent_at: confirmedAt,
        confirmation_email_status: "sent",
        updated_at: confirmedAt,
      }),
    });
    if (!completionResponse.ok || !(await completionResponse.json())?.length) {
      throw new Error("Completion state could not be saved");
    }

    await Promise.allSettled([
      fetch(supabaseUrl(`/rest/v1/order_auto_remote_contracts?contract_id=eq.${encodeURIComponent(contractId)}&owner_user_id=eq.${userId}&status=eq.${encodeURIComponent("確認待ち")}`), {
        method: "PATCH",
        headers: serviceHeaders("return=minimal"),
        body: JSON.stringify({ status: "完了", updated_at: confirmedAt }),
      }),
      fetch(supabaseUrl("/rest/v1/order_auto_admin_notifications"), {
        method: "POST",
        headers: serviceHeaders("return=minimal"),
        body: JSON.stringify({
          owner_user_id: userId,
          notification_type: "sales_contract_confirmation_sent",
          title: "契約完了メールを送信しました",
          message: `契約番号 ${contractNumber || "未入力"} / ${buyerName} 様`,
          payload: { contractId, buyerName, email, confirmedAt, emailId, expiresAt },
        }),
      }),
    ]);

    return jsonResponse({ ok: true, status: "完了", emailStatus: "sent", expiresAt }, 200, origin);
  } catch (error) {
    console.error("confirm-sales-contract", error);
    return jsonResponse({ error: "Contract could not be confirmed" }, 500, origin);
  }
});
