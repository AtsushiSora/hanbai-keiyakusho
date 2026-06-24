const seller = {
  name: "オーダーオート",
  representative: "空 篤志",
  phone: "080-2912-8616",
  address: "広島県広島市佐伯区皆賀1-10-20",
};

const modeGuides = {
  paper: "PDFを印刷し、買主と売主が手書きサインして保管する運用です。",
  tablet: "タブレット上で買主が手書きサインし、サイン入りの契約書を印刷またはメール送信する運用です。",
  email: "契約内容をメールで確認し、返信または同意記録を残して完結する運用です。",
};

const form = document.querySelector("#contractForm");
const contractDocument = document.querySelector("#contractDocument");
const contractModeGuide = document.querySelector("#contractModeGuide");
const signaturePanel = document.querySelector("#signaturePanel");
const emailPanel = document.querySelector("#emailPanel");
const emailConsentChecked = document.querySelector("#emailConsentChecked");
const signatureCanvas = document.querySelector("#signatureCanvas");
const clearSignatureButton = document.querySelector("#clearSignatureButton");
const printContractButton = document.querySelector("#printContractButton");
const saveRecordButton = document.querySelector("#saveRecordButton");
const downloadHtmlButton = document.querySelector("#downloadHtmlButton");
const copySummaryButton = document.querySelector("#copySummaryButton");
const emailContractLink = document.querySelector("#emailContractLink");
const newContractButton = document.querySelector("#newContractButton");
const contractHistorySelect = document.querySelector("#contractHistorySelect");
const deleteRecordButton = document.querySelector("#deleteRecordButton");
const clearAllRecordsButton = document.querySelector("#clearAllRecordsButton");
const contractSaveStatus = document.querySelector("#contractSaveStatus");

let signatureImage = "";
let isDrawing = false;
let lastPoint = null;

removePersistentDraft();
setDefaultDate();
restoreDraft();
setupSignatureCanvas();
renderHistoryOptions();
renderContract();
exposeContractToolApi();

form?.addEventListener("input", handleContractChange);
form?.addEventListener("change", handleContractChange);
emailConsentChecked?.addEventListener("change", renderContract);
clearSignatureButton?.addEventListener("click", clearSignature);
printContractButton?.addEventListener("click", () => window.print());
saveRecordButton?.addEventListener("click", saveContractRecord);
downloadHtmlButton?.addEventListener("click", downloadContractHtml);
copySummaryButton?.addEventListener("click", copyContractSummary);
newContractButton?.addEventListener("click", startNewContract);
contractHistorySelect?.addEventListener("change", loadSelectedContractRecord);
deleteRecordButton?.addEventListener("click", deleteSelectedContractRecord);
clearAllRecordsButton?.addEventListener("click", clearAllContractRecords);

function handleContractChange() {
  saveDraft();
  renderContract();
}

function setDefaultDate() {
  const dateField = form?.elements.contractDate;
  if (dateField && !dateField.value) {
    dateField.value = new Date().toISOString().slice(0, 10);
  }
}

function getData() {
  const formData = new FormData(form);
  const data = Object.fromEntries(formData.entries());
  data.completionMode = data.completionMode || "paper";
  data.totalPrice = data.totalPrice || calculateTotal(data);
  return data;
}

function renderContract() {
  if (!form || !contractDocument) {
    return;
  }

  const data = getData();
  const mode = data.completionMode;
  contractModeGuide.textContent = modeGuides[mode] || modeGuides.paper;
  signaturePanel.hidden = mode !== "tablet";
  emailPanel.hidden = mode !== "email";
  contractDocument.innerHTML = createContractHtml(data);
  updateEmailLink(data);
  updateSaveStatus("");
}

