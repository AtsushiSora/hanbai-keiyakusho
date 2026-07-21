const form = document.querySelector("#salesSheetForm");
const recordSelect = document.querySelector("#recordSelect");
const newButton = document.querySelector("#newButton");
const saveButton = document.querySelector("#saveButton");
const deleteButton = document.querySelector("#deleteButton");
const printButton = document.querySelector("#printButton");
const sheetStatus = document.querySelector("#sheetStatus");
const layoutModeControl = document.querySelector("#layoutModeControl");
const layoutGroupSelect = document.querySelector("#layoutGroupSelect");
const optionRows = document.querySelector("#optionRows");
const feeExtraRows = document.querySelector("#feeExtraRows");
const pageParams = new URLSearchParams(window.location.search);
const isPreviewMode = pageParams.get("preview") === "1";
const isSignedMode = pageParams.get("signed") === "1";

const storageKey = "orderAutoSalesSheetRecords";
const draftKey = "orderAutoSalesSheetDraft";
const importKey = "orderAutoSalesTemplateImport";
const companyContact = [
  "オーダーオート",
  "代表者　空 篤志",
  "広島県広島市佐伯区皆賀1-10-20",
  "TEL 080-2912-8616",
].join("\n");
let activeRecordId = "";

if (isPreviewMode) {
  document.body.classList.add("preview-embed");
}

const layoutFieldGroups = {
  customer: [
    "estimateDate", "validUntil", "estimateNo", "controlNo", "carType",
    "buyerKana", "buyerName", "buyerZip", "buyerAddress", "buyerBirthday",
    "buyerPhone", "buyerMobile", "buyerEmail", "buyerWorkplace", "notice",
    "warranty", "inspectionStatus", "repairHistory",
  ],
  vehicle: [
    "vehicleName", "vehicleGrade", "vehicleYear", "mission", "equipment", "vin",
    "engineSize", "mileage", "capacity", "inspectionDate", "plateNo", "bodyColor",
  ],
  price: [
    "basePrice", "discount", "discountLabel", "storeDeliveryPrice", "customPrice", "vehicleTotal",
  ],
  expenses: [
    "taxInsurance", "salesExpense", "otherExpense", "optionalExpense", "expenseTotal",
    "paymentTotal", "includedTax", "autoTaxMonth", "autoTaxAmount", "weightTax",
    "liabilityInsuranceMonth", "liabilityInsurance", "inspectionRegisterFee",
    "parkingCertificateFee", "autoTaxAdjustment", "liabilityAdjustment",
    "fundManagementFee", "parkingActualFee", "parkingCertificateActualFee", "recycleDeposit",
  ],
  trade: [
    "tradePrice", "unpaidAutoTax", "tradeDebt", "tradeTotal", "afterTradeTotal",
    "tradeVehicleYear", "tradeVehicleName", "tradeVehicleGrade", "tradeModelCode",
    "tradePlateNo", "tradeVin", "tradeInspectionDate", "tradeMileage", "tradeBodyColor", "tradeMemo",
  ],
  loan: ["cashPayment", "loanPrincipal", "loanFee", "paymentInputTotal"],
  recycle: [
    "recycleStatus", "recycleManagementFee", "shredderFee", "airbagFee",
    "fluorocarbonFee", "recycleInfoFee", "recycleTotal",
  ],
  notes: ["contactMemo", "memo"],
};

createRepeatingRows();
setupLayoutMode();
setDefaultValues();
restoreDraft();
const importedContract = consumeImportedContract();
setValueIfEmpty("contactMemo", companyContact);
renderRecordOptions(activeRecordId);
calculateTotals();
if (isSignedMode) {
  setupSignedDocumentMode();
}
setupPreviewBridge();
if (importedContract?.autoPrint) {
  schedulePrint();
}

form?.addEventListener("input", () => {
  saveDraft();
  calculateTotals();
});
form?.addEventListener("change", () => {
  saveDraft();
  calculateTotals();
});
recordSelect?.addEventListener("change", loadSelectedRecord);
newButton?.addEventListener("click", startNew);
saveButton?.addEventListener("click", saveRecord);
deleteButton?.addEventListener("click", deleteRecord);
printButton?.addEventListener("click", () => window.print());

