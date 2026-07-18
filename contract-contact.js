import { isSupabaseConfigured, supabase } from "./src/supabase-client.js";

const COMPANY = {
  name: "オーダーオート",
  representative: "空 篤志",
  phone: "080-2912-8616",
  address: "広島県広島市佐伯区皆賀1-10-20",
};

const CRYPTO_ITERATIONS = 200000;
const contractDraftKey = "orderAutoContractDraft";

const remoteSelectedContract = document.querySelector("#remoteSelectedContract");
const consentUrlField = document.querySelector("#consentUrl");
const consentPasscodeField = document.querySelector("#consentPasscode");
const emailBody = document.querySelector("#emailBody");
const contactStatus = document.querySelector("#contactStatus");
const generateConsentUrlButton = document.querySelector("#generateConsentUrlButton");
const copyConsentUrlButton = document.querySelector("#copyConsentUrlButton");
const copyConsentPasscodeButton = document.querySelector("#copyConsentPasscodeButton");
const copyLineMessageButton = document.querySelector("#copyLineMessageButton");
const openEmailButton = document.querySelector("#openEmailButton");

renderSelectedContract();
buildEmailBody();

generateConsentUrlButton?.addEventListener("click", generateConsentUrl);
copyConsentUrlButton?.addEventListener("click", copyConsentUrl);
copyConsentPasscodeButton?.addEventListener("click", copyConsentPasscode);
copyLineMessageButton?.addEventListener("click", copyLineMessage);
openEmailButton?.addEventListener("click", openEmail);

function getContractData() {
  try {
    return JSON.parse(sessionStorage.getItem(contractDraftKey) || "{}");
  } catch {
    return {};
  }
}

function hasContractData(data = getContractData()) {
  return Object.values(data || {}).some((value) => String(value || "").trim());
}

function renderSelectedContract() {
  if (!remoteSelectedContract) {
    return;
  }

  const data = getContractData();
  const copy = getDocumentCopy(data);
  updatePageCopy(copy);
  if (!hasContractData(data)) {
    remoteSelectedContract.innerHTML = `
      <div class="remote-empty-state">
        <p>送信する書類が選択されていません。</p>
        <a class="secondary-button" href="contract-create.html">契約書作成へ</a>
      </div>
    `;
    return;
  }

  remoteSelectedContract.innerHTML = `
    <article class="remote-contract-item active">
      <div>
        <span>${copy.numberLabel} ${escapeHtml(data.contractNumber || data.estimateNo || "下書き")}</span>
        <strong>${escapeHtml(data.buyerName || "買主未入力")}</strong>
        <small>${escapeHtml(data.vehicleName || "車両未入力")} / ${copy.documentLabel} / ${escapeHtml(data.remoteStatus || "送信準備")}</small>
      </div>
      <a class="secondary-button compact" href="contract-create.html">${copy.changeLabel}</a>
    </article>
  `;
}

function buildEmailBody() {
  if (!emailBody) {
    return;
  }

  const data = getContractData();
  const copy = getDocumentCopy(data);
  const url = consentUrlField?.value.trim() || "【確認URLをここに入力】";
  const body = [
    `${safePlain(data.buyerName, "お客様")} 様`,
    "",
    "オーダーオートです。",
    copy.emailIntroduction,
    "",
    `車両：${safePlain([data.vehicleName, data.vehicleGrade].filter(Boolean).join(" "))}`,
    `車台番号：${safePlain(data.vehicleVin)}`,
    `${copy.amountLabel}：${formatYen(data.totalPrice || calculateTotal(data)) || "未入力"}`,
    "",
    `確認URL：${url}`,
    "",
    "確認URLは暗号化されています。",
    "開封パスコードは安全のため、このメールには記載していません。",
    copy.emailInstruction,
    consentPasscodeField?.value.trim() ? "" : "※先に「確認URL生成」を押して確認URLとパスコードを作成してください。",
    "",
    COMPANY.name,
    `代表 ${COMPANY.representative}`,
    COMPANY.address,
    `TEL ${COMPANY.phone}`,
  ].join("\n");

  emailBody.value = body;
}

function buildLineMessage() {
  const data = getContractData();
  const copy = getDocumentCopy(data);
  const url = consentUrlField?.value.trim() || "【確認URL】";

  return [
    `${safePlain(data.buyerName, "お客様")} 様`,
    "",
    "オーダーオートです。",
    copy.lineIntroduction,
    "",
    `車両：${safePlain([data.vehicleName, data.vehicleGrade].filter(Boolean).join(" "))}`,
    `${copy.amountLabel}：${formatYen(data.totalPrice || calculateTotal(data)) || "未入力"}`,
    "",
    `確認URL：${url}`,
    "",
    "開封パスコードは安全のため、このLINEには記載していません。",
    copy.lineInstruction,
  ].join("\n");
}

