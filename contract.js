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
const previewCopyLabel = document.querySelector("#previewCopyLabel");
const customerCopyButton = document.querySelector("#customerCopyButton");
const shopCopyButton = document.querySelector("#shopCopyButton");
const convertEstimateButton = document.querySelector("#convertEstimateButton");
const completeContractButton = document.querySelector("#completeContractButton");
const salesOptionRows = document.querySelector("#salesOptionRows");
const salesPriceTotal = document.querySelector("#salesPriceTotal");
const buyerBirthYear = document.querySelector("#buyerBirthYear");
const buyerBirthMonth = document.querySelector("#buyerBirthMonth");
const buyerBirthDay = document.querySelector("#buyerBirthDay");
const salesTemplateImportKey = "orderAutoSalesTemplateImport";
const companyContact = [
  "オーダーオート",
  "代表者　空 篤志",
  "広島県広島市佐伯区皆賀1-10-20",
  "TEL 080-2912-8616",
].join("\n");
const maxSalesOptionRows = 14;
const moneyFieldNames = new Set([
  "basePrice",
  "customPrice",
  "taxInsurance",
  "salesExpense",
  "otherExpense",
  "optionalExpense",
  "discount",
  "totalPrice",
  "includedTax",
  "autoTaxAmount",
  "weightTax",
  "liabilityInsurance",
  "inspectionRegisterFee",
  "parkingCertificateFee",
  "autoTaxAdjustment",
  "liabilityAdjustment",
  "fundManagementFee",
  "parkingActualFee",
  "parkingCertificateActualFee",
  "recycleDeposit",
  "cashPayment",
  "applicationMoney",
  "loanDownPayment",
  "balance",
  "tradePrice",
  "unpaidAutoTax",
  "tradeDebt",
  "loanPrincipal",
  "loanFee",
  "loanFirstPayment",
  "loanMonthlyPayment",
  "loanBonusPayment",
  "recycleManagementFee",
  "shredderFee",
  "airbagFee",
  "fluorocarbonFee",
  "recycleInfoFee",
  "depositTotal",
]);
const measurementFieldUnits = {
  engineSize: "cc",
  vehicleMileage: "km",
  warrantyMileage: "km",
  tradeMileage: "km",
};
const contractSectionOrder = [
  "customer",
  "vehicle",
  "price",
  "expenses",
  "trade-in",
  "loan",
  "basic",
  "warranty",
  "payment",
  "recycle",
  "notes",
];

arrangeContractSections();
removePersistentDraft();
setDefaultDate();
setupDateFields();
setupBirthdaySelects();
setupYearSelects();
renderSalesOptionRows(1);
setupMoneyFields();
setupMeasurementFields();
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

function arrangeContractSections() {
  contractSectionOrder.forEach((sectionName) => {
    const section = form?.querySelector(`[data-contract-section="${sectionName}"]`);
    if (section) {
      form.append(section);
    }
  });
}

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

function setupDateFields() {
  form?.querySelectorAll('input[type="date"], input[type="month"]').forEach((input) => {
    input.addEventListener("click", () => {
      try {
        input.showPicker?.();
      } catch {
        input.focus();
      }
    });
  });
}

function setupBirthdaySelects() {
  if (!buyerBirthYear || !buyerBirthMonth || !buyerBirthDay) {
    return;
  }
  const currentYear = new Date().getFullYear();
  buyerBirthYear.innerHTML = [
    '<option value="">年</option>',
    ...rangeFrom(currentYear, 1900).map((year) => {
      const era = formatJapaneseEra(year);
      const label = era === "西暦" ? `${year}年` : `${year}年（${era}）`;
      return `<option value="${year}">${label}</option>`;
    }),
  ].join("");
  buyerBirthMonth.innerHTML = [
    '<option value="">月</option>',
    ...range(12).map((month) => `<option value="${month}">${month}月</option>`),
  ].join("");
  updateBirthdayDayOptions();
  [buyerBirthYear, buyerBirthMonth, buyerBirthDay].forEach((select) => {
    select.addEventListener("change", () => {
      if (select !== buyerBirthDay) {
        updateBirthdayDayOptions();
      }
      updateBirthdayValue();
    });
  });
}