function setupLayoutMode() {
  const params = new URLSearchParams(window.location.search);
  if (!params.has("layout")) {
    return;
  }

  document.body.classList.add("layout-adjustment");
  layoutModeControl.hidden = false;
  const requestedGroup = params.get("layout") || "customer";
  const validGroup = requestedGroup === "all" || Object.prototype.hasOwnProperty.call(layoutFieldGroups, requestedGroup)
    ? requestedGroup
    : "customer";
  layoutGroupSelect.value = validGroup;
  applyLayoutGroup(layoutGroupSelect.value);

  layoutGroupSelect.addEventListener("change", () => {
    const group = layoutGroupSelect.value;
    params.set("layout", group);
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
    applyLayoutGroup(group);
  });
}

function setupPreviewBridge() {
  if (!isPreviewMode || window.parent === window) {
    return;
  }
  window.addEventListener("message", (event) => {
    if (
      event.origin !== window.location.origin
      || event.source !== window.parent
      || event.data?.type !== "order-auto-preview-data"
      || !event.data.data
    ) {
      return;
    }
    form.reset();
    setDefaultValues();
    applyFormData(event.data.data);
    calculateTotals();
  });
  window.parent.postMessage({ type: "order-auto-preview-ready" }, window.location.origin);
}

function applyLayoutGroup(group) {
  const sheet = document.querySelector(".pdf-template-sheet");
  if (!sheet) {
    return;
  }

  sheet.classList.toggle("layout-mode", group !== "all");
  const visibleFields = new Set(layoutFieldGroups[group] || []);
  sheet.querySelectorAll(".tpl-field, .tpl-output").forEach((field) => {
    const key = field.name || field.id;
    const isOption = group === "options" && /^option(?:Name|Price)\d+$/.test(key);
    field.classList.toggle("layout-hidden", group !== "all" && !visibleFields.has(key) && !isOption);
  });
}

function createRepeatingRows() {
  if (optionRows) {
    optionRows.innerHTML = Array.from({ length: 14 }, (_, index) => {
      const number = index + 1;
      return `
        <label class="option-line">
          <input name="optionName${number}" aria-label="オプション${number} 内容" />
          <input name="optionPrice${number}" aria-label="オプション${number} 金額" inputmode="numeric" />
        </label>
      `;
    }).join("");
  }

  if (feeExtraRows) {
    feeExtraRows.innerHTML = Array.from({ length: 8 }, (_, index) => {
      const number = index + 1;
      return `
        <label class="option-line">
          <input name="feeName${number}" aria-label="追加諸費用${number} 内容" />
          <input name="feePrice${number}" aria-label="追加諸費用${number} 金額" inputmode="numeric" />
        </label>
      `;
    }).join("");
  }
}

function setDefaultValues() {
  setValueIfEmpty("documentType", "契約書");
  setValueIfEmpty("estimateDate", new Date().toISOString().slice(0, 10));
  setValueIfEmpty("carType", "中古車");
  setValueIfEmpty("warranty", "なし");
  setValueIfEmpty("contactMemo", companyContact);
}

function setValueIfEmpty(name, value) {
  const field = form?.elements[name];
  if (field && !field.value) {
    field.value = value;
  }
}

function saveRecord() {
  if (!form) {
    return;
  }

  const records = getRecords();
  const data = getFormData();
  const id = activeRecordId || createRecordId();
  const now = new Date().toISOString();
  const existing = records.find((record) => record.id === id);
  const record = {
    id,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    data,
  };
  const nextRecords = [record, ...records.filter((item) => item.id !== id)].slice(0, 100);

  if (!writeStorage(storageKey, JSON.stringify(nextRecords))) {
    setStatus("保存できませんでした。ブラウザの保存設定を確認してください。");
    return;
  }

  activeRecordId = id;
  renderRecordOptions(id);
  removeStorage(draftKey);
  setStatus(existing ? "上書き保存しました。" : "新規保存しました。");
}

function loadSelectedRecord() {
  const id = recordSelect?.value || "";
  if (!id) {
    activeRecordId = "";
    setStatus("新規作成モードです。");
    return;
  }

  const record = getRecords().find((item) => item.id === id);
  if (!record) {
    activeRecordId = "";
    renderRecordOptions();
    setStatus("選択した帳票を読み込めませんでした。");
    return;
  }

  activeRecordId = id;
  applyFormData(record.data || {});
  saveDraft();
  calculateTotals();
  setStatus("保存済み帳票を読み込みました。");
}

