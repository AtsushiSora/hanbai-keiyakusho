import { isSupabaseConfigured, supabase } from "./src/supabase-client.js";

const ORDER_AUTO_EMAIL = "info@order-auto.com";
const salesTemplateImportKey = "orderAutoSalesTemplateImport";
const inPersonPasscodeKey = "orderAutoInPersonPasscode";
const isInPersonMode = new URLSearchParams(window.location.search).get("inperson") === "1";
const consentProgress = document.querySelector("#consentProgress");
const consentProgressSteps = document.querySelector("#consentProgressSteps");
const consentDocumentSection = document.querySelector("#consentDocumentSection");
const consentDocumentPreview = document.querySelector("#consentDocumentPreview");
const customerEntrySection = document.querySelector("#customerEntrySection");
const customerEntryForm = document.querySelector("#customerEntryForm");
const customerPostalLookupStatus = document.querySelector("#customerPostalLookupStatus");
const postalCodeApiUrl = "https://zipcloud.ibsnet.co.jp/api/search";

let loadedContract = null;
let isDrawing = false;
let hasSignature = false;
let remoteAccessToken = "";
let remotePasscode = "";
let completedSignature = null;
let completionEmailBody = "";
let customerPostalLookupController = null;
let lastCustomerPostalCode = "";
let lastCustomerAutoAddress = "";

document.querySelector("#unlockConsentButton")?.addEventListener("click", unlockConsent);
document.querySelector("#completeConsentButton")?.addEventListener("click", completeConsent);
document.querySelector("#clearSignatureButton")?.addEventListener("click", clearSignature);
document.querySelector("#viewSignedContractButton")?.addEventListener("click", () => openSignedContract(false));
document.querySelector("#printSignedContractButton")?.addEventListener("click", () => openSignedContract(true));
document.querySelector("#completionEmailButton")?.addEventListener("click", openCompletionEmail);
customerEntryForm?.addEventListener("submit", applyCustomerEntry);
customerEntryForm?.elements.buyerZip?.addEventListener("input", formatCustomerPostalCode);
customerEntryForm?.elements.buyerPhone?.addEventListener("input", formatCustomerPhone);
document.querySelector("#consentChecks")?.addEventListener("focusin", () => setConsentProgress(2));
document.querySelector("#customerSignSection")?.addEventListener("focusin", () => setConsentProgress(3));
document.querySelector("#customerSignSection")?.addEventListener("pointerdown", () => setConsentProgress(3));
document.querySelectorAll("[name='customerConsent']").forEach((item) => {
  item.addEventListener("change", updateConsentProgressFromChecks);
});
consentDocumentPreview?.addEventListener("load", updateConsentDocumentPreview);
window.addEventListener("message", handleConsentPreviewMessage);
setupSignature();
if (isInPersonMode) {
  loadInPersonConsent();
}

async function loadInPersonConsent() {
  const headerAction = document.querySelector("#consentHeaderAction");
  if (headerAction) {
    headerAction.href = "contract-list.html?mode=in-person";
    headerAction.textContent = "契約一覧へ";
  }
  document.querySelector("#consentUnlock").hidden = true;

  try {
    const token = getRemoteToken();
    const passcode = sessionStorage.getItem(inPersonPasscodeKey) || "";
    if (!token || !passcode || !isSupabaseConfigured()) {
      throw new Error("Missing in-person credentials");
    }
    await unlockSupabaseConsent(token, passcode);
  } catch {
    loadedContract = null;
    showError("対面署名の契約データを開けませんでした。契約一覧から選び直してください。");
  }
}

