const form = document.querySelector("#contractForm");
const printContractButton = document.querySelector("#printContractButton");
const savePdfButton = document.querySelector("#savePdfButton");
const saveRecordButton = document.querySelector("#saveRecordButton");
const newContractButton = document.querySelector("#newContractButton");
const contractHistorySelect = document.querySelector("#contractHistorySelect");
const deleteRecordButton = document.querySelector("#deleteRecordButton");
const clearAllRecordsButton = document.querySelector("#clearAllRecordsButton");
const contractSaveStatus = document.querySelector("#contractSaveStatus");
const previewStatusLabel = document.querySelector("#previewStatusLabel");
const previewDocumentTypeLabel = document.querySelector("#previewDocumentTypeLabel");
const previewMessage = document.querySelector("#previewMessage");
const previewCopyLabel = document.querySelector("#previewCopyLabel");
const customerCopyButton = document.querySelector("#customerCopyButton");
const shopCopyButton = document.querySelector("#shopCopyButton");
const convertEstimateButton = document.querySelector("#convertEstimateButton");
const completeContractButton = document.querySelector("#completeContractButton");
const salesOptionRows = document.querySelector("#salesOptionRows");
const salesTemplateImportKey = "orderAutoSalesTemplateImport";
const maxSalesOptionRows = 14;

removePersistentDraft();
setDefaultDate();
renderSalesOptionRows(1);
restoreDraft();
renderHistoryOptions();
exposeContractToolApi();

form?.addEventListener("input", handleFormInput);
form?.addEventListener("change", handleFormInput);
printContractButton?.addEventListener("click", () => openSalesTemplate(true));
savePdfButton?.addEventListener("click", () => openSalesTemplate(false));
saveRecordButton?.addEventListener("click", saveContractRecord);
newContractButton?.addEventListener("click", startNewContract);
contractHistorySelect?.addEventListener("change", loadSelectedContractRecord);
deleteRecordButton?.addEventListener("click", deleteSelectedContractRecord);
clearAllRecordsButton?.addEventListener("click", clearAllContractRecords);
customerCopyButton?.addEventListener("click", () => setPreviewCopy("お客様控え"));
shopCopyButton?.addEventListener("click", () => setPreviewCopy("店控え"));
completeContractButton?.addEventListener("click", completeContract);

function setDefaultDate() {
  const today = new Date().toISOString().slice(0, 10);
  const contractDateField = form?.elements.contractDate;
  const estimateDateField = form?.elements.estimateDate;
  if (contractDateField && !contractDateField.value) {
    contractDateField.value = today;
  }
  if (estimateDateField && !estimateDateField.value) {
    estimateDateField.value = today;
  }
}

function getData() {
  if (!form) {
    return {};
  }

  const data = Object.fromEntries(new FormData(form).entries());
  data.totalPrice = data.totalPrice || calculateTotal(data);
  data.depositTotal = data.depositTotal || calculateRecycleTotal(data);
  data.includedTax = data.includedTax || calculateIncludedTax(data.totalPrice);
  return data;
}

function openSalesTemplate(autoPrint = true) {
  const payload = {
    data: mapContractToSalesTemplate(getData()),
    autoPrint,
    importedAt: new Date().toISOString(),
  };

  try {
    sessionStorage.setItem(salesTemplateImportKey, JSON.stringify(payload));
  } catch {
    updateSaveStatus("PDFテンプレートへ転記できませんでした。ブラウザの保存設定を確認してください。");
    return;
  }

  window.location.href = autoPrint ? "sales-template.html?print=1" : "sales-template.html?save=1";
}