function startNew() {
  if (!window.confirm("入力中の内容をクリアして新規作成します。よろしいですか。")) {
    return;
  }

  activeRecordId = "";
  form.reset();
  setDefaultValues();
  removeStorage(draftKey);
  renderRecordOptions();
  calculateTotals();
  setStatus("新規作成を開始しました。");
}

function deleteRecord() {
  if (!activeRecordId) {
    setStatus("削除する保存済み帳票を選択してください。");
    return;
  }

  const record = getRecords().find((item) => item.id === activeRecordId);
  const label = record ? getRecordLabel(record) : "選択した帳票";
  if (!window.confirm(`${label}を削除します。よろしいですか。`)) {
    return;
  }

  const records = getRecords().filter((item) => item.id !== activeRecordId);
  writeStorage(storageKey, JSON.stringify(records));
  activeRecordId = "";
  renderRecordOptions();
  setStatus("削除しました。");
}

function renderRecordOptions(selectedId = "") {
  if (!recordSelect) {
    return;
  }

  const records = getRecords();
  recordSelect.innerHTML = [
    '<option value="">新規作成</option>',
    ...records.map((record) => `<option value="${escapeHtml(record.id)}">${escapeHtml(getRecordLabel(record))}</option>`),
  ].join("");
  recordSelect.value = selectedId;
}

function getRecordLabel(record) {
  const data = record.data || {};
  const date = formatDateTime(record.updatedAt || record.createdAt);
  const buyer = data.buyerName || "お客様未入力";
  const vehicle = data.vehicleName || "車両未入力";
  const total = formatYen(getPaymentTotal(data));
  return `${date} / ${buyer} / ${vehicle} / ${total}`;
}

function getRecords() {
  try {
    const records = JSON.parse(localStorage.getItem(storageKey) || "[]");
    return Array.isArray(records) ? records : [];
  } catch {
    removeStorage(storageKey);
    return [];
  }
}

function getFormData() {
  return Object.fromEntries(new FormData(form).entries());
}

function applyFormData(data) {
  Object.entries(data).forEach(([name, value]) => {
    const field = form.elements[name];
    if (field) {
      field.value = value;
    }
  });
  setValueIfEmpty("contactMemo", companyContact);
}

function saveDraft() {
  try {
    sessionStorage.setItem(draftKey, JSON.stringify({ activeRecordId, data: getFormData() }));
  } catch {
    // 下書き保存に失敗しても帳票入力は続けられる。
  }
}

function restoreDraft() {
  try {
    const draft = JSON.parse(sessionStorage.getItem(draftKey) || "{}");
    if (draft?.data) {
      activeRecordId = draft.activeRecordId || "";
      applyFormData(draft.data);
    }
  } catch {
    removeStorage(draftKey);
  }
}

function consumeImportedContract() {
  try {
    const payload = JSON.parse(sessionStorage.getItem(importKey) || "{}");
    sessionStorage.removeItem(importKey);
    const importedData = payload?.rawContractData
      ? mapRawContractToTemplate(payload.rawContractData)
      : payload?.data;
    if (!importedData) {
      return null;
    }

    activeRecordId = "";
    form.reset();
    setDefaultValues();
    applyFormData({
      ...importedData,
      signatureDataUrl: payload.signatureDataUrl || importedData.signatureDataUrl || "",
      signerName: payload.signerName || importedData.signerName || "",
      signedAt: payload.signedAt || importedData.signedAt || "",
    });
    saveDraft();
    setStatus(isSignedMode
      ? "電子署名を反映した署名済み契約書です。印刷画面からPDF保存または印刷できます。"
      : "契約書作成ページの内容を帳票型PDFへ転記しました。");
    return payload;
  } catch {
    removeStorage(importKey);
    return null;
  }
}

