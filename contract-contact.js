const contactForm = document.querySelector("#contactForm");
const contactMessage = document.querySelector("#contactMessage");
const contactStatus = document.querySelector("#contactStatus");
const backToCreateButton = document.querySelector("#backToCreateButton");
const contactPdfButton = document.querySelector("#contactPdfButton");
const copyMailButton = document.querySelector("#copyMailButton");
const copyLineButton = document.querySelector("#copyLineButton");
const openMailButton = document.querySelector("#openMailButton");
const openLineButton = document.querySelector("#openLineButton");
const contractDraftKey = "orderAutoContractDraft";
const salesTemplateImportKey = "orderAutoSalesTemplateImport";

restoreContractDraft();
updateMessage();

contactForm?.addEventListener("input", () => {
  saveContactToContractDraft();
  updateMessage();
});
contactForm?.addEventListener("change", () => {
  saveContactToContractDraft();
  updateMessage();
});
backToCreateButton?.addEventListener("click", () => {
  saveContactToContractDraft();
  window.location.href = "contract-create.html";
});
contactPdfButton?.addEventListener("click", openPdfTemplate);
copyMailButton?.addEventListener("click", () => copyText(createMailMessage(), "メール文面をコピーしました。"));
copyLineButton?.addEventListener("click", () => copyText(createLineMessage(), "LINE文面をコピーしました。"));
openMailButton?.addEventListener("click", openMail);
openLineButton?.addEventListener("click", openLine);

function restoreContractDraft() {
  if (!contactForm) {
    return;
  }

  try {
    const draft = JSON.parse(sessionStorage.getItem(contractDraftKey) || "{}");
    Object.entries(draft).forEach(([name, value]) => {
      const field = contactForm.elements[name];
      if (field) {
        field.value = value || "";
      }
    });
  } catch {
    try {
      sessionStorage.removeItem(contractDraftKey);
    } catch {
      // noop
    }
  }
}

function saveContactToContractDraft() {
  if (!contactForm) {
    return;
  }

  let draft = {};
  try {
    draft = JSON.parse(sessionStorage.getItem(contractDraftKey) || "{}");
  } catch {
    draft = {};
  }

  const formData = Object.fromEntries(new FormData(contactForm).entries());
  const nextDraft = {
    ...draft,
    buyerName: formData.buyerName || "",
    buyerEmail: formData.buyerEmail || "",
    buyerPhone: formData.buyerPhone || "",
    vehicleName: formData.vehicleName || "",
    vehicleGrade: formData.vehicleGrade || "",
    vehicleYear: formData.vehicleYear || "",
    vehicleVin: formData.vehicleVin || "",
    totalPrice: formData.totalPrice || "",
    paymentMethod: formData.paymentMethod || "",
    paymentDue: formData.paymentDue || "",
    deliveryDate: formData.deliveryDate || "",
    contactNote: formData.contactNote || "",
  };

  try {
    sessionStorage.setItem(contractDraftKey, JSON.stringify(nextDraft));
  } catch {
    setStatus("入力内容を一時保存できませんでした。");
  }
}

function openPdfTemplate() {
  saveContactToContractDraft();
  const draft = getStoredContractDraft();
  const payload = {
    data: mapContractToSalesTemplate(draft),
    autoPrint: false,
    importedAt: new Date().toISOString(),
  };

  try {
    sessionStorage.setItem(salesTemplateImportKey, JSON.stringify(payload));
  } catch {
    setStatus("PDFテンプレートへ転記できませんでした。ブラウザの保存設定を確認してください。");
    return;
  }

  window.location.href = "sales-template.html?save=1";
}

function getStoredContractDraft() {
  try {
    return JSON.parse(sessionStorage.getItem(contractDraftKey) || "{}");
  } catch {
    return {};
  }
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
    memo: data.specialNotes || data.contactNote || "",
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

function getContactData() {
  if (!contactForm) {
    return {};
  }
  return Object.fromEntries(new FormData(contactForm).entries());
}

function updateMessage() {
  if (contactMessage) {
    contactMessage.value = createMailMessage();
  }
}

function createMailMessage() {
  const data = getContactData();
  const buyer = data.buyerName ? `${data.buyerName} 様` : "お客様";
  const vehicle = [data.vehicleName, data.vehicleGrade].filter(Boolean).join(" ");
  const lines = [
    `${buyer}`,
    "",
    "お世話になっております。オーダーオートです。",
    "車両販売契約の内容をご確認ください。",
    "",
    "【契約内容】",
    `車両: ${vehicle || "未入力"}`,
    `年式: ${data.vehicleYear || "未入力"}`,
    `車台番号: ${data.vehicleVin || "未入力"}`,
    `総支払額: ${formatYen(data.totalPrice) || "未入力"}`,
    `支払方法: ${data.paymentMethod || "未入力"}`,
    `支払期限: ${formatDate(data.paymentDue) || "未入力"}`,
    `納車予定日: ${formatDate(data.deliveryDate) || "未入力"}`,
    "",
    data.contactNote || "添付の契約書PDFをご確認いただき、内容に問題がなければご返信ください。",
    "",
    "オーダーオート",
    "代表 空 篤志",
    "電話 080-2912-8616",
    "住所 広島県広島市佐伯区皆賀1-10-20",
  ];

  return lines.join("\n");
}

function createLineMessage() {
  const data = getContactData();
  const vehicle = [data.vehicleName, data.vehicleGrade].filter(Boolean).join(" ");
  return [
    "オーダーオートです。",
    "車両販売契約の内容をご確認ください。",
    `車両: ${vehicle || "未入力"}`,
    `総支払額: ${formatYen(data.totalPrice) || "未入力"}`,
    `支払方法: ${data.paymentMethod || "未入力"}`,
    `納車予定日: ${formatDate(data.deliveryDate) || "未入力"}`,
    data.contactNote || "契約書PDFをご確認いただき、内容に問題がなければご返信ください。",
  ].join("\n");
}

async function copyText(text, message) {
  try {
    await navigator.clipboard.writeText(text);
    setStatus(message);
    return;
  } catch {
    if (!contactMessage) {
      setStatus("コピーできませんでした。");
      return;
    }
    contactMessage.value = text;
    contactMessage.focus();
    contactMessage.select();
    document.execCommand("copy");
    setStatus(message);
  }
}

function openMail() {
  const data = getContactData();
  const subject = "車両販売契約内容のご確認";
  const href = `mailto:${encodeURIComponent(data.buyerEmail || "")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(createMailMessage())}`;
  window.location.href = href;
  setStatus("メールアプリを開きました。契約書PDFを添付して送信してください。");
}

function openLine() {
  const url = `https://line.me/R/msg/text/?${encodeURIComponent(createLineMessage())}`;
  window.open(url, "_blank", "noopener,noreferrer");
  setStatus("LINEを開きました。契約書PDFを添付または続けて送信してください。");
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

function formatDate(value) {
  if (!value) {
    return "";
  }
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

function setStatus(message) {
  if (contactStatus) {
    contactStatus.textContent = message;
  }
}