function updateBirthdayDayOptions() {
  if (!buyerBirthDay) {
    return;
  }
  const selectedDay = Number(buyerBirthDay.value || 0);
  const year = Number(buyerBirthYear?.value || new Date().getFullYear());
  const month = Number(buyerBirthMonth?.value || 1);
  const dayCount = new Date(year, month, 0).getDate();
  buyerBirthDay.innerHTML = [
    '<option value="">日</option>',
    ...range(dayCount).map((day) => `<option value="${day}">${day}日</option>`),
  ].join("");
  if (selectedDay > 0 && selectedDay <= dayCount) {
    buyerBirthDay.value = String(selectedDay);
  }
}

function updateBirthdayValue() {
  const field = form?.elements.buyerBirthday;
  if (!field) {
    return;
  }
  const year = buyerBirthYear?.value || "";
  const month = buyerBirthMonth?.value || "";
  const day = buyerBirthDay?.value || "";
  field.value = year && month && day
    ? `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    : "";
}

function syncBirthdaySelects(value) {
  const parsed = parseBirthday(value);
  buyerBirthYear.value = parsed?.year || "";
  buyerBirthMonth.value = parsed?.month || "";
  updateBirthdayDayOptions();
  buyerBirthDay.value = parsed?.day || "";
}

function parseBirthday(value) {
  const text = String(value || "").trim();
  let match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    return { year: match[1], month: String(Number(match[2])), day: String(Number(match[3])) };
  }
  match = text.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日$/);
  if (match) {
    return { year: match[1], month: match[2], day: match[3] };
  }
  match = text.match(/^(令和|平成|昭和)(元|\d+)年(\d{1,2})月(\d{1,2})日$/);
  if (!match) {
    return null;
  }
  const eraStart = { 令和: 2018, 平成: 1988, 昭和: 1925 }[match[1]];
  const eraYear = match[2] === "元" ? 1 : Number(match[2]);
  return { year: String(eraStart + eraYear), month: match[3], day: match[4] };
}

function setupYearSelects() {
  const newestYear = new Date().getFullYear() + 1;
  form?.querySelectorAll("[data-year-select]").forEach((select) => {
    const options = ['<option value="">年式を選択</option>'];
    for (let year = newestYear; year >= 1950; year -= 1) {
      options.push(`<option value="${year}年">${year}年（${formatJapaneseEra(year)}）</option>`);
    }
    select.innerHTML = options.join("");
  });
}

function formatJapaneseEra(year) {
  if (year >= 2019) {
    return `令和${year === 2019 ? "元" : year - 2018}年`;
  }
  if (year >= 1989) {
    return `平成${year === 1989 ? "元" : year - 1988}年`;
  }
  if (year >= 1926) {
    return `昭和${year === 1926 ? "元" : year - 1925}年`;
  }
  return "西暦";
}

function getData() {
  if (!form) {
    return {};
  }

  syncOptionTotal();
  syncTaxInsuranceTotal();
  syncSalesExpenseTotal();
  syncOtherExpenseTotal();
  syncPaymentTotal();
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
    buyerBirthday: formatDateForDocument(data.buyerBirthday),
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
    vin: data.vehicleVin || "",
    engineSize: formatMeasurementForDocument(data.engineSize, "cc"),
    mileage: formatMeasurementForDocument(data.vehicleMileage, "km"),
    inspectionDate: formatDateForDocument(data.inspectionDate),
    plateNo: data.vehiclePlate || "",
    mission: data.mission || "",
    capacity: data.capacity || "",
    bodyColor: data.vehicleColor || "",
    equipment: data.equipment || "",
    basePrice: data.basePrice || "",
    storeDeliveryPrice: data.basePrice || "",
    dealerOptionPrice: data.dealerOptionPrice || "",
    makerOptionPrice: data.makerOptionPrice || "",
    ...getOptionTemplateData(data),
    customPrice: data.customPrice || "",
    discount: data.discount || "",
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
    parkingCertificateActualFee: data.parkingCertificateActualFee || "",
    recycleDeposit: data.recycleDeposit || data.recycleFee || "",
    depositTotal: data.depositTotal || calculateRecycleTotal(data),
    cashPayment: data.cashPayment || data.totalPrice || calculateTotal(data) || "",
    loanDownPayment: data.loanDownPayment || data.downPayment || "",
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
    tradeInspectionDate: formatDateForDocument(data.tradeInspectionDate),
    tradeMileage: formatMeasurementForDocument(data.tradeMileage, "km"),
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
  syncOptionTotal();
  syncTaxInsuranceTotal();
  syncSalesExpenseTotal();
  syncOtherExpenseTotal();
  updateSalesPriceTotal();
  syncPaymentTotal();
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

  renderSalesOptionRows(getNeededOptionRowCount(data), data);
  Object.entries(data).forEach(([name, value]) => {
    const field = form.elements[name];
    if (field) {
      if (field.matches?.("[data-year-select]") && value && !Array.from(field.options).some((option) => option.value === value)) {
        field.add(new Option(value, value));
      }
      field.value = field.matches?.('input[type="date"], input[type="month"]')
        ? normalizeDateInputValue(value, field.type)
        : value;
    }
  });
  syncBirthdaySelects(data.buyerBirthday || "");
  syncOptionTotal();
  syncTaxInsuranceTotal();
  syncSalesExpenseTotal();
  syncOtherExpenseTotal();
  updateSalesPriceTotal();
  syncPaymentTotal();
  formatAllMoneyFields();
  formatAllMeasurementFields();
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
  if (/^optionPrice\d+$/.test(event?.target?.name || "")) {
    syncOptionTotal();
  }
  if (["autoTaxAmount", "weightTax", "liabilityInsurance"].includes(event?.target?.name || "")) {
    syncTaxInsuranceTotal();
  }
  if (["inspectionRegisterFee", "parkingCertificateFee", "autoTaxAdjustment", "liabilityAdjustment", "fundManagementFee"].includes(event?.target?.name || "")) {
    syncSalesExpenseTotal();
  }
  if (["parkingActualFee", "parkingCertificateActualFee", "recycleDeposit"].includes(event?.target?.name || "")) {
    syncOtherExpenseTotal();
  }
  updateSalesPriceTotal();
  syncPaymentTotal();
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
}

function completeContract() {
  setDocumentType("契約書");
  setContractStatus("完了");
  saveDraft();
  updateSaveStatus("契約ステータスを完了にしました。必要に応じてクラウド保存してください。");
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
  const vehicleBase = parseAmount(data.basePrice);
  const summaryOptions =
    parseAmount(data.dealerOptionPrice)
    + parseAmount(data.makerOptionPrice)
    + parseAmount(data.customPrice);
  const detailedOptions = sumOptionPrices(data);
  return vehicleBase + (detailedOptions || summaryOptions);
}

function sumOptionPrices(data) {
  return range(maxSalesOptionRows).reduce((total, number) => total + parseAmount(data[`optionPrice${number}`]), 0);
}

function syncOptionTotal() {
  const customPrice = form?.elements.customPrice;
  if (!customPrice) {
    return;
  }
  const total = sumOptionPrices(Object.fromEntries(new FormData(form).entries()));
  customPrice.value = total > 0 ? total.toLocaleString("ja-JP") : "";
}

function syncTaxInsuranceTotal() {
  const taxInsurance = form?.elements.taxInsurance;
  if (!taxInsurance) {
    return;
  }
  const total = ["autoTaxAmount", "weightTax", "liabilityInsurance"]
    .reduce((sum, name) => sum + parseAmount(form.elements[name]?.value), 0);
  taxInsurance.value = total > 0 ? total.toLocaleString("ja-JP") : "";
}

function syncSalesExpenseTotal() {
  const salesExpense = form?.elements.salesExpense;
  if (!salesExpense) {
    return;
  }
  const total = ["inspectionRegisterFee", "parkingCertificateFee", "autoTaxAdjustment", "liabilityAdjustment", "fundManagementFee"]
    .reduce((sum, name) => sum + parseAmount(form.elements[name]?.value), 0);
  salesExpense.value = total > 0 ? total.toLocaleString("ja-JP") : "";
}

function syncOtherExpenseTotal() {
  const otherExpense = form?.elements.otherExpense;
  if (!otherExpense) {
    return;
  }
  const total = ["parkingActualFee", "parkingCertificateActualFee", "recycleDeposit"]
    .reduce((sum, name) => sum + parseAmount(form.elements[name]?.value), 0);
  otherExpense.value = total > 0 ? total.toLocaleString("ja-JP") : "";
}

function updateSalesPriceTotal() {
  if (!salesPriceTotal || !form) {
    return;
  }
  const data = Object.fromEntries(new FormData(form).entries());
  salesPriceTotal.textContent = `合計 ${getVehicleTotal(data).toLocaleString("ja-JP")}円`;
}

function syncPaymentTotal() {
  const totalPrice = form?.elements.totalPrice;
  if (!totalPrice) {
    return;
  }
  const total = parseAmount(calculateTotal(Object.fromEntries(new FormData(form).entries())));
  totalPrice.value = total > 0 ? total.toLocaleString("ja-JP") : "";
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
  setupMoneyFields(salesOptionRows);
}

function setupMoneyFields(root = document) {
  root.querySelectorAll("input").forEach((input) => {
    if (!isMoneyField(input) || input.dataset.moneyReady === "true") {
      return;
    }
    input.dataset.moneyReady = "true";
    input.classList.add("money-input");
    input.inputMode = "numeric";
    const label = input.closest("label");
    const labelText = Array.from(label?.children || []).find((child) => child.tagName === "SPAN")?.textContent?.trim();
    if (labelText) {
      input.setAttribute("aria-label", labelText);
    } else if (/^optionPrice\d+$/.test(input.name)) {
      input.setAttribute("aria-label", `オプション${getOptionRowNumber(input.name)}の価格`);
    }
    const wrapper = document.createElement("div");
    wrapper.className = "money-input-wrap";
    input.before(wrapper);
    wrapper.append(input);
    const unit = document.createElement("span");
    unit.className = "money-input-unit";
    unit.textContent = "円";
    unit.setAttribute("aria-hidden", "true");
    wrapper.append(unit);
    input.addEventListener("input", () => formatMoneyInputWhileTyping(input));
    input.addEventListener("blur", () => formatMoneyInput(input));
    input.addEventListener("change", () => formatMoneyInput(input));
    formatMoneyInput(input);
  });
}

function isMoneyField(input) {
  return moneyFieldNames.has(input.name) || /^optionPrice\d+$/.test(input.name);
}

function formatMoneyInput(input) {
  const value = String(input.value || "").trim();
  if (!value) {
    return;
  }
  const amount = parseAmount(value);
  input.value = amount.toLocaleString("ja-JP");
}

function formatMoneyInputWhileTyping(input) {
  const cursor = input.selectionStart ?? input.value.length;
  const digitsBeforeCursor = input.value.slice(0, cursor).replace(/\D/g, "").length;
  const isNegative = input.value.trim().startsWith("-");
  const digits = input.value.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  if (!digits) {
    input.value = isNegative ? "-" : "";
    return;
  }
  input.value = `${isNegative ? "-" : ""}${Number(digits).toLocaleString("ja-JP")}`;
  let nextCursor = input.value.length;
  if (digitsBeforeCursor === 0) {
    nextCursor = isNegative ? 1 : 0;
  } else {
    let digitCount = 0;
    for (let index = 0; index < input.value.length; index += 1) {
      if (/\d/.test(input.value[index])) {
        digitCount += 1;
      }
      if (digitCount === digitsBeforeCursor) {
        nextCursor = index + 1;
        break;
      }
    }
  }
  input.setSelectionRange(nextCursor, nextCursor);
}

function formatAllMoneyFields() {
  form?.querySelectorAll(".money-input").forEach(formatMoneyInput);
}

function setupMeasurementFields() {
  Object.entries(measurementFieldUnits).forEach(([name, unitText]) => {
    const input = form?.elements[name];
    if (!input || input.dataset.measurementReady === "true") {
      return;
    }
    input.dataset.measurementReady = "true";
    input.classList.add("measurement-input");
    input.inputMode = "numeric";
    const label = input.closest("label");
    const labelText = Array.from(label?.children || []).find((child) => child.tagName === "SPAN")?.textContent?.trim();
    if (labelText) {
      input.setAttribute("aria-label", labelText);
    }
    const wrapper = document.createElement("div");
    wrapper.className = "measurement-input-wrap";
    input.before(wrapper);
    wrapper.append(input);
    const unit = document.createElement("span");
    unit.className = "measurement-input-unit";
    unit.textContent = unitText;
    unit.setAttribute("aria-hidden", "true");
    wrapper.append(unit);
    input.addEventListener("input", () => formatMoneyInputWhileTyping(input));
    input.addEventListener("blur", () => formatMeasurementInput(input));
    input.addEventListener("change", () => formatMeasurementInput(input));
    formatMeasurementInput(input);
  });
}

function formatMeasurementInput(input) {
  const value = String(input.value || "").trim();
  if (!value) {
    return;
  }
  const digits = value.replace(/\D/g, "");
  input.value = digits ? Number(digits).toLocaleString("ja-JP") : "";
}

function formatAllMeasurementFields() {
  form?.querySelectorAll(".measurement-input").forEach(formatMeasurementInput);
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
    + parseAmount(data.parkingCertificateActualFee)
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

function formatDateForDocument(value) {
  const text = String(value || "");
  const dateMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateMatch) {
    return `${dateMatch[1]}年${Number(dateMatch[2])}月${Number(dateMatch[3])}日`;
  }
  const monthMatch = text.match(/^(\d{4})-(\d{2})$/);
  return monthMatch ? `${monthMatch[1]}年${Number(monthMatch[2])}月` : text;
}

function formatMeasurementForDocument(value, unit) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }
  const digits = text.replace(/\D/g, "");
  return digits ? `${Number(digits).toLocaleString("ja-JP")} ${unit}` : text;
}

function normalizeDateInputValue(value, type) {
  const text = String(value || "").trim();
  if ((type === "date" && /^\d{4}-\d{2}-\d{2}$/.test(text)) || (type === "month" && /^\d{4}-\d{2}$/.test(text))) {
    return text;
  }
  let match = text.match(/^(\d{4})年(\d{1,2})月(?:(\d{1,2})日)?$/);
  if (match) {
    return buildDateInputValue(match[1], match[2], match[3], type);
  }
  match = text.match(/^(令和|平成|昭和)(元|\d+)年(\d{1,2})月(?:(\d{1,2})日)?$/);
  if (!match) {
    return "";
  }
  const eraStart = { 令和: 2018, 平成: 1988, 昭和: 1925 }[match[1]];
  const eraYear = match[2] === "元" ? 1 : Number(match[2]);
  return buildDateInputValue(eraStart + eraYear, match[3], match[4], type);
}

function buildDateInputValue(year, month, day, type) {
  const yearMonth = `${year}-${String(month).padStart(2, "0")}`;
  if (type === "month") {
    return yearMonth;
  }
  return day ? `${yearMonth}-${String(day).padStart(2, "0")}` : "";
}

function buildWarrantyText(data) {
  const warranty = data.warranty || data.warrantyType || "";
  const period = data.warrantyPeriod ? `${data.warrantyPeriod}` : "";
  const mileage = formatMeasurementForDocument(data.warrantyMileage, "km");
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

function rangeFrom(start, end) {
  return Array.from({ length: start - end + 1 }, (_, index) => start - index);
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