function mapContractToSalesTemplate(data) {
  return {
    estimateDate: data.estimateDate || data.contractDate || new Date().toISOString().slice(0, 10),
    validUntil: data.validUntil || "",
    estimateNo: data.estimateNo || "",
    controlNo: data.controlNo || "",
    carType: data.carType || "中古車",
    buyerKana: data.buyerKana || "",
    buyerName: data.buyerName || "",
    buyerZip: data.buyerZip || "",
    buyerBirthday: data.buyerBirthday || "",
    buyerPhone: data.buyerPhone || "",
    buyerMobile: data.buyerMobile || "",
    buyerEmail: data.buyerEmail || "",
    buyerWorkplace: data.buyerWorkplace || "",
    buyerAddress: data.buyerAddress || "",
    notice: data.notice || data.specialNotes || "",
    warranty: buildWarrantyText(data),
    inspectionStatus: data.inspectionStatus || "",
    repairHistory: buildRepairText(data),
    vehicleName: data.vehicleName || "",
    vehicleGrade: data.vehicleGrade || "",
    vehicleYear: data.vehicleYear || "",
    fullModel: data.fullModel || data.vehicleModel || "",
    modelCode: data.modelCode || data.vehicleModel || "",
    vin: data.vehicleVin || "",
    engineSize: data.engineSize || "",
    mileage: data.vehicleMileage || "",
    inspectionDate: data.inspectionDate || "",
    plateNo: data.vehiclePlate || "",
    mission: data.mission || "",
    doorCount: data.doorCount || "",
    capacity: data.capacity || "",
    bodyColor: data.vehicleColor || "",
    equipment: data.equipment || "",
    basePrice: data.basePrice || "",
    storeDeliveryPrice: data.storeDeliveryPrice || data.basePrice || "",
    dealerOptionPrice: data.dealerOptionPrice || "",
    makerOptionPrice: data.makerOptionPrice || "",
    ...getOptionTemplateData(data),
    customPrice: data.customPrice || "",
    taxInsurance: data.taxInsurance || data.taxes || "",
    salesExpense: data.salesExpense || data.fees || "",
    otherExpense: data.otherExpense || "",
    optionalExpense: data.optionalExpense || "",
    includedTax: data.includedTax || calculateIncludedTax(data.totalPrice || calculateTotal(data)),
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
    recycleDeposit: data.recycleDeposit || data.recycleFee || "",
    depositTotal: data.depositTotal || calculateRecycleTotal(data),
    cashPayment: data.cashPayment || data.totalPrice || calculateTotal(data) || "",
    loanDownPayment: data.loanDownPayment || data.downPayment || "",
    loanFee: data.loanFee || "",
    tradePrice: data.tradePrice || "",
    unpaidAutoTax: data.unpaidAutoTax || "",
    tradeDebt: data.tradeDebt || "",
    paymentMethod: data.paymentMethod || "",
    paymentDue: data.paymentDue || "",
    bankAccount: data.bankAccount || "",
    contactMemo: data.contactMemo || "",
    memo: data.memo || data.specialNotes || "",
  };
}

function saveContractRecord() {
  const records = getContractRecords();
  const selectedId = contractHistorySelect?.value;
  const existingIndex = records.findIndex((record) => record.id === selectedId);
  const record = {
    id: existingIndex >= 0 ? records[existingIndex].id : createRecordId(),
    savedAt: new Date().toISOString(),
    data: getData(),
  };

  if (existingIndex >= 0) {
    records[existingIndex] = record;
  } else {
    records.unshift(record);
  }

  if (!writeStoredItem("orderAutoContractRecords", JSON.stringify(records.slice(0, 50)))) {
    updateSaveStatus("ブラウザの保存領域にアクセスできませんでした。");
    return;
  }

  renderHistoryOptions(record.id);
  const documentType = record.data.documentType || "契約書";
  updateSaveStatus(`${documentType}の下書きを保存しました。`);
}

function loadSelectedContractRecord() {
  const selectedId = contractHistorySelect?.value;
  if (!selectedId) {
    if (deleteRecordButton) {
      deleteRecordButton.disabled = true;
    }
    return;
  }

  const record = getContractRecords().find((item) => item.id === selectedId);
  if (!record) {
    updateSaveStatus("選択した履歴を読み込めませんでした。");
    renderHistoryOptions();
    return;
  }

  applyContractData(record.data || {});
  if (deleteRecordButton) {
    deleteRecordButton.disabled = false;
  }
  saveDraft();
  updateSaveStatus(`保存済み${record.data?.documentType || "契約書"}を読み込みました。`);
}