function createContractHtml(data) {
  const rows = [
    ["車名", data.vehicleName],
    ["グレード", data.vehicleGrade],
    ["年式", data.vehicleYear],
    ["型式", data.vehicleModel],
    ["車台番号", data.vehicleVin],
    ["登録番号", data.vehiclePlate],
    ["走行距離", data.vehicleMileage],
    ["車検満了日", formatDate(data.inspectionDate) || data.inspectionDate],
    ["車体色", data.vehicleColor],
    ["修復歴", data.repairHistory],
  ];

  const amountRows = [
    ["車両本体価格", formatYen(data.basePrice)],
    ["諸費用", formatYen(data.fees)],
    ["税金・保険料等", formatYen(data.taxes)],
    ["リサイクル預託金", formatYen(data.recycleFee)],
    ["値引き", formatYen(data.discount)],
    ["総支払額", formatYen(data.totalPrice)],
  ];

  return `
    <div class="contract-doc-head">
      <p>自動車売買契約書兼注文書</p>
      <small>契約日 ${escapeHtml(formatDate(data.contractDate) || blankText())}</small>
    </div>

    <p class="contract-intro">
      売主「${escapeHtml(seller.name)}」（以下「甲」という。）と、買主「${escapeHtml(data.buyerName || blankText())}」（以下「乙」という。）は、
      下記車両の売買について、以下のとおり契約を締結する。
    </p>

    ${createSection("第1条 車両情報", createTable(rows))}
    ${createSection("第2条 売買代金", createTable(amountRows, "amount"))}

    ${createSection(
      "第3条 支払条件",
      `
        <dl class="contract-dl">
          ${createDlItem("支払方法", data.paymentMethod)}
          ${createDlItem("頭金", formatYen(data.downPayment))}
          ${createDlItem("残金", formatYen(data.balance))}
          ${createDlItem("支払期限", formatDate(data.paymentDue))}
          ${createDlItem("振込先", data.bankAccount)}
        </dl>
        <p>乙は、甲に対し、総支払額を上記の方法により支払う。銀行振込の場合、振込手数料は乙の負担とする。</p>
      `,
    )}

    ${createSection(
      "第4条 納車",
      `
        <dl class="contract-dl">
          ${createDlItem("納車予定日", formatDate(data.deliveryDate))}
          ${createDlItem("納車場所", data.deliveryPlace)}
        </dl>
        <p>甲は、乙による支払完了後、乙に本車両を引き渡すものとする。ただし、ローン利用その他別途合意がある場合は、その合意内容に従う。</p>
      `,
    )}

    ${createSection(
      "第5条 車両状態の確認",
      "<p>乙は、本契約締結前に、本車両の状態、装備、走行距離、修復歴の有無、車検内容、保証内容その他重要事項を確認し、了承したうえで本契約を締結する。</p>",
    )}

    ${createSection(
      "第6条 名義変更",
      "<p>本車両の名義変更が必要な場合、甲乙は互いに必要書類の準備および手続に協力する。名義変更に必要な費用は、別途合意がない限り乙の負担とする。</p>",
    )}

    ${createSection(
      "第7条 所有権の移転",
      "<p>本車両の所有権は、乙が売買代金その他本契約に基づく支払を完了した時点で、甲から乙へ移転する。</p>",
    )}

    ${createSection(
      "第8条 キャンセル",
      "<p>乙の都合により、本契約締結後にキャンセルする場合、甲に実際に発生した費用、登録費用、整備費用、陸送費用、部品手配費用その他キャンセルに伴い発生した費用は、乙の負担とする。</p>",
    )}

    ${createSection(
      "第9条 保証",
      `
        <dl class="contract-dl">
          ${createDlItem("保証", data.warrantyType)}
          ${createDlItem("保証期間", data.warrantyPeriod)}
          ${createDlItem("保証内容", data.warrantyDetail)}
        </dl>
        <p>保証なしの場合、乙は本車両が現状販売であることを理解し、車両状態を確認したうえで購入するものとする。</p>
      `,
    )}

    ${createSection(
      "第10条 反社会的勢力の排除",
      "<p>甲および乙は、自らが反社会的勢力に該当しないこと、また反社会的勢力と関係を有しないことを表明し、将来にわたってもこれを確約する。</p>",
    )}

    ${createSection(
      "第11条 協議事項",
      "<p>本契約に定めのない事項、または本契約の解釈について疑義が生じた場合は、甲乙協議のうえ、誠実に解決する。</p>",
    )}

    ${createSpecialNotes(data.specialNotes)}
    ${createBuyerBlock(data)}
    ${createCompletionBlock(data)}
  `;
}

function createSection(title, body) {
  return `
    <section class="contract-doc-section">
      <h3>${escapeHtml(title)}</h3>
      ${body}
    </section>
  `;
}

