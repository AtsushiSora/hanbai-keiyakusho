const ORDER_AUTO_EMAIL = "sora29128616@gmail.com";
const DEFAULT_CRYPTO_ITERATIONS = 200000;

let loadedContract = null;
let isDrawing = false;
let hasSignature = false;

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
    showError("契約データを開けませんでした。URL、パスコード、有効期限を確認してください。");
  }
}

function renderContract() {
  const data = loadedContract?.data || {};
  document.querySelector("#customerName").value = data.buyerName || "";
  document.querySelector("#summaryList").innerHTML = [
    summaryRow("買主氏名", data.buyerName),
    summaryRow("電話番号", data.buyerPhone),
    summaryRow("メール", data.buyerEmail),
    summaryRow("住所", data.buyerAddress),
    summaryRow("車名", [data.vehicleName, data.vehicleGrade].filter(Boolean).join(" ")),
    summaryRow("年式", data.vehicleYear),
    summaryRow("車台番号", data.vehicleVin),
    summaryRow("登録番号", data.vehiclePlate),
    summaryRow("走行距離", data.vehicleMileage),
    summaryRow("総支払額", formatYen(data.totalPrice || calculateTotal(data))),
    summaryRow("支払方法", data.paymentMethod),
    summaryRow("納車予定日", data.deliveryDate),
    summaryRow("保証", [data.warrantyType, data.warrantyPeriod].filter(Boolean).join(" / ")),
    summaryRow("特記事項", data.specialNotes),
  ].join("");

  document.querySelector("#consentUnlock").hidden = true;
  document.querySelector("#consentError").hidden = true;
  document.querySelector("#consentSummary").hidden = false;
  document.querySelector("#consentChecks").hidden = false;
  document.querySelector("#customerSignSection").hidden = false;
}

function completeConsent() {
  const customerName = document.querySelector("#customerName")?.value.trim();
  const checks = Array.from(document.querySelectorAll("[name='customerConsent']"));
  const allChecked = checks.length && checks.every((item) => item.checked);
  const hasError = !customerName || !allChecked || !hasSignature;

  document.querySelector("#consentChecksError").hidden = allChecked;
  document.querySelector("#signatureError").hidden = !hasError;
  if (hasError) {
    return;
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
    ...checks.map((item) => `・${item.value}`),
  ].join("\n");
  window.location.href = `mailto:${ORDER_AUTO_EMAIL}?subject=${encodeURIComponent("販売契約確認完了")}&body=${encodeURIComponent(body)}`;
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