function deleteSelectedContractRecord() {
  const selectedId = contractHistorySelect?.value;
  if (!selectedId) {
    updateSaveStatus("削除する履歴を選択してください。");
    return;
  }

  const selectedRecord = getContractRecords().find((item) => item.id === selectedId);
  const title = selectedRecord ? getRecordLabel(selectedRecord) : "選択した履歴";
  if (!window.confirm(`${title}を削除します。よろしいですか。`)) {
    return;
  }

  const records = getContractRecords().filter((item) => item.id !== selectedId);
  writeStoredItem("orderAutoContractRecords", JSON.stringify(records));
  renderHistoryOptions();
  updateSaveStatus("契約履歴を削除しました。");
}

function clearAllContractRecords() {
  const records = getContractRecords();
  if (!records.length) {
    updateSaveStatus("削除する履歴はありません。");
    return;
  }

  if (!window.confirm("この端末に保存された契約履歴をすべて削除します。よろしいですか。")) {
    return;
  }

  removeStoredItem("orderAutoContractRecords");
  renderHistoryOptions();
  updateSaveStatus("すべての契約履歴を削除しました。");
}

function startNewContract() {
  if (!window.confirm("入力中の内容をクリアして、新規作成します。よろしいですか。")) {
    return;
  }

  form?.reset();
  renderSalesOptionRows(1);
  if (contractHistorySelect) {
    contractHistorySelect.value = "";
  }
  setDefaultDate();
  setDocumentType("契約書");
  setContractStatus("下書き");
  saveDraft();
  updateSaveStatus("新規作成を開始しました。");
}

function getContractRecords() {
  try {
    const records = JSON.parse(localStorage.getItem("orderAutoContractRecords") || "[]");
    return Array.isArray(records) ? records : [];
  } catch {
    removeStoredItem("orderAutoContractRecords");
    return [];
  }
}

function getContractRecordPayload() {
  return {
    data: getData(),
  };
}

function loadContractRecordPayload(record) {
  applyContractData(record?.data || {});
  saveDraft();
}

function exposeContractToolApi() {
  window.contractTool = {
    getRecordPayload: getContractRecordPayload,
    loadRecordPayload: loadContractRecordPayload,
    getSummary: () => createContractSummary(getData()),
    setStatus: updateSaveStatus,
    prepareEstimate: prepareEstimate,
    newRecord: startNewContract,
  };
}

function renderHistoryOptions(selectedId = "") {
  if (!contractHistorySelect) {
    return;
  }

  const records = getContractRecords();
  if (!records.length) {
    contractHistorySelect.innerHTML = '<option value="">保存済み履歴はありません</option>';
    if (deleteRecordButton) {
      deleteRecordButton.disabled = true;
    }
    return;
  }

  contractHistorySelect.innerHTML = [
    '<option value="">履歴を選択してください</option>',
    ...records.map((record) => `<option value="${escapeHtml(record.id)}">${escapeHtml(getRecordLabel(record))}</option>`),
  ].join("");
  contractHistorySelect.value = selectedId;
  if (deleteRecordButton) {
    deleteRecordButton.disabled = !contractHistorySelect.value;
  }
}

function getRecordLabel(record) {
  const data = record.data || {};
  const savedDate = formatDateTime(record.savedAt);
  const buyer = data.buyerName || "買主未入力";
  const vehicle = data.vehicleName || "車両未入力";
  const total = formatYen(data.totalPrice || calculateTotal(data)) || "金額未入力";
  const documentType = data.documentType || "契約書";
  return `${savedDate} / ${documentType} / ${buyer} / ${vehicle} / ${total}`;
}

function applyContractData(data) {
  if (!form) {
    return;
  }

  ensureSalesOptionRowsForData(data);
  Object.entries(data).forEach(([name, value]) => {
    const field = form.elements[name];
    if (field) {
      field.value = value;
    }
  });
  updatePreviewStatus();
}

function createContractSummary(data) {
  return [
    `買主: ${data.buyerName || "未入力"}`,
    `車両: ${data.vehicleName || "未入力"}`,
    `車台番号: ${data.vehicleVin || "未入力"}`,
    `総支払額: ${formatYen(data.totalPrice || calculateTotal(data)) || "未入力"}`,
  ].join("\n");
}

function updateSaveStatus(message) {
  if (contractSaveStatus) {
    contractSaveStatus.textContent = message;
  }
  if (previewMessage && message) {
    previewMessage.textContent = message;
  }
}