function mapRawContractToTemplate(data) {
  const totalPrice = data.totalPrice || calculateRawContractTotal(data);
  return {
    documentType: data.documentType || "契約書",
    estimateDate: data.estimateDate || data.contractDate || new Date().toISOString().slice(0, 10),
    validUntil: data.validUntil || "",
    estimateNo: data.estimateNo || "",
    controlNo: data.controlNo || "",
    carType: data.carType || "中古車",
    buyerKana: data.buyerKana || "",
    buyerName: data.buyerName || "",
    buyerZip: data.buyerZip || "",
    buyerBirthday: formatTemplateDate(data.buyerBirthday),
    buyerPhone: data.buyerPhone || "",
    buyerMobile: data.buyerMobile || "",
    buyerEmail: data.buyerEmail || "",
    buyerWorkplace: data.buyerWorkplace || "",
    buyerAddress: data.buyerAddress || "",
    notice: data.notice || data.specialNotes || "",
    warranty: buildTemplateWarranty(data),
    inspectionStatus: data.inspectionStatus || "",
    repairHistory: [data.repairHistory, data.repairDetail].filter(Boolean).join(" / "),
    vehicleName: data.vehicleName || "",
    vehicleGrade: data.vehicleGrade || "",
    vehicleYear: data.vehicleYear || "",
    vin: data.vehicleVin || "",
    engineSize: formatTemplateMeasurement(data.engineSize, "cc"),
    mileage: formatTemplateMeasurement(data.vehicleMileage, "km"),
    inspectionDate: formatTemplateDate(data.inspectionDate),
    plateNo: data.vehiclePlate || "",
    mission: data.mission || "",
    capacity: data.capacity || "",
    bodyColor: data.vehicleColor || "",
    equipment: data.equipment || "",
    basePrice: data.basePrice || "",
    storeDeliveryPrice: data.basePrice || "",
    dealerOptionPrice: data.dealerOptionPrice || "",
    makerOptionPrice: data.makerOptionPrice || "",
    ...Object.fromEntries(range(14).flatMap((number) => [
      [`optionName${number}`, data[`optionName${number}`] || ""],
      [`optionPrice${number}`, data[`optionPrice${number}`] || ""],
    ])),
    customPrice: data.customPrice || "",
    discount: data.discount || "",
    taxInsurance: data.taxInsurance || data.taxes || "",
    salesExpense: data.salesExpense || data.fees || "",
    otherExpense: data.otherExpense || "",
    optionalExpense: data.optionalExpense || "",
    includedTax: data.includedTax || calculateTemplateIncludedTax(totalPrice),
    autoTaxMonth: data.autoTaxMonth || "",
    autoTaxAmount: data.autoTaxAmount || "",
    weightTax: data.weightTax || "",
    liabilityInsuranceMonth: data.liabilityInsuranceMonth || "",
    liabilityInsurance: data.liabilityInsurance || "",
    inspectionRegisterFee: data.inspectionRegisterFee || "",
    parkingCertificateFee: data.parkingCertificateFee || "",
    autoTaxAdjustment: data.autoTaxAdjustment || "",
    liabilityAdjustment: data.liabilityAdjustment || "",
    fundManagementFee: data.fundManagementFee || "",
    parkingActualFee: data.parkingActualFee || "",
    parkingCertificateActualFee: data.parkingCertificateActualFee || "",
    recycleDeposit: data.recycleDeposit || data.recycleFee || "",
    depositTotal: data.depositTotal || calculateRawRecycleTotal(data),
    cashPayment: data.cashPayment || totalPrice || "",
    loanPrincipal: data.loanPrincipal || "",
    loanFee: data.loanFee || "",
    tradePrice: data.tradePrice || "",
    unpaidAutoTax: data.unpaidAutoTax || "",
    tradeDebt: data.tradeDebt || "",
    tradeVehicleYear: data.tradeVehicleYear || "",
    tradeVehicleName: data.tradeVehicleName || "",
    tradeVehicleGrade: data.tradeVehicleGrade || "",
    tradeModelCode: data.tradeModelCode || "",
    tradePlateNo: data.tradePlateNo || "",
    tradeVin: data.tradeVin || "",
    tradeInspectionDate: formatTemplateDate(data.tradeInspectionDate),
    tradeMileage: formatTemplateMeasurement(data.tradeMileage, "km"),
    tradeBodyColor: data.tradeBodyColor || "",
    tradeMemo: data.tradeMemo || "",
    recycleStatus: data.recycleStatus || "",
    recycleManagementFee: data.recycleManagementFee || "",
    shredderFee: data.shredderFee || "",
    airbagFee: data.airbagFee || "",
    fluorocarbonFee: data.fluorocarbonFee || "",
    recycleInfoFee: data.recycleInfoFee || "",
    paymentMethod: data.paymentMethod || "",
    paymentDue: data.paymentDue || "",
    bankAccount: data.bankAccount || "",
    contactMemo: data.contactMemo || companyContact,
    memo: data.memo || data.specialNotes || "",
  };
}