async function generateConsentUrl() {
  const data = getContractData();
  if (!hasContractData(data)) {
    setStatus("契約作成ページで送信する書類を入力してください。");
    return;
  }
  const validationError = getRemoteContractValidationError(data);
  if (validationError) {
    setStatus(validationError);
    return;
  }

  generateConsentUrlButton.disabled = true;
  setStatus("確認URLを生成しています。");
  try {
    const isTestLogin = sessionStorage.getItem("orderAutoTestLogin") === "1";
    if (isSupabaseConfigured() && !isTestLogin) {
      await generateSupabaseConsentUrl(data);
      return;
    }
    await generateEncryptedConsentUrl(data);
  } catch {
    setStatus("確認URLを生成できませんでした。通信状態を確認して、もう一度お試しください。");
  } finally {
    generateConsentUrlButton.disabled = false;
  }
}

function getRemoteContractValidationError(data) {
  const missing = [];
  if (!String(data.buyerName || "").trim()) {
    missing.push("氏名");
  }
  if (!String(data.vehicleName || "").trim()) {
    missing.push("車種名");
  }
  if (!formatYen(data.totalPrice || calculateTotal(data))) {
    missing.push("支払総額");
  }
  if ((data.documentType || "契約書") !== "見積書" && !String(data.vehicleVin || "").trim()) {
    missing.push("車台番号");
  }
  return missing.length
    ? `確認URLを作成する前に、${missing.join("・")}を入力してください。`
    : "";
}

async function generateSupabaseConsentUrl(data) {
  const { data: authData } = await supabase.auth.getSession();
  if (!authData.session?.user) {
    setStatus("Supabaseへログインし直してから確認URLを生成してください。");
    return;
  }
  if (!data.__recordId) {
    const copy = getDocumentCopy(data);
    setStatus(`先に${copy.documentLabel}をクラウド保存し、契約一覧の「${copy.remoteActionLabel}」から開いてください。`);
    return;
  }

  const passcode = generatePasscode();
  const accessToken = generateAccessToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: remoteRows, error } = await supabase.rpc("create_order_auto_remote_contract", {
    p_contract_id: data.__recordId,
    p_access_token: accessToken,
    p_passcode: passcode,
    p_expires_at: expiresAt,
  });

  if (error || !remoteRows?.length) {
    setStatus("確認URLを作成できませんでした。SupabaseのSQLとRLS設定を確認してください。");
    return;
  }

  const url = new URL("sales-consent.html", window.location.href);
  url.hash = `token=${encodeURIComponent(accessToken)}`;
  setGeneratedConsent(url.toString(), passcode);
  setStatus("Supabaseに期限付き確認URLを保存しました。パスコードは別送してください。");
}

async function generateEncryptedConsentUrl(data) {
  const passcode = generatePasscode();
  const payload = {
    id: data.contractNumber || data.estimateNo || `sales-${Date.now()}`,
    createdAt: new Date().toISOString(),
    expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
    data,
    company: COMPANY,
  };
  const encrypted = await encryptPayload(payload, passcode);
  const encoded = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(encrypted)));
  const url = new URL("sales-consent.html", window.location.href);
  url.hash = `payload=${encoded}`;

  setGeneratedConsent(url.toString(), passcode);
  setStatus("テスト用の暗号化URLと開封パスコードを生成しました。パスコードは別送してください。");
}

function setGeneratedConsent(url, passcode) {
  if (consentUrlField) {
    consentUrlField.value = url;
  }
  if (consentPasscodeField) {
    consentPasscodeField.value = passcode;
  }
  buildEmailBody();
}

async function copyConsentUrl() {
  if (!consentUrlField?.value.trim()) {
    await generateConsentUrl();
  }
  if (!consentUrlField?.value.trim()) {
    return;
  }
  await copyText(consentUrlField.value, "お客様確認URLをコピーしました。");
}

async function copyConsentPasscode() {
  if (!consentPasscodeField?.value.trim()) {
    await generateConsentUrl();
  }
  if (!consentPasscodeField?.value.trim()) {
    return;
  }
  await copyText(consentPasscodeField.value, "開封パスコードをコピーしました。URLとは別経路で送ってください。");
}