function saveDraft() {
  if (!form) {
    return;
  }

  try {
    sessionStorage.setItem("orderAutoContractDraft", JSON.stringify(Object.fromEntries(new FormData(form).entries())));
    updatePreviewStatus();
  } catch {
    // 入力中の下書き保存に失敗しても契約作成は続けられる。
  }
}

function handleFormInput(event) {
  addOptionRowWhenNeeded(event?.target);
  saveDraft();
}

function restoreDraft() {
  if (!form) {
    return;
  }

  try {
    const draft = JSON.parse(sessionStorage.getItem("orderAutoContractDraft") || "{}");
    applyContractData(draft);
    updatePreviewStatus();
  } catch {
    try {
      sessionStorage.removeItem("orderAutoContractDraft");
    } catch {
      // noop
    }
  }
}

function setPreviewCopy(label) {
  if (previewCopyLabel) {
    previewCopyLabel.textContent = label;
  }
  customerCopyButton?.classList.toggle("active", label === "お客様控え");
  shopCopyButton?.classList.toggle("active", label === "店控え");
  if (previewMessage) {
    previewMessage.textContent = `${label}のプレビューを表示しています。PDF保存・PDF印刷で帳票を作成できます。`;
  }
}

function completeContract() {
  setDocumentType("契約書");
  setContractStatus("完了");
  saveDraft();
  updateSaveStatus("契約ステータスを完了にしました。必要に応じてクラウド保存してください。");
  if (previewMessage) {
    previewMessage.textContent = "完了にしました。正式な控えはPDF保存または印刷で保管してください。";
  }
}

function setContractStatus(status) {
  if (!form) {
    return;
  }
  if (form.elements.contractStatus) {
    form.elements.contractStatus.value = status;
  }
  if (form.elements.remoteStatus) {
    form.elements.remoteStatus.value = status;
  }
  updatePreviewStatus();
}

function setDocumentType(documentType) {
  if (form?.elements.documentType) {
    form.elements.documentType.value = documentType;
  }
  updatePreviewStatus();
}

function prepareEstimate() {
  setDocumentType("見積書");
  setContractStatus("見積保存");
  saveDraft();
}

function updatePreviewStatus() {
  const status = form?.elements.contractStatus?.value || form?.elements.remoteStatus?.value || "下書き";
  const documentType = form?.elements.documentType?.value || "契約書";
  const isEstimate = documentType === "見積書";
  if (previewStatusLabel) {
    previewStatusLabel.textContent = status;
  }
  if (previewDocumentTypeLabel) {
    previewDocumentTypeLabel.textContent = `${documentType}PDFプレビュー`;
  }
  if (convertEstimateButton) {
    convertEstimateButton.hidden = !isEstimate;
  }
  if (completeContractButton) {
    completeContractButton.hidden = isEstimate;
  }
}

function writeStoredItem(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function removeStoredItem(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // noop
  }
}

function removePersistentDraft() {
  removeStoredItem("orderAutoContractDraft");
}

function calculateTotal(data) {
  const total = getVehicleTotal(data) + getExpenseTotal(data) - parseAmount(data.discount);
  return total > 0 ? String(total) : "";
}

function getVehicleTotal(data) {
  const vehicleBase = parseAmount(data.storeDeliveryPrice) || parseAmount(data.basePrice);
  return vehicleBase
    + sumOptionPrices(data)
    + parseAmount(data.dealerOptionPrice)
    + parseAmount(data.makerOptionPrice)
    + parseAmount(data.customPrice);
}

function sumOptionPrices(data) {
  return range(maxSalesOptionRows).reduce((total, number) => total + parseAmount(data[`optionPrice${number}`]), 0);
}

function getOptionTemplateData(data) {
  return Object.fromEntries(
    range(maxSalesOptionRows).flatMap((number) => [
      [`optionName${number}`, data[`optionName${number}`] || ""],
      [`optionPrice${number}`, data[`optionPrice${number}`] || ""],
    ]),
  );
}

function renderSalesOptionRows(count, data = {}) {
  if (!salesOptionRows) {
    return;
  }
  salesOptionRows.innerHTML = "";
  range(Math.min(maxSalesOptionRows, Math.max(1, count))).forEach((number) => {
    appendSalesOptionRow(number, data);
  });
}

