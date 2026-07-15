const form = document.querySelector("#salesSheetForm");
const recordSelect = document.querySelector("#recordSelect");
const newButton = document.querySelector("#newButton");
const sampleButton = document.querySelector("#sampleButton");
const saveButton = document.querySelector("#saveButton");
const deleteButton = document.querySelector("#deleteButton");
const printButton = document.querySelector("#printButton");
const sheetStatus = document.querySelector("#sheetStatus");
const optionRows = document.querySelector("#optionRows");
const feeExtraRows = document.querySelector("#feeExtraRows");

const storageKey = "orderAutoSalesSheetRecords";
const draftKey = "orderAutoSalesSheetDraft";
let activeRecordId = "";

createRepeatingRows();
setDefaultValues();
restoreDraft();
renderRecordOptions(activeRecordId);
calculateTotals();

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
sampleButton?.addEventListener("click", fillSampleData);
saveButton?.addEventListener("click", saveRecord);
deleteButton?.addEventListener("click", deleteRecord);
printButton?.addEventListener("click", () => window.print());

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
  setValueIfEmpty("documentTitle", "お見積書");
  setValueIfEmpty("estimateDate", new Date().toISOString().slice(0, 10));
  setValueIfEmpty("carType", "中古車");
  setValueIfEmpty("warranty", "なし");
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

function fillSampleData() {
  const sample = {
    documentTitle: "お見積書",
    estimateDate: "2026-06-06",
    validUntil: "2026-06-16",
    estimateNo: "004021371",
    controlNo: "26-1042",
    carType: "中古車",
    notice: "※検なし",
    warranty: "なし",
    inspectionStatus: "",
    repairHistory: "無",
    vehicleName: "トヨタ ノア",
    vehicleGrade: "HYBRID Si",
    vehicleYear: "平成29年01月",
    mission: "CVT",
    equipment: "AAC PS PW キーレス スマート 集中D 電動S TV ナビ 後DISP WエアB ABS ESC 1セグ 3列 フラット Wスルー Pガラス AW16",
    vin: "ZWR80-0287554",
    engineSize: "1,800CC",
    doorCount: "5",
    fullModel: "DAA-ZWR80W-APXSB",
    modelCode: "DAA-ZWR80W",
    mileage: "84,074Km",
    capacity: "7人",
    bodyColor: "ブラック",
    basePrice: "1905535",
    storeDeliveryPrice: "1905535",
    customPrice: "40537",
    taxInsurance: "67760",
    salesExpense: "55598",
    otherExpense: "29570",
    includedTax: "181970",
    cashPayment: "2099000",
    optionName1: "車検整備費用（普通車）",
    optionPrice1: "40537",
    autoTaxMonth: "9ヶ月",
    autoTaxAmount: "29600",
    weightTax: "20000",
    liabilityInsuranceMonth: "25ヶ月",
    liabilityInsurance: "18160",
    inspectionRegisterFee: "35432",
    parkingCertificateFee: "20166",
    parkingActualFee: "14800",
    feeName1: "車庫証明費用",
    feePrice1: "2300",
    recycleDeposit: "12470",
    contactMemo: "株式会社 ビットイン鯉城商事\nカーコンビニ倶楽部 五日市店\n〒731-5108\n広島県広島市佐伯区石内南1-4-1\nTEL 082-928-5511\nFAX 082-928-6432",
    memo: "広島銀行 古市支店 普通 3015554\n広島信用金庫 五日市支店 当座 0602384\n広島市信用組合 商工センター支店 当座 0014188",
  };

  activeRecordId = "";
  form.reset();
  applyFormData(sample);
  renderRecordOptions();
  saveDraft();
  calculateTotals();
  setStatus("サンプルを入力しました。必要な内容に上書きして保存できます。");
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

function calculateTotals() {
  const data = getFormData();
  setOutput("vehicleTotal", getVehicleTotal(data));
  setOutput("expenseTotal", getExpenseTotal(data));
  setOutput("paymentTotal", getPaymentTotal(data));
  setOutput("tradeTotal", getTradeTotal(data));
  setOutput("afterTradeTotal", getPaymentTotal(data) - getTradeTotal(data));
  setOutput("paymentInputTotal", getPaymentInputTotal(data));
}

function getVehicleTotal(data) {
  const vehicleBase = parseAmount(data.storeDeliveryPrice) || parseAmount(data.basePrice);
  const summaryOptions = sum([data.dealerOptionPrice, data.makerOptionPrice, data.customPrice]);
  const detailedOptions = sum(range(14).map((number) => data[`optionPrice${number}`]));
  return vehicleBase + (summaryOptions || detailedOptions);
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
  return sum([data.cashPayment, data.loanDownPayment, data.loanFee]);
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
