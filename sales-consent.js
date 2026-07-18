import { isSupabaseConfigured, supabase } from "./src/supabase-client.js";

const ORDER_AUTO_EMAIL = "sora29128616@gmail.com";
const DEFAULT_CRYPTO_ITERATIONS = 200000;

let loadedContract = null;
let isDrawing = false;
let hasSignature = false;
let remoteAccessToken = "";
let remotePasscode = "";

document.querySelector("#unlockConsentButton")?.addEventListener("click", unlockConsent);
document.querySelector("#completeConsentButton")?.addEventListener("click", completeConsent);
document.querySelector("#clearSignatureButton")?.addEventListener("click", clearSignature);
setupSignature();

function base64UrlToBytes(value) {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

function decodeEnvelope() {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const encoded = params.get("payload");
  if (!encoded) {
    return null;
  }
  const bytes = base64UrlToBytes(encoded);
  return JSON.parse(new TextDecoder().decode(bytes));
}

async function deriveDecryptionKey(passcode, salt, iterations) {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(passcode), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: iterations || DEFAULT_CRYPTO_ITERATIONS, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );
}

async function decryptEnvelope(envelope, passcode) {
  const salt = base64UrlToBytes(envelope.salt);
  const iv = base64UrlToBytes(envelope.iv);
  const ciphertext = base64UrlToBytes(envelope.ciphertext);
  const key = await deriveDecryptionKey(passcode, salt, envelope.iterations);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return JSON.parse(new TextDecoder().decode(plaintext));
}

async function unlockConsent() {
  const passcode = document.querySelector("#consentPasscodeInput")?.value.trim();
  if (!passcode) {
    showError("開封パスコードを入力してください。");
    return;
  }

  try {
    const token = getRemoteToken();
    if (token && isSupabaseConfigured()) {
      await unlockSupabaseConsent(token, passcode.replaceAll("-", ""));
      return;
    }
    const envelope = decodeEnvelope();
    if (!envelope?.ciphertext || !envelope?.salt || !envelope?.iv) {
      throw new Error("Missing payload");
    }
    loadedContract = await decryptEnvelope(envelope, passcode.replaceAll("-", ""));
    if (loadedContract.expiresAt && Date.now() > loadedContract.expiresAt) {
      throw new Error("Expired");
    }
    renderContract();
  } catch {
    loadedContract = null;
    showError("書類データを開けませんでした。URL、パスコード、有効期限を確認してください。");
  }
}

function getRemoteToken() {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return params.get("token") || "";
}

async function unlockSupabaseConsent(token, passcode) {
  const { data, error } = await supabase.rpc("read_order_auto_remote_contract", {
    p_access_token: token,
    p_passcode: passcode,
  });
  const row = data?.[0];
  if (error || !row?.contract_data) {
    throw new Error("Remote contract unavailable");
  }

  remoteAccessToken = token;
  remotePasscode = passcode;
  loadedContract = {
    source: "supabase",
    remoteId: row.remote_id,
    contractId: row.contract_id,
    expiresAt: new Date(row.expires_at).getTime(),
    data: row.contract_data,
  };
  renderContract();
}

function renderContract() {
  const data = loadedContract?.data || {};
  const isEstimate = isEstimateDocument(data);
  updateConsentPageCopy(isEstimate);
  document.querySelector("#customerName").value = data.buyerName || "";
  const summaryRows = [
    summaryRow("買主氏名", data.buyerName),
    summaryRow("電話番号", data.buyerPhone),
    summaryRow("メール", data.buyerEmail),
    summaryRow("住所", data.buyerAddress),
    summaryRow("車名", [data.vehicleName, data.vehicleGrade].filter(Boolean).join(" ")),
    summaryRow("年式", data.vehicleYear),
    summaryRow("車台番号", data.vehicleVin),
    summaryRow("登録番号", data.vehiclePlate),
    summaryRow("走行距離", data.vehicleMileage),
    summaryRow(isEstimate ? "お見積総額" : "総支払額", formatYen(data.totalPrice || calculateTotal(data))),
  ];
  if (isEstimate) {
    summaryRows.push(
      summaryRow("見積日", data.estimateDate),
      summaryRow("有効期限", data.validUntil),
    );
  } else {
    summaryRows.push(
      summaryRow("支払方法", data.paymentMethod),
      summaryRow("納車予定日", data.deliveryDate),
      summaryRow("保証", [data.warrantyType, data.warrantyPeriod].filter(Boolean).join(" / ")),
      summaryRow("特記事項", data.specialNotes),
    );
  }
  document.querySelector("#summaryList").innerHTML = summaryRows.join("");

  document.querySelector("#consentUnlock").hidden = true;
  document.querySelector("#consentError").hidden = true;
  document.querySelector("#consentSummary").hidden = false;
  document.querySelector("#estimateNotice").hidden = !isEstimate;
  document.querySelector("#consentChecks").hidden = isEstimate;
  document.querySelector("#customerSignSection").hidden = isEstimate;
}