function appendSalesOptionRow(number, data = {}) {
  if (!salesOptionRows || number > maxSalesOptionRows) {
    return;
  }
  salesOptionRows.insertAdjacentHTML("beforeend", `
    <div class="dynamic-option-row">
      <input name="optionName${number}" type="text" placeholder="例）ドライブレコーダー" value="${escapeHtml(data[`optionName${number}`] || "")}" />
      <input name="optionPrice${number}" inputmode="numeric" type="text" placeholder="例）40537" value="${escapeHtml(data[`optionPrice${number}`] || "")}" />
    </div>
  `);
}

function ensureSalesOptionRowsForData(data) {
  if (!salesOptionRows) {
    return;
  }
  const neededRows = getNeededOptionRowCount(data);
  const currentRows = getCurrentOptionRowCount();
  for (let number = currentRows + 1; number <= neededRows; number += 1) {
    appendSalesOptionRow(number, data);
  }
}

function addOptionRowWhenNeeded(target) {
  if (!salesOptionRows || !target?.name || !/^option(Name|Price)\d+$/.test(target.name)) {
    return;
  }
  const currentRows = getCurrentOptionRowCount();
  const rowNumber = getOptionRowNumber(target.name);
  if (rowNumber === currentRows && target.value.trim() && currentRows < maxSalesOptionRows) {
    appendSalesOptionRow(currentRows + 1);
  }
}

function getNeededOptionRowCount(data) {
  const filledRows = range(maxSalesOptionRows).filter((number) => {
    return String(data[`optionName${number}`] || "").trim() || String(data[`optionPrice${number}`] || "").trim();
  });
  return Math.min(maxSalesOptionRows, Math.max(1, (filledRows.at(-1) || 0) + 1));
}

function getCurrentOptionRowCount() {
  return salesOptionRows?.querySelectorAll(".dynamic-option-row").length || 0;
}

function getOptionRowNumber(name) {
  return Number(String(name).match(/\d+$/)?.[0] || 0);
}

function getExpenseTotal(data) {
  const summaryExpenses =
    parseAmount(data.taxInsurance || data.taxes)
    + parseAmount(data.salesExpense || data.fees)
    + parseAmount(data.otherExpense)
    + parseAmount(data.optionalExpense);
  const detailedExpenses =
    parseAmount(data.autoTaxAmount)
    + parseAmount(data.weightTax)
    + parseAmount(data.liabilityInsurance)
    + parseAmount(data.inspectionRegisterFee)
    + parseAmount(data.parkingCertificateFee)
    + parseAmount(data.autoTaxAdjustment)
    + parseAmount(data.liabilityAdjustment)
    + parseAmount(data.fundManagementFee)
    + parseAmount(data.parkingActualFee)
    + parseAmount(data.recycleDeposit || data.recycleFee);
  return summaryExpenses || detailedExpenses;
}

function calculateRecycleTotal(data) {
  const total =
    parseAmount(data.recycleManagementFee)
    + parseAmount(data.shredderFee)
    + parseAmount(data.airbagFee)
    + parseAmount(data.fluorocarbonFee)
    + parseAmount(data.recycleInfoFee);
  return total > 0 ? String(total) : "";
}

function calculateIncludedTax(totalPrice) {
  const total = parseAmount(totalPrice);
  if (!total) {
    return "";
  }
  return String(Math.floor(total / 11));
}

function buildWarrantyText(data) {
  const warranty = data.warranty || data.warrantyType || "";
  const period = data.warrantyPeriod ? `${data.warrantyPeriod}` : "";
  const mileage = data.warrantyMileage ? `${data.warrantyMileage}` : "";
  return [warranty, period, mileage].filter(Boolean).join(" / ");
}

function buildRepairText(data) {
  return [data.repairHistory, data.repairDetail].filter(Boolean).join(" / ");
}

function parseAmount(value) {
  const number = Number(String(value || "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(number) ? number : 0;
}

function range(length) {
  return Array.from({ length }, (_, index) => index + 1);
}

function formatYen(value) {
  const amount = parseAmount(value);
  if (!amount) {
    return "";
  }
  return `金 ${amount.toLocaleString("ja-JP")} 円`;
}

function formatDateTime(value) {
  if (!value) {
    return "日時未記録";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function createRecordId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `contract-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
