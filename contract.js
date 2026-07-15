const form = document.querySelector("#contractForm");
const printContractButton = document.querySelector("#printContractButton");
const savePdfButton = document.querySelector("#savePdfButton");
const contactContractButton = document.querySelector("#contactContractButton");
const saveRecordButton = document.querySelector("#saveRecordButton");
const newContractButton = document.querySelector("#newContractButton");
const contractHistorySelect = document.querySelector("#contractHistorySelect");
const deleteRecordButton = document.querySelector("#deleteRecordButton");
const clearAllRecordsButton = document.querySelector("#clearAllRecordsButton");
const contractSaveStatus = document.querySelector("#contractSaveStatus");
const salesTemplateImportKey = "orderAutoSalesTemplateImport";

removePersistentDraft();
setDefaultDate();
restoreDraft();
renderHistoryOptions();
exposeContractToolApi();

form?.addEventListener("input", saveDraft);
form?.addEventListener("change", saveDraft);
printContractButton?.addEventListener("click", () => openSalesTemplate(true));
savePdfButton?.addEventListener("click", () => openSalesTemplate(false));
contactContractButton?.addEventListener("click", openContactContract);
saveRecordButton?.addEventListener("click", saveContractRecord);
newContractButton?.addEventListener("click", startNewContract);
contractHistorySelect?.addEventListener("change", loadSelectedContractRecord);
deleteRecordButton?.addEventListener("click", deleteSelectedContractRecord);
clearAllRecordsButton?.addEventListener("click", clearAllContractRecords);

function setDefaultDate() {
  const dateField = form?.elements.contractDate;
  if (dateField && !dateField.value) {
    dateField.value = new Date().toISOString().slice(0, 10);
  }
}

function getData() {
  if (!form) {
    return {};
  }

  const data = Object.fromEntries(new FormData(form).entries());
  data.totalPrice = data.totalPrice || calculateTotal(data);
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

function openContactContract() {
  saveDraft();
  window.location.href = "contract-contact.html";
}

function mapContractToSalesTemplate(data) {
  return {
    estimateDate: data.contractDate || new Date().toISOString().slice(0, 10),
    carType: "中古車",
    buyerName: data.buyerName || "",
    buyerPhone: data.buyerPhone || "",
    buyerEmail: data.buyerEmail || "",
    buyerAddress: data.buyerAddress || "",
    vehicleName: data.vehicleName || "",
    vehicleGrade: data.vehicleGrade || "",
    vehicleYear: data.vehicleYear || "",
    fullModel: data.vehicleModel || "",
    modelCode: data.vehicleModel || "",
    vin: data.vehicleVin || "",
    mileage: data.vehicleMileage || "",
    inspectionDate: data.inspectionDate || "",
    plateNo: data.vehiclePlate || "",
    bodyColor: data.vehicleColor || "",
    repairHistory: data.repairHistory || "",
    basePrice: data.basePrice || "",
    storeDeliveryPrice: data.basePrice || "",
    taxInsurance: data.taxes || "",
    salesExpense: data.fees || "",
    recycleDeposit: data.recycleFee || "",
    cashPayment: data.totalPrice || calculateTotal(data) || "",
    memo: data.specialNotes || "",
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
  updateSaveStatus("下書きを保存しました。");
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
  updateSaveStatus("保存済み契約を読み込みました。");
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
  if (contractHistorySelect) {
    contractHistorySelect.value = "";
  }
  setDefaultDate();
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
  return `${savedDate} / ${buyer} / ${vehicle} / ${total}`;
}

function applyContractData(data) {
  if (!form) {
    return;
  }

  Object.entries(data).forEach(([name, value]) => {
    const field = form.elements[name];
    if (field) {
      field.value = value;
    }
  });
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
}

function saveDraft() {
  if (!form) {
    return;
  }

  try {
    sessionStorage.setItem("orderAutoContractDraft", JSON.stringify(Object.fromEntries(new FormData(form).entries())));
  } catch {
    // 入力中の下書き保存に失敗しても契約作成は続けられる。
  }
}

function restoreDraft() {
  if (!form) {
    return;
  }

  try {
    const draft = JSON.parse(sessionStorage.getItem("orderAutoContractDraft") || "{}");
    applyContractData(draft);
  } catch {
    try {
      sessionStorage.removeItem("orderAutoContractDraft");
    } catch {
      // noop
    }
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
  const total =
    parseAmount(data.basePrice) +
    parseAmount(data.fees) +
    parseAmount(data.taxes) +
    parseAmount(data.recycleFee) -
    parseAmount(data.discount);
  return total > 0 ? String(total) : "";
}

function parseAmount(value) {
  const number = Number(String(value || "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(number) ? number : 0;
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