function calculateRawContractTotal(data) {
  const detailedOptions = sum(range(14).map((number) => data[`optionPrice${number}`]));
  const summaryOptions = sum([data.dealerOptionPrice, data.makerOptionPrice, data.customPrice]);
  const summaryExpenses = sum([data.taxInsurance, data.salesExpense, data.otherExpense, data.optionalExpense]);
  const detailedExpenses = sum([
    data.taxes, data.fees, data.recycleFee, data.autoTaxAmount, data.weightTax,
    data.liabilityInsurance, data.inspectionRegisterFee, data.parkingCertificateFee,
    data.autoTaxAdjustment, data.liabilityAdjustment, data.fundManagementFee,
    data.parkingActualFee, data.parkingCertificateActualFee, data.recycleDeposit,
  ]);
  const total = parseAmount(data.basePrice)
    + (detailedOptions || summaryOptions)
    + (summaryExpenses || detailedExpenses)
    - parseAmount(data.discount);
  return total > 0 ? String(total) : "";
}

function calculateRawRecycleTotal(data) {
  const total = sum([
    data.recycleManagementFee,
    data.shredderFee,
    data.airbagFee,
    data.fluorocarbonFee,
    data.recycleInfoFee,
  ]);
  return total > 0 ? String(total) : "";
}

function calculateTemplateIncludedTax(value) {
  const total = parseAmount(value);
  return total > 0 ? String(Math.floor(total / 11)) : "";
}

function formatTemplateDate(value) {
  const text = String(value || "");
  const dateMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateMatch) {
    return `${dateMatch[1]}年${Number(dateMatch[2])}月${Number(dateMatch[3])}日`;
  }
  const monthMatch = text.match(/^(\d{4})-(\d{2})$/);
  return monthMatch ? `${monthMatch[1]}年${Number(monthMatch[2])}月` : text;
}

function formatTemplateMeasurement(value, unit) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }
  const digits = text.replace(/\D/g, "");
  return digits ? `${Number(digits).toLocaleString("ja-JP")} ${unit}` : text;
}

function buildTemplateWarranty(data) {
  const warranty = data.warranty || data.warrantyType || "";
  const period = data.warrantyPeriod || "";
  const mileage = formatTemplateMeasurement(data.warrantyMileage, "km");
  return [warranty, period, mileage].filter(Boolean).join(" / ");
}

function schedulePrint() {
  const image = document.querySelector(".pdf-template-sheet > img");
  const print = () => {
    setTimeout(() => window.print(), 350);
  };

  if (!image || image.complete) {
    print();
    return;
  }

  image.addEventListener("load", print, { once: true });
  image.addEventListener("error", print, { once: true });
}

function calculateTotals() {
  const data = getFormData();
  renderDocumentTitle(data);
  updateDiscountRow(data);
  setOutput("vehicleTotal", getVehicleTotal(data));
  setOutput("expenseTotal", getExpenseTotal(data));
  setOutput("paymentTotal", getPaymentTotal(data));
  setOutput("tradeTotal", getTradeTotal(data));
  setOutput("afterTradeTotal", getPaymentTotal(data) - getTradeTotal(data));
  setOutput("paymentInputTotal", getPaymentInputTotal(data));
  setOutput("recycleTotal", getRecycleTotal(data));
  renderElectronicSignature(data);
  fitTemplateFields();
}

function renderDocumentTitle(data) {
  const title = document.querySelector("#documentTitle");
  if (!title) {
    return;
  }
  title.textContent = data.documentType === "見積書" ? "お見積書" : "契約書";
}

function setupSignedDocumentMode() {
  document.body.classList.add("signed-document-mode");
  document.title = "署名済み販売契約書 | オーダーオート";
  form?.querySelectorAll("input, textarea, select").forEach((field) => {
    if (field.type !== "hidden") {
      field.tabIndex = -1;
      field.readOnly = true;
    }
  });
}

