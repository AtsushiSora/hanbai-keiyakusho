import { SUPABASE_CONFIG } from "./src/supabase-config.js";

const status = document.querySelector("#downloadStatus");
const button = document.querySelector("#downloadButton");
let pdfUrl = "";

loadCustomerPdf();

async function loadCustomerPdf() {
  const token = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("d") || "";
  if (!/^[A-Za-z0-9_-]{32}$/.test(token) || !SUPABASE_CONFIG.url) {
    showError("このダウンロードURLは無効です。");
    return;
  }
  try {
    const response = await fetch(`${SUPABASE_CONFIG.url.replace(/\/$/, "")}/functions/v1/download-sales-contract`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    if (!response.ok) throw new Error(`PDF download failed: ${response.status}`);
    const blob = await response.blob();
    if (blob.type !== "application/pdf" || blob.size < 1000) throw new Error("Invalid PDF response");
    pdfUrl = URL.createObjectURL(blob);
    button.href = pdfUrl;
    button.hidden = false;
    status.textContent = "署名済み契約書PDFの準備ができました。";
  } catch (error) {
    console.error(error);
    showError("契約書PDFを開けませんでした。URLの有効期限を確認してください。");
  }
}

function showError(message) {
  status.textContent = message;
  button.hidden = true;
}

window.addEventListener("pagehide", () => {
  if (pdfUrl) URL.revokeObjectURL(pdfUrl);
});