function createTable(rows, className = "") {
  return `
    <table class="contract-doc-table ${className}">
      <tbody>
        ${rows
          .map(
            ([label, value]) => `
              <tr>
                <th>${escapeHtml(label)}</th>
                <td>${escapeHtml(value || blankText())}</td>
              </tr>
            `,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function createDlItem(label, value) {
  return `
    <div>
      <dt>${escapeHtml(label)}</dt>
      <dd>${escapeHtml(value || blankText())}</dd>
    </div>
  `;
}

function createSpecialNotes(notes) {
  if (!notes) {
    return "";
  }

  return createSection("特記事項", `<p>${escapeHtml(notes).replaceAll("\n", "<br>")}</p>`);
}

function createBuyerBlock(data) {
  return createSection(
    "買主情報",
    `
      <dl class="contract-dl">
        ${createDlItem("住所", data.buyerAddress)}
        ${createDlItem("氏名", data.buyerName)}
        ${createDlItem("電話番号", data.buyerPhone)}
        ${createDlItem("メールアドレス", data.buyerEmail)}
      </dl>
    `,
  );
}

function createCompletionBlock(data) {
  const mode = data.completionMode;
  const emailRecord =
    mode === "email"
      ? `
        <div class="email-consent-record">
          <strong>メール同意記録</strong>
          <span>${emailConsentChecked?.checked ? "買主からの同意記録を確認済み" : "未確認"}</span>
          <small>送信先: ${escapeHtml(data.buyerEmail || blankText())}</small>
        </div>
      `
      : "";

  const buyerSignature =
    mode === "tablet" && signatureImage
      ? `<img class="signature-image" src="${signatureImage}" alt="買主署名" />`
      : `<span class="signature-line"></span>`;

  return `
    <section class="contract-sign-section">
      <p>甲乙は、本契約内容を確認し、同意のうえ署名する。</p>
      ${emailRecord}
      <div class="signature-grid">
        <div>
          <h3>買主 乙</h3>
          <p>住所 ${escapeHtml(data.buyerAddress || blankText())}</p>
          <p>氏名 ${escapeHtml(data.buyerName || blankText())}</p>
          <p class="signature-label">署名</p>
          ${buyerSignature}
        </div>
        <div>
          <h3>売主 甲</h3>
          <p>住所 ${escapeHtml(seller.address)}</p>
          <p>名称 ${escapeHtml(seller.name)}</p>
          <p>代表者 ${escapeHtml(seller.representative)}</p>
          <p>電話番号 ${escapeHtml(seller.phone)}</p>
          <p class="signature-label">署名</p>
          <span class="signature-line"></span>
        </div>
      </div>
    </section>
  `;
}

function setupSignatureCanvas() {
  if (!signatureCanvas) {
    return;
  }

  const context = signatureCanvas.getContext("2d");
  context.lineWidth = 4;
  context.lineCap = "round";
  context.strokeStyle = "#172033";

  signatureCanvas.addEventListener("pointerdown", (event) => {
    isDrawing = true;
    signatureCanvas.setPointerCapture(event.pointerId);
    lastPoint = getCanvasPoint(event);
  });

  signatureCanvas.addEventListener("pointermove", (event) => {
    if (!isDrawing || !lastPoint) {
      return;
    }

    const point = getCanvasPoint(event);
    context.beginPath();
    context.moveTo(lastPoint.x, lastPoint.y);
    context.lineTo(point.x, point.y);
    context.stroke();
    lastPoint = point;
    signatureImage = signatureCanvas.toDataURL("image/png");
    renderContract();
  });

  ["pointerup", "pointercancel", "pointerleave"].forEach((eventName) => {
    signatureCanvas.addEventListener(eventName, () => {
      isDrawing = false;
      lastPoint = null;
      signatureImage = signatureCanvas.toDataURL("image/png");
      renderContract();
    });
  });
}

function getCanvasPoint(event) {
  const rect = signatureCanvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * signatureCanvas.width,
    y: ((event.clientY - rect.top) / rect.height) * signatureCanvas.height,
  };
}

function clearSignature() {
  clearSignatureCanvasOnly();
  signatureImage = "";
  renderContract();
}

function clearSignatureCanvasOnly() {
  const context = signatureCanvas?.getContext("2d");
  context?.clearRect(0, 0, signatureCanvas.width, signatureCanvas.height);
}

function updateEmailLink(data) {
  if (!emailContractLink) {
    return;
  }

  const buyerEmail = data.buyerEmail || "";
  const subject = `自動車売買契約書のご確認: ${data.vehicleName || "車両"}`;
  const body = `${createContractSummary(data)}

上記内容をご確認いただき、問題なければ「契約内容に同意します」とご返信ください。
PDFを添付して送付する場合は、契約書作成画面から「印刷・PDF保存」で保存したPDFを添付してください。`;

  emailContractLink.href = `mailto:${encodeURIComponent(buyerEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function createContractSummary(data) {
  return [
    "自動車売買契約書兼注文書の確認依頼",
    "",
    `買主: ${data.buyerName || "未入力"}`,
    `車両: ${data.vehicleName || "未入力"}`,
    `車台番号: ${data.vehicleVin || "未入力"}`,
    `総支払額: ${formatYen(data.totalPrice) || "未入力"}`,
    `支払方法: ${data.paymentMethod || "未入力"}`,
    `納車予定日: ${formatDate(data.deliveryDate) || "未入力"}`,
    "",
    `売主: ${seller.name}`,
    `代表者: ${seller.representative}`,
    `電話番号: ${seller.phone}`,
  ].join("\n");
}

async function copyContractSummary() {
  const data = getData();
  try {
    await navigator.clipboard.writeText(createContractSummary(data));
    copySummaryButton.textContent = "コピーしました";
    setTimeout(() => {
      copySummaryButton.textContent = "内容をコピー";
    }, 1600);
  } catch {
    copySummaryButton.textContent = "コピー不可";
  }
}

function saveContractRecord() {
  const data = getData();
  const records = getContractRecords();
  const selectedId = contractHistorySelect?.value;
  const existingIndex = records.findIndex((record) => record.id === selectedId);
  const record = {
    id: existingIndex >= 0 ? records[existingIndex].id : createRecordId(),
    savedAt: new Date().toISOString(),
    data,
    signatureImage,
    emailConsentChecked: Boolean(emailConsentChecked?.checked),
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
  updateSaveStatus("契約履歴に保存しました。");
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
  signatureImage = record.signatureImage || "";
  if (emailConsentChecked) {
    emailConsentChecked.checked = Boolean(record.emailConsentChecked);
  }
  restoreSignatureImageToCanvas(signatureImage);
  if (deleteRecordButton) {
    deleteRecordButton.disabled = false;
  }
  saveDraft();
  renderContract();
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

  form.reset();
  signatureImage = "";
  clearSignatureCanvasOnly();
  if (emailConsentChecked) {
    emailConsentChecked.checked = false;
  }
  if (contractHistorySelect) {
    contractHistorySelect.value = "";
  }
  setDefaultDate();
  saveDraft();
  renderContract();
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

function createRecordId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `contract-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getContractRecordPayload() {
  return {
    data: getData(),
    signatureImage,
    emailConsentChecked: Boolean(emailConsentChecked?.checked),
  };
}

function loadContractRecordPayload(record) {
  applyContractData(record?.data || {});
  signatureImage = record?.signatureImage || "";
  if (emailConsentChecked) {
    emailConsentChecked.checked = Boolean(record?.emailConsentChecked);
  }
  restoreSignatureImageToCanvas(signatureImage);
  saveDraft();
  renderContract();
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
    deleteRecordButton.disabled = true;
    return;
  }

  contractHistorySelect.innerHTML = [
    '<option value="">履歴を選択してください</option>',
    ...records.map((record) => `<option value="${escapeHtml(record.id)}">${escapeHtml(getRecordLabel(record))}</option>`),
  ].join("");
  contractHistorySelect.value = selectedId;
  deleteRecordButton.disabled = !contractHistorySelect.value;
}

function getRecordLabel(record) {
  const data = record.data || {};
  const savedDate = formatDateTime(record.savedAt);
  const buyer = data.buyerName || "買主未入力";
  const vehicle = data.vehicleName || "車両未入力";
  const total = formatYen(data.totalPrice) || "金額未入力";
  return `${savedDate} / ${buyer} / ${vehicle} / ${total}`;
}

function applyContractData(data) {
  Object.entries(data).forEach(([name, value]) => {
    const field = form.elements[name];
    if (!field) {
      return;
    }

    if (field instanceof RadioNodeList) {
      [...field].forEach((radio) => {
        radio.checked = radio.value === value;
      });
    } else {
      field.value = value;
    }
  });
}

function restoreSignatureImageToCanvas(imageData) {
  clearSignatureCanvasOnly();
  if (!signatureCanvas || !imageData) {
    return;
  }

  const image = new Image();
  image.onload = () => {
    const context = signatureCanvas.getContext("2d");
    context.drawImage(image, 0, 0, signatureCanvas.width, signatureCanvas.height);
  };
  image.src = imageData;
}

function updateSaveStatus(message) {
  if (!contractSaveStatus) {
    return;
  }
  contractSaveStatus.textContent = message;
}

function downloadContractHtml() {
  const data = getData();
  const html = `<!doctype html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <title>自動車売買契約書兼注文書</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif; color: #172033; line-height: 1.65; }
    .contract-document { max-width: 920px; margin: 0 auto; padding: 28px; }
    .contract-doc-head { display: flex; justify-content: space-between; gap: 18px; padding-bottom: 14px; border-bottom: 2px solid #172033; }
    .contract-doc-head p { margin: 0; font-size: 26px; font-weight: 900; }
    .contract-doc-head small { font-weight: 800; }
    .contract-intro { font-weight: 700; }
    .contract-doc-section { margin-top: 16px; }
    .contract-doc-section h3, .contract-sign-section h3 { margin: 0 0 8px; color: #0d3764; font-size: 16px; }
    .contract-doc-section p, .contract-sign-section p { margin: 0; font-size: 14px; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th, td { border: 1px solid #ccd9e8; padding: 8px; text-align: left; vertical-align: top; }
    th { width: 28%; color: #0d3764; background: #f2f8ff; }
    .contract-dl { display: grid; grid-template-columns: 1fr 1fr; margin: 0 0 10px; border-top: 1px solid #ccd9e8; border-left: 1px solid #ccd9e8; }
    .contract-dl div { display: grid; grid-template-columns: 128px 1fr; border-right: 1px solid #ccd9e8; border-bottom: 1px solid #ccd9e8; }
    .contract-dl dt, .contract-dl dd { margin: 0; padding: 8px; font-size: 14px; }
    .contract-dl dt { color: #0d3764; background: #f2f8ff; font-weight: 900; }
    .contract-dl dd { font-weight: 700; }
    .contract-sign-section { margin-top: 24px; padding-top: 16px; border-top: 2px solid #172033; }
    .signature-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 18px; }
    .signature-grid > div { min-height: 180px; padding: 14px; border: 1px solid #ccd9e8; }
    .signature-line { display: block; height: 54px; border-bottom: 1px solid #172033; }
    .signature-image { width: 100%; height: 70px; object-fit: contain; object-position: left center; border-bottom: 1px solid #172033; }
    @media print { @page { size: A4; margin: 12mm; } .contract-document { max-width: none; padding: 0; } }
  </style>
</head>
<body>
  <article class="contract-document">${createContractHtml(data)}</article>
</body>
</html>`;
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `contract-${new Date().toISOString().slice(0, 10)}.html`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function saveDraft() {
  if (!form) {
    return;
  }

  try {
    sessionStorage.setItem("orderAutoContractDraft", JSON.stringify(Object.fromEntries(new FormData(form).entries())));
  } catch {
    // 入力中の下書き保存に失敗しても、契約書作成自体は続けられる。
  }
}

function restoreDraft() {
  if (!form) {
    return;
  }

  try {
    const draft = JSON.parse(sessionStorage.getItem("orderAutoContractDraft") || "{}");
    Object.entries(draft).forEach(([name, value]) => {
      const field = form.elements[name];
      if (!field) {
        return;
      }

      if (field instanceof RadioNodeList) {
        [...field].forEach((radio) => {
          radio.checked = radio.value === value;
        });
      } else {
        field.value = value;
      }
    });
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

function formatDate(value) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
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

function blankText() {
  return "＿＿＿＿＿＿＿＿";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