async function copyLineMessage() {
  if (!consentUrlField?.value.trim()) {
    await generateConsentUrl();
  }
  if (!consentUrlField?.value.trim()) {
    return;
  }
  await copyText(buildLineMessage(), "LINE送信用の文面をコピーしました。パスコードは別送してください。");
}

async function openEmail() {
  if (!consentUrlField?.value.trim()) {
    await generateConsentUrl();
  }
  if (!consentUrlField?.value.trim()) {
    return;
  }

  buildEmailBody();
  const data = getContractData();
  const copy = getDocumentCopy(data);
  const href = `mailto:${encodeURIComponent(data.buyerEmail || "")}?subject=${encodeURIComponent(copy.emailSubject)}&body=${encodeURIComponent(emailBody?.value || "")}`;
  window.location.href = href;
  setStatus("メール作成画面を開きました。パスコードは別送してください。");
}

async function copyText(text, message) {
  try {
    await navigator.clipboard.writeText(text);
    setStatus(message);
  } catch {
    setStatus("コピーできませんでした。欄を選択して手動でコピーしてください。");
  }
}

function bytesToBase64Url(bytes) {
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function generatePasscode() {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const number = bytes.reduce((acc, byte) => acc * 256 + byte, 0) % 100000000;
  return String(number).padStart(8, "0");
}

function generateAccessToken() {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

async function deriveEncryptionKey(passcode, salt) {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(passcode), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: CRYPTO_ITERATIONS, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );
}

async function encryptPayload(payload, passcode) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveEncryptionKey(passcode, salt);
  const encoded = new TextEncoder().encode(JSON.stringify(payload));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);

  return {
    v: 1,
    kdf: "PBKDF2-SHA256",
    iterations: CRYPTO_ITERATIONS,
    salt: bytesToBase64Url(salt),
    iv: bytesToBase64Url(iv),
    ciphertext: bytesToBase64Url(new Uint8Array(ciphertext)),
  };
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
  if (!amount) {
    return "";
  }
  return `金 ${amount.toLocaleString("ja-JP")} 円`;
}

function parseAmount(value) {
  const amount = Number(String(value || "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(amount) ? amount : 0;
}

function safePlain(value, fallback = "未入力") {
  const cleaned = String(value || "").trim();
  return cleaned || fallback;
}

function getDocumentCopy(data = {}) {
  if (data.documentType === "見積書") {
    return {
      documentLabel: "見積書",
      numberLabel: "見積番号",
      changeLabel: "見積書を変更",
      remoteActionLabel: "見積書を送る",
      pageTitle: "メール・LINEで見積書を送信",
      pageKicker: "Remote Estimate",
      amountLabel: "お見積総額",
      emailIntroduction: "車両見積書の内容確認をお願いいたします。",
      emailInstruction: "別途お伝えするパスコードを入力し、見積内容をご確認ください。見積書の確認だけでは契約は成立しません。",
      lineIntroduction: "車両見積書の内容確認をお願いします。",
      lineInstruction: "別途お伝えする8桁のパスコードを入力し、見積内容をご確認ください。見積書の確認だけでは契約は成立しません。",
      emailSubject: "車両見積書のご確認",
    };
  }
  return {
    documentLabel: "契約書",
    numberLabel: "契約番号",
    changeLabel: "契約を変更",
    remoteActionLabel: "メール・LINE契約",
    pageTitle: "メール・LINEで契約",
    pageKicker: "Remote Contract",
    amountLabel: "総支払額",
    emailIntroduction: "車両販売契約の内容確認をお願いいたします。",
    emailInstruction: "別途お伝えするパスコードを入力し、内容をご確認のうえ、重要事項に同意して契約を完了してください。",
    lineIntroduction: "車両販売契約の内容確認をお願いします。",
    lineInstruction: "別途お伝えする8桁のパスコードを入力して確認してください。",
    emailSubject: "車両販売契約内容のご確認",
  };
}

function updatePageCopy(copy) {
  const pageKicker = document.querySelector("#remotePageKicker");
  const pageTitle = document.querySelector("#remotePageTitle");
  if (pageKicker) {
    pageKicker.textContent = copy.pageKicker;
  }
  if (pageTitle) {
    pageTitle.textContent = copy.pageTitle;
  }
  document.title = `${copy.pageTitle}｜オーダーオート`;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setStatus(message) {
  if (contactStatus) {
    contactStatus.textContent = message;
  }
}