async function completeConsent() {
  if (isEstimateDocument(loadedContract?.data)) {
    showError("見積書は内容確認のみです。電子署名は必要ありません。");
    return;
  }
  const customerName = document.querySelector("#customerName")?.value.trim();
  const checks = Array.from(document.querySelectorAll("[name='customerConsent']"));
  const allChecked = checks.length && checks.every((item) => item.checked);
  const hasError = !customerName || !allChecked || !hasSignature;

  document.querySelector("#consentChecksError").hidden = allChecked;
  document.querySelector("#signatureError").hidden = !hasError;
  if (hasError) {
    return;
  }

  const consentItems = checks.map((item) => item.value);
  if (loadedContract?.source === "supabase") {
    const completeButton = document.querySelector("#completeConsentButton");
    completeButton.disabled = true;
    showCompletionStatus("署名を保存しています。");
    try {
      const canvas = document.querySelector("#customerSignature");
      const { data: completed, error } = await supabase.rpc("complete_order_auto_remote_contract", {
        p_access_token: remoteAccessToken,
        p_passcode: remotePasscode,
        p_signer_name: customerName,
        p_consent_items: consentItems,
        p_signature_data_url: canvas.toDataURL("image/png"),
      });
      if (error || completed !== true) {
        throw new Error("Remote contract completion failed");
      }
    } catch {
      completeButton.disabled = false;
      showCompletionStatus("");
      showError("契約を完了できませんでした。URLの有効期限を確認し、もう一度お試しください。");
      return;
    }
    showCompletionStatus("署名と同意内容を保存し、契約を完了しました。");
  }

  const data = loadedContract?.data || {};
  const body = [
    "販売契約の確認が完了しました。",
    "",
    `買主氏名: ${customerName}`,
    `車両: ${[data.vehicleName, data.vehicleGrade].filter(Boolean).join(" ") || "未入力"}`,
    `総支払額: ${formatYen(data.totalPrice || calculateTotal(data)) || "未入力"}`,
    `確認日時: ${new Date().toLocaleString("ja-JP")}`,
    "",
    "確認項目:",
    ...consentItems.map((item) => `・${item}`),
  ].join("\n");
  window.location.href = `mailto:${ORDER_AUTO_EMAIL}?subject=${encodeURIComponent("販売契約確認完了")}&body=${encodeURIComponent(body)}`;
}

function showCompletionStatus(message) {
  const status = document.querySelector("#consentCompletionStatus");
  if (status) {
    status.textContent = message;
  }
}

function setupSignature() {
  const canvas = document.querySelector("#customerSignature");
  if (!canvas) {
    return;
  }
  const context = canvas.getContext("2d");
  context.lineWidth = 4;
  context.lineCap = "round";
  context.strokeStyle = "#17211f";

  function point(event) {
    const rect = canvas.getBoundingClientRect();
    const touch = event.touches?.[0];
    const clientX = touch ? touch.clientX : event.clientX;
    const clientY = touch ? touch.clientY : event.clientY;
    return {
      x: ((clientX - rect.left) / rect.width) * canvas.width,
      y: ((clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function start(event) {
    event.preventDefault();
    isDrawing = true;
    const next = point(event);
    context.beginPath();
    context.moveTo(next.x, next.y);
  }

  function move(event) {
    if (!isDrawing) {
      return;
    }
    event.preventDefault();
    const next = point(event);
    context.lineTo(next.x, next.y);
    context.stroke();
    hasSignature = true;
  }

  canvas.addEventListener("mousedown", start);
  canvas.addEventListener("mousemove", move);
  window.addEventListener("mouseup", () => {
    isDrawing = false;
  });
  canvas.addEventListener("touchstart", start, { passive: false });
  canvas.addEventListener("touchmove", move, { passive: false });
  window.addEventListener("touchend", () => {
    isDrawing = false;
  });
}

function clearSignature() {
  const canvas = document.querySelector("#customerSignature");
  const context = canvas?.getContext("2d");
  context?.clearRect(0, 0, canvas.width, canvas.height);
  hasSignature = false;
}

function isEstimateDocument(data = {}) {
  return data.documentType === "見積書";
}

function updateConsentPageCopy(isEstimate) {
  const copy = isEstimate
    ? {
      brandTitle: "オーダーオート 見積確認",
      kicker: "Estimate",
      pageTitle: "見積内容の確認",
      introduction: "メール・LINEで届いた確認URLと、別途案内された開封パスコードを使って見積内容を確認してください。",
      summaryTitle: "見積概要",
      browserTitle: "見積内容の確認｜オーダーオート",
    }
    : {
      brandTitle: "オーダーオート 契約確認",
      kicker: "Agreement",
      pageTitle: "契約内容の確認",
      introduction: "メール・LINEで届いた確認URLと、別途案内された開封パスコードを使って契約内容を確認してください。",
      summaryTitle: "契約概要",
      browserTitle: "販売契約内容の確認｜オーダーオート",
    };
  document.querySelector("#consentBrandTitle").textContent = copy.brandTitle;
  document.querySelector("#consentPageKicker").textContent = copy.kicker;
  document.querySelector("#consentPageTitle").textContent = copy.pageTitle;
  document.querySelector("#consentPageIntroduction").textContent = copy.introduction;
  document.querySelector("#consentSummaryTitle").textContent = copy.summaryTitle;
  document.title = copy.browserTitle;
}

function summaryRow(label, value) {
  return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value || "未入力")}</dd></div>`;
}

function calculateTotal(data) {
  const total =
    parseAmount(data.basePrice) +
    parseAmount(data.fees) +
    parseAmount(data.taxes) +
    parseAmount(data.recycleFee) -
    parseAmount(data.discount);
  return total > 0 ? String(total) : "";
}

function formatYen(value) {
  const amount = parseAmount(value);
  return amount ? `金 ${amount.toLocaleString("ja-JP")} 円` : "";
}

function parseAmount(value) {
  const amount = Number(String(value || "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(amount) ? amount : 0;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showError(message) {
  const error = document.querySelector("#consentError");
  if (error) {
    error.textContent = message;
    error.hidden = false;
  }
}