async function unlockConsent() {
  const passcode = document.querySelector("#consentPasscodeInput")?.value.trim();
  if (!passcode) {
    showError("開封パスコードを入力してください。");
    return;
  }

  try {
    const token = getRemoteToken();
    if (!token || !isSupabaseConfigured()) {
      throw new Error("Missing remote credentials");
    }
    await unlockSupabaseConsent(token, passcode.replaceAll("-", ""));
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
  fillCustomerEntryForm(data);
  document.querySelector("#consentUnlock").hidden = true;
  document.querySelector("#consentError").hidden = true;
  if (consentProgress) consentProgress.hidden = false;

  if (!isInPersonMode && !isEstimate) {
    customerEntrySection.hidden = false;
    hideContractReview();
    setConsentProgress(1);
    customerEntryForm?.elements.buyerLastName?.focus();
    return;
  }

  customerEntrySection.hidden = true;
  showContractReview(data, isEstimate);
}

function showContractReview(data, isEstimate) {
  document.querySelector("#customerName").value = data.buyerName || "";
  const summaryRows = [
    summaryRow("買主氏名", data.buyerName),
    summaryRow("フリガナ", data.buyerKana),
    summaryRow("生年月日", data.buyerBirthday),
    summaryRow("郵便番号", data.buyerZip),
    summaryRow("電話番号", data.buyerPhone),
    summaryRow("メール", data.buyerEmail),
    summaryRow("住所", data.buyerAddress),
    summaryRow("勤務先", data.buyerWorkplace),
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

  document.querySelector("#consentSummary").hidden = false;
  if (consentDocumentSection) {
    consentDocumentSection.hidden = false;
  }
  document.querySelector("#estimateNotice").hidden = !isEstimate;
  document.querySelector("#consentChecks").hidden = isEstimate;
  document.querySelectorAll("[name='customerConsent']").forEach((item) => {
    item.checked = false;
    item.disabled = false;
  });
  document.querySelector("#customerSignSection").hidden = true;
  const completeButton = document.querySelector("#completeConsentButton");
  if (completeButton) {
    completeButton.disabled = true;
    completeButton.hidden = false;
  }
  setConsentProgress(!isInPersonMode && !isEstimate ? 2 : 1);
  updateConsentDocumentPreview();
}

function hideContractReview() {
  [
    "#consentSummary",
    "#consentDocumentSection",
    "#estimateNotice",
    "#consentChecks",
    "#customerSignSection",
    "#signedDocumentActions",
  ].forEach((selector) => {
    const element = document.querySelector(selector);
    if (element) element.hidden = true;
  });
}

function fillCustomerEntryForm(data) {
  if (!customerEntryForm) return;
  const [buyerLastName, buyerFirstName] = splitBuyerName(data);
  customerEntryForm.elements.buyerLastName.value = buyerLastName;
  customerEntryForm.elements.buyerFirstName.value = buyerFirstName;
  ["buyerKana", "buyerBirthday", "buyerZip", "buyerAddress", "buyerPhone", "buyerEmail", "buyerWorkplace"]
    .forEach((name) => {
      if (customerEntryForm.elements[name]) customerEntryForm.elements[name].value = data[name] || "";
    });
}

function splitBuyerName(data = {}) {
  const storedLastName = String(data.buyerLastName || "").trim();
  const storedFirstName = String(data.buyerFirstName || "").trim();
  if (storedLastName || storedFirstName) {
    return [storedLastName, storedFirstName];
  }

  const parts = String(data.buyerName || "").trim().split(/\s+/).filter(Boolean);
  return parts.length > 1
    ? [parts[0], parts.slice(1).join(" ")]
    : [parts[0] || "", ""];
}

function applyCustomerEntry(event) {
  event.preventDefault();
  const customerData = getCustomerEntryData();
  const error = validateCustomerEntry(customerData);
  const errorElement = document.querySelector("#customerEntryError");
  if (errorElement) {
    errorElement.hidden = !error;
    errorElement.textContent = error || "";
  }
  if (error) return;

  loadedContract.data = { ...loadedContract.data, ...customerData };
  customerEntrySection.hidden = true;
  showContractReview(loadedContract.data, false);
  document.querySelector("#consentSummary")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function getCustomerEntryData() {
  const formData = new FormData(customerEntryForm);
  const buyerLastName = String(formData.get("buyerLastName") || "").trim();
  const buyerFirstName = String(formData.get("buyerFirstName") || "").trim();
  const customerData = Object.fromEntries(
    ["buyerKana", "buyerBirthday", "buyerZip", "buyerAddress", "buyerPhone", "buyerEmail", "buyerWorkplace"]
      .map((name) => [name, String(formData.get(name) || "").trim()]),
  );
  return {
    buyerLastName,
    buyerFirstName,
    buyerName: [buyerLastName, buyerFirstName].filter(Boolean).join(" "),
    ...customerData,
  };
}

function validateCustomerEntry(data) {
  const postalDigits = data.buyerZip.replace(/\D/g, "");
  const phoneDigits = data.buyerPhone.replace(/\D/g, "");
  if (!data.buyerLastName || !data.buyerFirstName || !data.buyerAddress || !data.buyerPhone || !data.buyerZip || !data.buyerEmail) {
    return "名字・名前・郵便番号・住所・電話番号・メールアドレスは必須です。";
  }
  if (postalDigits.length !== 7) return "郵便番号は7桁で入力してください。";
  if (phoneDigits.length < 10 || phoneDigits.length > 11) return "電話番号を正しく入力してください。";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.buyerEmail)) return "メールアドレスを正しく入力してください。";
  return "";
}

function formatCustomerPostalCode(event) {
  const field = event.currentTarget;
  const digits = field.value.replace(/\D/g, "").slice(0, 7);
  field.value = digits.length > 3 ? `${digits.slice(0, 3)}-${digits.slice(3)}` : digits;
  if (digits.length !== 7) {
    customerPostalLookupController?.abort();
    lastCustomerPostalCode = "";
    setCustomerPostalLookupStatus("");
    return;
  }
  lookupCustomerAddress(digits);
}

async function lookupCustomerAddress(postalCode) {
  if (postalCode === lastCustomerPostalCode) return;

  customerPostalLookupController?.abort();
  customerPostalLookupController = new AbortController();
  const currentController = customerPostalLookupController;
  lastCustomerPostalCode = postalCode;
  setCustomerPostalLookupStatus("住所を検索しています。");

  try {
    const response = await fetch(`${postalCodeApiUrl}?zipcode=${encodeURIComponent(postalCode)}`, {
      signal: currentController.signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`Postal lookup failed: ${response.status}`);

    const payload = await response.json();
    const result = Array.isArray(payload.results) ? payload.results[0] : null;
    if (!result || currentController.signal.aborted) {
      lastCustomerPostalCode = "";
      setCustomerPostalLookupStatus("住所が見つかりませんでした。住所を入力してください。");
      return;
    }

    const postalCodeField = customerEntryForm?.elements.buyerZip;
    const addressField = customerEntryForm?.elements.buyerAddress;
    const currentPostalCode = String(postalCodeField?.value || "").replace(/\D/g, "");
    if (!addressField || currentPostalCode !== postalCode) return;

    const address = [result.address1, result.address2, result.address3].filter(Boolean).join("");
    const currentAddress = String(addressField.value || "").trim();
    if (!address) {
      setCustomerPostalLookupStatus("住所が見つかりませんでした。住所を入力してください。");
      return;
    }
    if (currentAddress && currentAddress !== lastCustomerAutoAddress) {
      setCustomerPostalLookupStatus("住所は入力済みのため変更していません。");
      return;
    }

    addressField.value = address;
    lastCustomerAutoAddress = address;
    addressField.dispatchEvent(new Event("input", { bubbles: true }));
    setCustomerPostalLookupStatus("住所を自動入力しました。番地以降を入力してください。");
  } catch (error) {
    if (error.name !== "AbortError") {
      lastCustomerPostalCode = "";
      setCustomerPostalLookupStatus("住所を検索できませんでした。住所を入力してください。");
    }
  } finally {
    if (customerPostalLookupController === currentController) {
      customerPostalLookupController = null;
    }
  }
}

function setCustomerPostalLookupStatus(message) {
  if (customerPostalLookupStatus) customerPostalLookupStatus.textContent = message;
}

function formatCustomerPhone(event) {
  const field = event.currentTarget;
  const digits = field.value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) field.value = digits;
  else if (digits.length <= 7) field.value = `${digits.slice(0, 3)}-${digits.slice(3)}`;
  else field.value = `${digits.slice(0, 3)}-${digits.slice(3, digits.length - 4)}-${digits.slice(-4)}`;
}

function handleConsentPreviewMessage(event) {
  if (
    event.origin !== window.location.origin
    || event.source !== consentDocumentPreview?.contentWindow
    || event.data?.type !== "order-auto-preview-ready"
  ) {
    return;
  }
  updateConsentDocumentPreview();
}

function updateConsentDocumentPreview() {
  if (!loadedContract?.data || !consentDocumentPreview?.contentWindow) {
    return;
  }
  consentDocumentPreview.contentWindow.postMessage({
    type: "order-auto-preview-data",
    rawContractData: loadedContract.data,
  }, window.location.origin);
}

function updateConsentProgressFromChecks() {
  const checks = Array.from(document.querySelectorAll("[name='customerConsent']"));
  const allChecked = checks.length > 0 && checks.every((item) => item.checked);
  const signSection = document.querySelector("#customerSignSection");
  const completeButton = document.querySelector("#completeConsentButton");
  if (signSection && !isEstimateDocument(loadedContract?.data)) {
    signSection.hidden = !allChecked;
  }
  if (completeButton) {
    completeButton.disabled = !allChecked;
  }
  const stepOffset = !isInPersonMode ? 1 : 0;
  setConsentProgress(allChecked ? 3 + stepOffset : 2 + stepOffset);
}

function setConsentProgress(currentStep) {
  consentProgressSteps?.querySelectorAll("li").forEach((item, index) => {
    const step = index + 1;
    item.classList.toggle("is-complete", step < currentStep);
    item.classList.toggle("is-current", step === currentStep);
    if (step === currentStep) {
      item.setAttribute("aria-current", "step");
    } else {
      item.removeAttribute("aria-current");
    }
  });
}

async function completeConsent() {
  if (isEstimateDocument(loadedContract?.data)) {
    showError("見積書は内容確認のみです。電子署名は必要ありません。");
    return;
  }
  if (loadedContract?.source !== "supabase") {
    showError("契約データを確認できませんでした。確認URLを開き直してください。");
    return;
  }
  const customerName = document.querySelector("#customerName")?.value.trim();
  const customerData = { ...getCustomerEntryData(), buyerName: customerName };
  const checks = Array.from(document.querySelectorAll("[name='customerConsent']"));
  const allChecked = checks.length && checks.every((item) => item.checked);
  const hasError = !customerName || !allChecked || !hasSignature;

  document.querySelector("#consentChecksError").hidden = allChecked;
  document.querySelector("#signatureError").hidden = !hasError;
  if (hasError) {
    setConsentProgress(allChecked ? (isInPersonMode ? 3 : 4) : (isInPersonMode ? 2 : 3));
    return;
  }

  const consentItems = checks.map((item) => item.value);
  const canvas = document.querySelector("#customerSignature");
  const signatureDataUrl = canvas.toDataURL("image/png");
  let completedAt = new Date().toISOString();
  const completeButton = document.querySelector("#completeConsentButton");
  completeButton.disabled = true;
  showCompletionStatus(isInPersonMode ? "署名を保存しています。" : "署名済み契約書PDFを作成しています。");
  try {
    if (isInPersonMode) {
      const { data: completed, error } = await supabase.rpc("complete_order_auto_remote_contract", {
        p_access_token: remoteAccessToken,
        p_passcode: remotePasscode,
        p_signer_name: customerName,
        p_consent_items: consentItems,
        p_signature_data_url: signatureDataUrl,
      });
      if (error || completed !== true) throw new Error("In-person completion failed");
    } else {
      const customerPdfDataUrl = await createSignedCustomerPdf({
        rawContractData: { ...loadedContract.data, ...customerData },
        signerName: customerName,
        signatureDataUrl,
        signedAt: completedAt,
      });
      showCompletionStatus("電子署名と契約書PDFをクラウド保存しています。");
      const { data: submitted, error } = await supabase.functions.invoke("submit-sales-consent", {
        body: {
          accessToken: remoteAccessToken,
          passcode: remotePasscode,
          signerName: customerName,
          consentItems,
          signatureDataUrl,
          customerData,
          customerPdfDataUrl,
        },
      });
      if (error || !submitted?.ok) throw new Error("Remote consent submission failed");
      completedAt = submitted.completedAt || completedAt;
    }
  } catch (error) {
    console.error(error);
    completeButton.disabled = false;
    showCompletionStatus("");
    showError("電子署名と契約書を保存できませんでした。通信状態とURLの有効期限を確認し、もう一度お試しください。");
    return;
  }
  showCompletionStatus(isInPersonMode
    ? "署名と同意内容を保存し、契約を完了しました。"
    : "電子署名を受け付けました。オーダーオートの確認待ちです。");

  loadedContract.data = { ...loadedContract.data, ...customerData };
  const data = loadedContract?.data || {};
  completedSignature = {
    signerName: customerName,
    signatureDataUrl,
    signedAt: completedAt,
  };
  completionEmailBody = [
    isInPersonMode ? "販売契約の確認が完了しました。" : "販売契約の電子署名が完了しました。",
    "",
    `買主氏名: ${customerName}`,
    `車両: ${[data.vehicleName, data.vehicleGrade].filter(Boolean).join(" ") || "未入力"}`,
    `総支払額: ${formatYen(data.totalPrice || calculateTotal(data)) || "未入力"}`,
    `署名日時: ${new Date(completedAt).toLocaleString("ja-JP")}`,
    "",
    "確認項目:",
    ...consentItems.map((item) => `・${item}`),
    ...(!isInPersonMode ? ["", "管理画面で契約内容と署名済みPDFを確認し、「確認完了・メール送信」を押してください。"] : []),
  ].join("\n");
  lockCompletedConsent();
  document.querySelector("#signedDocumentActions").hidden = false;
  setConsentProgress(isInPersonMode ? 4 : 5);
  configureCompletionActions();
}

function createSignedCustomerPdf(payload) {
  return new Promise((resolve, reject) => {
    const requestId = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    const iframe = document.createElement("iframe");
    const timeoutId = window.setTimeout(() => finish(new Error("PDF generation timed out")), 60000);
    function finish(error, dataUrl = "") {
      window.clearTimeout(timeoutId);
      window.removeEventListener("message", handleMessage);
      iframe.remove();
      if (error) reject(error);
      else resolve(dataUrl);
    }
    function handleMessage(event) {
      if (event.origin !== window.location.origin || event.source !== iframe.contentWindow) return;
      if (event.data?.type === "order-auto-pdf-generator-ready") {
        iframe.contentWindow.postMessage({
          type: "order-auto-generate-signed-pdf",
          requestId,
          ...payload,
        }, window.location.origin);
        return;
      }
      if (event.data?.requestId !== requestId) return;
      if (event.data?.type === "order-auto-signed-pdf-error") {
        finish(new Error("PDF generation failed"));
      } else if (event.data?.type === "order-auto-signed-pdf-ready") {
        const dataUrl = String(event.data.dataUrl || "");
        if (!dataUrl.startsWith("data:application/pdf")) {
          finish(new Error("Generated PDF is invalid"));
          return;
        }
        finish(null, dataUrl);
      }
    }
    window.addEventListener("message", handleMessage);
    iframe.title = "署名済み契約書PDF作成";
    iframe.src = "sales-template.html?signed=1&capture=1&v=confirmation1";
    Object.assign(iframe.style, {
      position: "fixed",
      left: "-15000px",
      top: "0",
      width: "1200px",
      height: "1600px",
      border: "0",
      opacity: "0.01",
      pointerEvents: "none",
    });
    document.body.append(iframe);
  });
}

function configureCompletionActions() {
  const title = document.querySelector("#signedDocumentTitle");
  const description = document.querySelector("#signedDocumentDescription");
  const emailButton = document.querySelector("#completionEmailButton");
  if (isInPersonMode) {
    if (title) title.textContent = "4. 契約完了";
    if (description) description.textContent = "ご署名が完了し、契約を保存しました。署名済み契約書を表示またはPDF保存できます。";
    if (emailButton) emailButton.hidden = true;
    return;
  }
  if (title) title.textContent = "5. 電子署名受付・確認依頼";
  if (description) description.textContent = "電子署名を受け付けました。確認依頼メールを送信してください。オーダーオートの確認後、契約完了メールとお客様控えPDFのURLをお送りします。";
  if (emailButton) emailButton.textContent = "確認依頼メールを送信";
  showCompletionStatus("署名と契約書PDFを保存し、オーダーオートの確認待ちになりました。");
}

function openSignedContract(autoPrint) {
  if (!loadedContract?.data || !completedSignature) {
    showError("署名済み契約書を作成できませんでした。もう一度署名を完了してください。");
    return;
  }
  const payload = {
    rawContractData: loadedContract.data,
    ...completedSignature,
    autoPrint,
    importedAt: new Date().toISOString(),
  };
  try {
    sessionStorage.setItem(salesTemplateImportKey, JSON.stringify(payload));
    if (isInPersonMode) {
      sessionStorage.removeItem(inPersonPasscodeKey);
    }
  } catch {
    showError("署名済み契約書を開けませんでした。ブラウザの保存設定を確認してください。");
    return;
  }
  window.location.href = autoPrint
    ? "sales-template.html?signed=1&print=1"
    : "sales-template.html?signed=1";
}

function openCompletionEmail() {
  if (!completionEmailBody) {
    showError("先に電子署名を完了してください。");
    return;
  }
  const subject = isInPersonMode ? "販売契約確認完了" : "【要確認】販売契約の電子署名完了";
  window.location.href = `mailto:${ORDER_AUTO_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(completionEmailBody)}`;
}

function lockCompletedConsent() {
  document.querySelectorAll("[name='customerConsent']").forEach((item) => {
    item.disabled = true;
  });
  const customerName = document.querySelector("#customerName");
  if (customerName) {
    customerName.readOnly = true;
  }
  customerEntryForm?.querySelectorAll("input").forEach((input) => {
    input.readOnly = true;
  });
  const clearButton = document.querySelector("#clearSignatureButton");
  const completeButton = document.querySelector("#completeConsentButton");
  if (clearButton) {
    clearButton.hidden = true;
  }
  if (completeButton) {
    completeButton.hidden = true;
  }
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
  const copy = isInPersonMode && !isEstimate
    ? {
      brandTitle: "オーダーオート 対面電子署名",
      kicker: "In-person Signature",
      pageTitle: "対面電子署名",
      introduction: "契約内容と重要事項をご確認のうえ、タブレットにご署名ください。",
      summaryTitle: "1. 契約内容を確認",
      documentTitle: "契約書・重要事項",
      documentDescription: "1ページ目の契約内容と、2ページ目の特約事項を最後までご確認ください。",
      progressSteps: ["内容確認", "重要事項・チェック", "ご署名", "完了"],
      browserTitle: "対面電子署名｜オーダーオート",
    }
    : isEstimate
    ? {
      brandTitle: "オーダーオート 見積確認",
      kicker: "Estimate",
      pageTitle: "見積内容の確認",
      introduction: "メール・LINEで届いた確認URLと、別途案内された開封パスコードを使って見積内容を確認してください。",
      summaryTitle: "1. 見積内容を確認",
      documentTitle: "お見積書",
      documentDescription: "車両情報とお見積金額をご確認ください。見積書の確認だけでは契約は成立しません。",
      progressSteps: ["見積内容を確認"],
      browserTitle: "見積内容の確認｜オーダーオート",
    }
    : {
      brandTitle: "オーダーオート 契約確認",
      kicker: "Agreement",
      pageTitle: "契約内容の確認",
      introduction: "メール・LINEで届いた確認URLと、別途案内された開封パスコードを使って契約内容を確認してください。",
      summaryTitle: "2. 契約内容を確認",
      documentTitle: "契約書・重要事項",
      documentDescription: "1ページ目の契約内容と、2ページ目の特約事項を最後までご確認ください。",
      progressSteps: ["お客様情報", "内容確認", "重要事項・チェック", "ご署名", "完了"],
      browserTitle: "販売契約内容の確認｜オーダーオート",
    };
  document.querySelector("#consentBrandTitle").textContent = copy.brandTitle;
  document.querySelector("#consentPageKicker").textContent = copy.kicker;
  document.querySelector("#consentPageTitle").textContent = copy.pageTitle;
  document.querySelector("#consentPageIntroduction").textContent = copy.introduction;
  document.querySelector("#consentSummaryTitle").textContent = copy.summaryTitle;
  document.querySelector("#consentDocumentTitle").textContent = copy.documentTitle;
  document.querySelector("#consentDocumentDescription").textContent = copy.documentDescription;
  document.querySelector("#consentChecksTitle").textContent = isInPersonMode || isEstimate ? "2. 確認項目にチェック" : "3. 確認項目にチェック";
  document.querySelector("#customerSignTitle").textContent = isInPersonMode || isEstimate ? "3. ご署名" : "4. ご署名";
  document.querySelector("#signedDocumentTitle").textContent = isInPersonMode || isEstimate ? "4. 契約完了" : "5. 電子署名受付・確認依頼";
  if (consentProgressSteps) {
    consentProgressSteps.style.setProperty("--flow-step-count", copy.progressSteps.length);
    consentProgressSteps.innerHTML = copy.progressSteps
      .map((label, index) => `<li><span>${index + 1}</span><strong>${escapeHtml(label)}</strong></li>`)
      .join("");
  }
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