function renderElectronicSignature(data) {
  const block = document.querySelector("#electronicSignatureBlock");
  const image = document.querySelector("#electronicSignatureImage");
  const signer = document.querySelector("#electronicSignerName");
  const signedAt = document.querySelector("#electronicSignedAt");
  if (!block || !image || !signer || !signedAt) {
    return;
  }
  const signatureDataUrl = String(data.signatureDataUrl || "");
  const hasValidSignature = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(signatureDataUrl);
  block.hidden = !hasValidSignature;
  document.querySelector(".pdf-template-sheet")?.classList.toggle("has-electronic-signature", hasValidSignature);
  if (!hasValidSignature) {
    image.removeAttribute("src");
    signer.textContent = "";
    signedAt.textContent = "";
    return;
  }
  image.src = signatureDataUrl;
  signer.textContent = `署名者: ${data.signerName || ""}`;
  signedAt.textContent = `署名日時: ${formatSignedDateTime(data.signedAt)}`;
}

function formatSignedDateTime(value) {
  const date = new Date(value || "");
  return Number.isNaN(date.getTime()) ? String(value || "") : date.toLocaleString("ja-JP");
}

function fitTemplateFields() {
  document.querySelectorAll(".tpl-field, .tpl-output").forEach((field) => {
    field.style.removeProperty("font-size");
    const value = "value" in field ? field.value : field.textContent.trim();
    if (!value) {
      return;
    }

    let fontSize = Number.parseFloat(window.getComputedStyle(field).fontSize) || 10;
    const minimumFontSize = 3;
    while (
      fontSize > minimumFontSize
      && (field.scrollWidth > field.clientWidth + 1 || field.scrollHeight > field.clientHeight + 1)
    ) {
      fontSize = Math.max(minimumFontSize, fontSize - 0.5);
      field.style.fontSize = `${fontSize}px`;
    }
  });
}

function getVehicleTotal(data) {
  const vehicleBase = parseAmount(data.storeDeliveryPrice) || parseAmount(data.basePrice);
  const summaryOptions = sum([data.dealerOptionPrice, data.makerOptionPrice, data.customPrice]);
  const detailedOptions = sum(range(14).map((number) => data[`optionPrice${number}`]));
  return vehicleBase + (summaryOptions || detailedOptions) - parseAmount(data.discount);
}

function updateDiscountRow(data) {
  const discountLabel = document.querySelector("#discountLabel");
  if (discountLabel) {
    discountLabel.textContent = parseAmount(data.discount) > 0 ? "値引き" : "";
  }
}

function getExpenseTotal(data) {
  const summaryExpenses = sum([data.taxInsurance, data.salesExpense, data.otherExpense, data.optionalExpense]);
  const detailedExpenses = sum([
    data.taxInsurance,
    data.autoTaxAmount,
    data.weightTax,
    data.liabilityInsurance,
    data.inspectionRegisterFee,
    data.parkingCertificateFee,
    data.autoTaxAdjustment,
    data.liabilityAdjustment,
    data.fundManagementFee,
    data.depositTotal,
    data.parkingActualFee,
    data.parkingCertificateActualFee,
    data.recycleDeposit,
    ...range(8).map((number) => data[`feePrice${number}`]),
  ]);
  return summaryExpenses || detailedExpenses;
}

function getPaymentTotal(data) {
  return getVehicleTotal(data) + getExpenseTotal(data);
}

function getTradeTotal(data) {
  return parseAmount(data.tradePrice) - parseAmount(data.unpaidAutoTax) - parseAmount(data.tradeDebt);
}

function getPaymentInputTotal(data) {
  return sum([data.loanPrincipal, data.loanFee]);
}

function getRecycleTotal(data) {
  return parseAmount(data.depositTotal) || sum([
    data.recycleManagementFee,
    data.shredderFee,
    data.airbagFee,
    data.fluorocarbonFee,
    data.recycleInfoFee,
  ]);
}

function setOutput(id, amount) {
  const output = document.querySelector(`#${id}`);
  if (output) {
    output.value = formatYen(amount);
    output.textContent = formatYen(amount);
  }
}

function sum(values) {
  return values.reduce((total, value) => total + parseAmount(value), 0);
}

function parseAmount(value) {
  const amount = Number(String(value || "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(amount) ? amount : 0;
}

function range(length) {
  return Array.from({ length }, (_, index) => index + 1);
}

function formatYen(amount) {
  return `￥${Math.round(amount).toLocaleString("ja-JP")}`;
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "日時未記録";
  }
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function createRecordId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `sales-sheet-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function setStatus(message) {
  if (sheetStatus) {
    sheetStatus.textContent = message;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function removeStorage(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // noop
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
