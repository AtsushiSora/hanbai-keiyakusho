import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_CONFIG } from "./supabase-config.js";

const ENABLE_TEST_LOGIN = true;

const testLoginStorageKey = "orderAutoTestLogin";
const draftStorageKey = "orderAutoContractDraft";
const tableName = SUPABASE_CONFIG.tableName || "order_auto_contracts";
const maxSalesOptionRows = 14;

const loginPanel = document.querySelector("#loginPanel");
const loginForm = document.querySelector("#adminLoginForm");
const authStatus = document.querySelector("#authStatus");
const adminUserLabel = document.querySelector("#adminUserLabel");
const logoutButton = document.querySelector("#adminLogoutButton");
const testLoginButton = document.querySelector("#testLoginButton");
const refreshServerContractsButton = document.querySelector("#refreshServerContractsButton");
const serverContractSelect = document.querySelector("#serverContractSelect");
const loadServerContractButton = document.querySelector("#loadServerContractButton");
const loadRemoteContractButton = document.querySelector("#loadRemoteContractButton");
const saveServerContractButton = document.querySelector("#saveServerContractButton");
const saveEstimateButton = document.querySelector("#saveEstimateButton");
const convertEstimateButton = document.querySelector("#convertEstimateButton");
const deleteServerContractButton = document.querySelector("#deleteServerContractButton");
const serverContractStatus = document.querySelector("#serverContractStatus");
const contractCardList = document.querySelector("#contractCardList");
const contractListSearch = document.querySelector("#contractListSearch");
const contractStatusTabs = document.querySelector("#contractStatusTabs");
const exportContractsButton = document.querySelector("#exportContractsButton");
const importContractsButton = document.querySelector("#importContractsButton");
const importContractsFile = document.querySelector("#importContractsFile");

const supabase = isSupabaseConfigured()
  ? createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

let currentUser = null;
let cloudContracts = [];
let isTestLogin = false;
let activeStatusFilter = "all";
let activeSearchTerm = "";
let isConvertingEstimate = false;

initAdminAuth();

async function initAdminAuth() {
  setupTestLoginButton();

  loginForm?.addEventListener("submit", handleLoginSubmit);
  logoutButton?.addEventListener("click", handleLogout);
  refreshServerContractsButton?.addEventListener("click", loadCloudContracts);
  saveServerContractButton?.addEventListener("click", () => saveCloudContract());
  saveEstimateButton?.addEventListener("click", () => saveCloudContract("見積書"));
  convertEstimateButton?.addEventListener("click", convertCurrentEstimateToContract);
  loadServerContractButton?.addEventListener("click", () => loadSelectedContract("create"));
  loadRemoteContractButton?.addEventListener("click", () => loadSelectedContract("remote"));
  deleteServerContractButton?.addEventListener("click", deleteSelectedContract);
  serverContractSelect?.addEventListener("change", () => setCloudButtonsDisabled(!serverContractSelect.value));
  contractListSearch?.addEventListener("input", () => {
    activeSearchTerm = contractListSearch.value.trim().toLowerCase();
    renderCloudContracts(serverContractSelect?.value || "");
  });
  contractStatusTabs?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-filter]");
    if (!button) {
      return;
    }
    activeStatusFilter = button.dataset.filter || "all";
    contractStatusTabs.querySelectorAll("[data-filter]").forEach((filterButton) => {
      filterButton.classList.toggle("active", filterButton === button);
    });
    renderCloudContracts(serverContractSelect?.value || "");
  });
  contractCardList?.addEventListener("click", handleContractCardAction);
  exportContractsButton?.addEventListener("click", exportContractsJson);
  importContractsButton?.addEventListener("click", () => importContractsFile?.click());
  importContractsFile?.addEventListener("change", importContractsJson);

  if (ENABLE_TEST_LOGIN && sessionStorage.getItem(testLoginStorageKey) === "1") {
    activateTestLogin();
    return;
  }

  if (!supabase) {
    applyLoggedOutState("Supabase設定が未入力です。src/supabase-config.js にURLとanon keyを設定してください。");
    return;
  }

  const { data } = await supabase.auth.getSession();
  currentUser = data.session?.user || null;
  if (currentUser) {
    await activateCloudLogin();
  } else {
    applyLoggedOutState("Supabaseに登録した管理者アカウントでログインしてください。");
  }

  supabase.auth.onAuthStateChange(async (_event, session) => {
    if (isTestLogin) {
      return;
    }
    currentUser = session?.user || null;
    if (currentUser) {
      await activateCloudLogin();
    } else {
      applyLoggedOutState("Supabaseに登録した管理者アカウントでログインしてください。");
    }
  });
}

async function handleLoginSubmit(event) {
  event.preventDefault();
  if (!loginForm) {
    return;
  }

  if (!supabase) {
    setAuthStatus("Supabase設定が未入力です。src/supabase-config.js を設定してください。");
    return;
  }

  const formData = new FormData(loginForm);
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  if (!email || !password) {
    setAuthStatus("メールアドレスとパスワードを入力してください。");
    return;
  }

  setLoginFormDisabled(true);
  setAuthStatus("ログインしています。");
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  setLoginFormDisabled(false);

  if (error || !data.user) {
    setAuthStatus("ログインできませんでした。メールアドレスまたはパスワードを確認してください。");
    return;
  }

  currentUser = data.user;
  isTestLogin = false;
  sessionStorage.removeItem(testLoginStorageKey);
  loginForm.reset();
  await activateCloudLogin();
}

async function handleLogout() {
  sessionStorage.removeItem(testLoginStorageKey);
  isTestLogin = false;
  currentUser = null;
  cloudContracts = [];
  if (supabase) {
    await supabase.auth.signOut();
  }
  applyLoggedOutState("ログアウトしました。");
}

function setupTestLoginButton() {
  if (!testLoginButton) {
    return;
  }
  testLoginButton.hidden = !ENABLE_TEST_LOGIN;
  testLoginButton.addEventListener("click", activateTestLogin);
}

function activateTestLogin() {
  isTestLogin = true;
  currentUser = { email: "test-admin@example.local" };
  sessionStorage.setItem(testLoginStorageKey, "1");
  document.body.classList.remove("auth-loading");
  document.body.classList.add("is-admin-authenticated");
  if (loginPanel) {
    loginPanel.hidden = true;
  }
  if (adminUserLabel) {
    adminUserLabel.textContent = "テスト用ログイン中";
  }
  cloudContracts = getLocalTestContracts();
  renderCloudContracts();
  setStoredStatus("テスト用ログイン中です。保存はこのブラウザ内だけで確認できます。");
}

async function activateCloudLogin() {
  isTestLogin = false;
  document.body.classList.remove("auth-loading");
  document.body.classList.add("is-admin-authenticated");
  if (loginPanel) {
    loginPanel.hidden = true;
  }
  if (adminUserLabel) {
    adminUserLabel.textContent = `${currentUser?.email || "管理者"} でログイン中`;
  }
  setAuthStatus("");
  await loadCloudContracts();
}

function applyLoggedOutState(message) {
  document.body.classList.remove("auth-loading");
  document.body.classList.remove("is-admin-authenticated");
  if (loginPanel) {
    loginPanel.hidden = false;
  }
  if (adminUserLabel) {
    adminUserLabel.textContent = "ログイン中";
  }
  setAuthStatus(message);
  setStoredStatus("");
  cloudContracts = [];
  renderCloudContracts();
}

async function loadCloudContracts() {
  if (isTestLogin) {
    cloudContracts = getLocalTestContracts();
    renderCloudContracts(serverContractSelect?.value || "");
    setStoredStatus(cloudContracts.length ? `${cloudContracts.length}件の契約を読み込みました。` : "保存済み契約はありません。");
    return;
  }

  if (!supabase || !currentUser) {
    return;
  }

  setStoredStatus("契約一覧を読み込んでいます。");
  const { data, error } = await supabase
    .from(tableName)
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) {
    cloudContracts = [];
    renderCloudContracts();
    setStoredStatus("契約一覧を読み込めませんでした。Supabaseのテーブル設定を確認してください。");
    return;
  }

  cloudContracts = (data || []).map(fromSupabaseRecord);
  renderCloudContracts(serverContractSelect?.value || "");
  setStoredStatus(cloudContracts.length ? `${cloudContracts.length}件の契約を読み込みました。` : "保存済み契約はありません。");
}

function renderCloudContracts(selectedId = "") {
  if (serverContractSelect) {
    if (!cloudContracts.length) {
      serverContractSelect.innerHTML = '<option value="">保存済み契約はありません</option>';
      setCloudButtonsDisabled(true);
    } else {
      serverContractSelect.innerHTML = [
        '<option value="">契約を選択してください</option>',
        ...cloudContracts.map((contract) => `<option value="${escapeHtml(contract.id)}">${escapeHtml(getStoredContractLabel(contract))}</option>`),
      ].join("");
      serverContractSelect.value = selectedId;
      setCloudButtonsDisabled(!serverContractSelect.value);
    }
  }
  renderContractCards(selectedId);
}

async function saveCloudContract(requestedDocumentType = "") {
  if (!window.contractTool) {
    setStoredStatus("契約書作成ページで保存してください。");
    return;
  }

  if (requestedDocumentType === "見積書") {
    window.contractTool.prepareEstimate();
  }
  const payload = window.contractTool.getRecordPayload();
  const selectedId = serverContractSelect?.value || "";
  const documentType = payload.data?.documentType || "契約書";
  const selectedContract = cloudContracts.find((contract) => contract.id === selectedId);
  const canOverwriteSelected = selectedContract && toDisplayContract(selectedContract).documentType === documentType;
  const record = normalizeContractRecord({
    id: canOverwriteSelected ? selectedId : createRecordId(),
    data: payload.data || {},
  });

  if (isTestLogin) {
    saveLocalTestContract(record);
    cloudContracts = getLocalTestContracts();
    renderCloudContracts(record.id);
    setStoredStatus(`テスト用として${documentType}をブラウザ内に保存しました。`);
    return;
  }

  if (!supabase || !currentUser) {
    setStoredStatus("Supabaseログイン後に保存できます。");
    return;
  }

  setStoredStatus(`${documentType}をクラウド保存しています。`);
  const dbRecord = toSupabaseRecord(record, currentUser.id);
  const { data, error } = await supabase
    .from(tableName)
    .upsert(dbRecord, { onConflict: "id" })
    .select()
    .single();

  if (error) {
    setStoredStatus(`${documentType}をクラウド保存できませんでした。SupabaseのRLS設定を確認してください。`);
    return;
  }

  await loadCloudContracts();
  renderCloudContracts(data?.id || record.id);
  setStoredStatus(`${documentType}をクラウド保存しました。`);
}

async function convertCurrentEstimateToContract() {
  if (!window.contractTool) {
    setStoredStatus("見積書を開いてから変換してください。");
    return;
  }
  const payload = window.contractTool.getRecordPayload();
  const selectedId = serverContractSelect?.value || "";
  await convertEstimateToContract(payload.data || {}, selectedId);
}

async function convertStoredEstimateToContract(id) {
  const selected = cloudContracts.find((contract) => contract.id === id);
  if (!selected) {
    setStoredStatus("変換する見積書を読み込めませんでした。");
    return;
  }
  await convertEstimateToContract(selected.data || {}, selected.id);
}

async function convertEstimateToContract(sourceData, sourceId = "") {
  if ((sourceData.documentType || "契約書") !== "見積書") {
    setStoredStatus("見積書だけを契約書へ変換できます。");
    return;
  }
  if (!isTestLogin && (!supabase || !currentUser)) {
    setStoredStatus("Supabaseログイン後に契約書へ変換できます。");
    return;
  }
  if (isConvertingEstimate) {
    return;
  }
  isConvertingEstimate = true;
  setEstimateConversionDisabled(true);

  try {
    const convertedData = {
      ...sourceData,
      documentType: "契約書",
      contractStatus: "下書き",
      remoteStatus: "下書き",
      convertedFromEstimateId: sourceId,
      convertedAt: new Date().toISOString(),
    };
    const record = normalizeContractRecord({
      id: createRecordId(),
      data: convertedData,
    });

    setStoredStatus("見積書から契約書を作成しています。");
    if (isTestLogin) {
      saveLocalTestContract(record);
      cloudContracts = getLocalTestContracts();
      finishEstimateConversion(record);
      return;
    }

    const { data, error } = await supabase
      .from(tableName)
      .insert(toSupabaseRecord(record, currentUser.id))
      .select()
      .single();
    if (error) {
      setStoredStatus("契約書へ変換できませんでした。SupabaseのRLS設定を確認してください。");
      return;
    }

    await loadCloudContracts();
    const savedRecord = data ? fromSupabaseRecord(data) : record;
    finishEstimateConversion(savedRecord);
  } finally {
    isConvertingEstimate = false;
    setEstimateConversionDisabled(false);
  }
}

function setEstimateConversionDisabled(disabled) {
  if (convertEstimateButton) {
    convertEstimateButton.disabled = disabled;
  }
  contractCardList?.querySelectorAll('[data-contract-action="convert"]').forEach((button) => {
    button.disabled = disabled;
  });
}

function finishEstimateConversion(record) {
  activeStatusFilter = "all";
  contractStatusTabs?.querySelectorAll("[data-filter]").forEach((button) => {
    button.classList.toggle("active", button.dataset.filter === "all");
  });
  renderCloudContracts(record.id);
  window.contractTool?.loadRecordPayload(record);
  setStoredStatus("見積書を残して、新しい契約書を下書き保存しました。");
}

function loadSelectedContract(targetPage = "create") {
  const selectedId = serverContractSelect?.value || "";
  if (!selectedId) {
    setStoredStatus("読み込む契約を選択してください。");
    return;
  }

  const selected = cloudContracts.find((contract) => contract.id === selectedId);
  if (!selected) {
    setStoredStatus("契約を読み込めませんでした。");
    loadCloudContracts();
    return;
  }

  if (targetPage === "remote") {
    transferContractToPage(selected, "contract-contact.html");
    return;
  }

  if (document.body.classList.contains("contract-list-page")) {
    transferContractToPage(selected, "contract-create.html");
    return;
  }

  if (!window.contractTool) {
    setStoredStatus("契約書作成ページで読み込んでください。");
    return;
  }
  window.contractTool.loadRecordPayload(selected);
  setStoredStatus("契約情報をフォームに読み込みました。");
}

async function deleteSelectedContract() {
  const selectedId = serverContractSelect?.value || "";
  if (!selectedId) {
    setStoredStatus("削除する契約を選択してください。");
    return;
  }

  const selected = cloudContracts.find((contract) => contract.id === selectedId);
  const label = selected ? getStoredContractLabel(selected) : "選択した契約";
  if (!window.confirm(`${label}を削除します。よろしいですか。`)) {
    return;
  }

  if (isTestLogin) {
    deleteLocalTestContract(selectedId);
    cloudContracts = getLocalTestContracts();
    renderCloudContracts();
    setStoredStatus("契約を削除しました。");
    return;
  }

  if (!supabase || !currentUser) {
    setStoredStatus("Supabaseログイン後に削除できます。");
    return;
  }

  const { error } = await supabase.from(tableName).delete().eq("id", selectedId);
  if (error) {
    setStoredStatus("契約を削除できませんでした。");
    return;
  }

  await loadCloudContracts();
  setStoredStatus("契約を削除しました。");
}

function handleContractCardAction(event) {
  const button = event.target.closest("[data-contract-action]");
  if (!button) {
    return;
  }

  const id = button.dataset.contractId || "";
  const action = button.dataset.contractAction || "";
  if (!id || !action) {
    return;
  }

  if (serverContractSelect) {
    serverContractSelect.value = id;
    setCloudButtonsDisabled(false);
  }

  if (action === "edit") {
    loadSelectedContract("create");
  } else if (action === "remote") {
    loadSelectedContract("remote");
  } else if (action === "convert") {
    convertStoredEstimateToContract(id);
  } else if (action === "delete") {
    deleteSelectedContract();
  }
}

function transferContractToPage(contract, targetPath) {
  try {
    sessionStorage.setItem(draftStorageKey, JSON.stringify(contract.data || {}));
    window.location.href = targetPath;
  } catch {
    setStoredStatus("契約情報を次のページへ渡せませんでした。");
  }
}

function renderContractCards(selectedId = "") {
  if (!contractCardList) {
    return;
  }

  const displayContracts = getFilteredDisplayContracts();
  if (!displayContracts.length) {
    contractCardList.innerHTML = '<div class="contract-list-empty">表示できる契約はありません。</div>';
    return;
  }

  contractCardList.innerHTML = displayContracts.map((contract) => {
    const selectedClass = contract.id === selectedId ? " is-selected" : "";
    const remoteButtonLabel = contract.documentType === "見積書" ? "見積書を送る" : "メール・LINE契約";
    const convertButton = contract.documentType === "見積書"
      ? `<button class="secondary-button compact convert-contract-button" type="button" data-contract-action="convert" data-contract-id="${escapeHtml(contract.id)}">契約書に変換</button>`
      : "";
    return `
      <article class="contract-list-card${selectedClass}">
        <div class="contract-card-main">
          <strong>${escapeHtml(contract.buyerName || "買主未入力")}</strong>
          <span>${escapeHtml(getContractCardMeta(contract))}</span>
        </div>
        <div class="contract-card-actions">
          <span class="document-type-pill">${escapeHtml(contract.documentType)}</span>
          <span class="status-pill">${escapeHtml(contract.status || "下書き")}</span>
          ${convertButton}
          <button class="secondary-button compact" type="button" data-contract-action="remote" data-contract-id="${escapeHtml(contract.id)}">${remoteButtonLabel}</button>
          <button class="secondary-button compact" type="button" data-contract-action="edit" data-contract-id="${escapeHtml(contract.id)}">編集</button>
          <button class="secondary-button compact danger" type="button" data-contract-action="delete" data-contract-id="${escapeHtml(contract.id)}">削除</button>
        </div>
      </article>
    `;
  }).join("");
}

function getFilteredDisplayContracts() {
  return cloudContracts.map(toDisplayContract).filter((contract) => {
    const status = contract.status || "下書き";
    const matchesStatus = activeStatusFilter === "all" || status === activeStatusFilter;
    const searchSource = [
      contract.id,
      contract.buyerName,
      contract.vehicleName,
      contract.totalPrice,
      contract.documentType,
      status,
    ].join(" ").toLowerCase();
    const matchesSearch = !activeSearchTerm || searchSource.includes(activeSearchTerm);
    return matchesStatus && matchesSearch;
  });
}

function exportContractsJson() {
  const payload = {
    exportedAt: new Date().toISOString(),
    source: isTestLogin ? "test-local" : "supabase",
    contracts: cloudContracts,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = `order-auto-sales-contracts-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
  setStoredStatus("JSONを出力しました。");
}

async function importContractsJson() {
  const file = importContractsFile?.files?.[0];
  if (!file) {
    return;
  }

  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const incoming = Array.isArray(parsed) ? parsed : parsed.contracts;
    if (!Array.isArray(incoming)) {
      throw new Error("Invalid JSON");
    }

    const normalized = incoming.map(normalizeContractRecord);
    if (isTestLogin) {
      normalized.forEach(saveLocalTestContract);
      cloudContracts = getLocalTestContracts();
      renderCloudContracts();
      setStoredStatus(`${normalized.length}件の契約を取り込みました。`);
      return;
    }

    if (!supabase || !currentUser) {
      setStoredStatus("Supabaseログイン後にJSON取込できます。");
      return;
    }

    const dbRecords = normalized.map((record) => toSupabaseRecord(record, currentUser.id));
    const { error } = await supabase.from(tableName).upsert(dbRecords, { onConflict: "id" });
    if (error) {
      throw error;
    }
    await loadCloudContracts();
    setStoredStatus(`${normalized.length}件の契約を取り込みました。`);
  } catch {
    setStoredStatus("JSONを取り込めませんでした。ファイル形式やSupabase設定を確認してください。");
  } finally {
    if (importContractsFile) {
      importContractsFile.value = "";
    }
  }
}

function toSupabaseRecord(record, userId) {
  const normalized = normalizeContractRecord(record);
  return {
    id: normalized.id,
    user_id: userId,
    buyer_name: normalized.buyerName,
    vehicle_name: normalized.vehicleName,
    total_price: normalized.totalPrice,
    status: normalized.status,
    data: normalized.data,
    updated_at: new Date().toISOString(),
  };
}

function fromSupabaseRecord(record) {
  return normalizeContractRecord({
    id: record.id,
    savedAt: record.created_at,
    updatedAt: record.updated_at,
    buyerName: record.buyer_name,
    vehicleName: record.vehicle_name,
    totalPrice: record.total_price,
    status: record.status,
    data: record.data || {},
  });
}

function normalizeContractRecord(record) {
  const data = record.data || record || {};
  const now = new Date().toISOString();
  const normalized = {
    id: sanitizeRecordId(record.id) || createRecordId(),
    savedAt: record.savedAt || record.createdAt || now,
    updatedAt: record.updatedAt || record.savedAt || record.createdAt || now,
    data,
  };
  const display = toDisplayContract(normalized);
  normalized.buyerName = record.buyerName || display.buyerName;
  normalized.vehicleName = record.vehicleName || display.vehicleName;
  normalized.totalPrice = record.totalPrice || display.totalPrice;
  normalized.status = record.status || display.status;
  normalized.documentType = record.documentType || display.documentType;
  return normalized;
}

function toDisplayContract(record) {
  const data = record.data || {};
  return {
    id: record.id,
    buyerName: record.buyerName || data.buyerName || "",
    vehicleName: record.vehicleName || data.vehicleName || "",
    totalPrice: record.totalPrice || formatPrice(data.totalPrice || calculateTotal(data)) || "",
    status: record.status || data.remoteStatus || data.contractStatus || "下書き",
    documentType: record.documentType || data.documentType || "契約書",
    updatedAt: record.updatedAt || record.savedAt || "",
    data,
  };
}

function getContractCardMeta(contract) {
  const vehicle = contract.vehicleName || "車両未入力";
  const price = contract.totalPrice || "金額未入力";
  return `${vehicle} / ${contract.documentType} / ${price}`;
}

function getStoredContractLabel(contract) {
  const display = toDisplayContract(contract);
  const buyer = display.buyerName || "買主未入力";
  const vehicle = display.vehicleName || "車両未入力";
  const price = display.totalPrice || "金額未入力";
  return `${formatDate(display.updatedAt)} / ${display.documentType} / ${buyer} / ${vehicle} / ${price}`;
}

function getLocalTestContracts() {
  try {
    const parsed = JSON.parse(localStorage.getItem("orderAutoContractRecords") || "[]");
    return Array.isArray(parsed) ? parsed.map(normalizeContractRecord) : [];
  } catch {
    return [];
  }
}

function saveLocalTestContract(record) {
  const records = getLocalTestContracts();
  const index = records.findIndex((item) => item.id === record.id);
  if (index >= 0) {
    records[index] = normalizeContractRecord(record);
  } else {
    records.unshift(normalizeContractRecord(record));
  }
  localStorage.setItem("orderAutoContractRecords", JSON.stringify(records.slice(0, 100)));
}

function deleteLocalTestContract(id) {
  const records = getLocalTestContracts().filter((record) => record.id !== id);
  localStorage.setItem("orderAutoContractRecords", JSON.stringify(records));
}

function calculateTotal(data) {
  const total = getVehicleTotal(data) + getExpenseTotal(data) - toNumber(data.discount);
  return total > 0 ? String(total) : "";
}

function getVehicleTotal(data) {
  const vehicleBase = toNumber(data.storeDeliveryPrice) || toNumber(data.basePrice);
  return vehicleBase
    + sumOptionPrices(data)
    + toNumber(data.dealerOptionPrice)
    + toNumber(data.makerOptionPrice)
    + toNumber(data.customPrice);
}

function sumOptionPrices(data) {
  return Array.from({ length: maxSalesOptionRows }, (_, index) => index + 1)
    .reduce((total, number) => total + toNumber(data[`optionPrice${number}`]), 0);
}

function getExpenseTotal(data) {
  const summaryExpenses = toNumber(data.taxInsurance || data.taxes)
    + toNumber(data.salesExpense || data.fees)
    + toNumber(data.otherExpense)
    + toNumber(data.optionalExpense);
  const detailedExpenses = toNumber(data.autoTaxAmount)
    + toNumber(data.weightTax)
    + toNumber(data.liabilityInsurance)
    + toNumber(data.inspectionRegisterFee)
    + toNumber(data.parkingCertificateFee)
    + toNumber(data.autoTaxAdjustment)
    + toNumber(data.liabilityAdjustment)
    + toNumber(data.fundManagementFee)
    + toNumber(data.parkingActualFee)
    + toNumber(data.recycleDeposit || data.recycleFee);
  return summaryExpenses || detailedExpenses;
}

function formatPrice(value) {
  const price = toNumber(value);
  return price > 0 ? `金 ${price.toLocaleString("ja-JP")} 円` : "";
}

function toNumber(value) {
  const number = Number(String(value || "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(number) ? number : 0;
}

function formatDate(value) {
  if (!value) {
    return "日時未記録";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function sanitizeRecordId(value) {
  const id = String(value || "").replace(/[^a-zA-Z0-9_-]/g, "");
  return id.length > 0 && id.length <= 120 ? id : "";
}

function createRecordId() {
  return window.crypto?.randomUUID ? window.crypto.randomUUID() : `contract-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isSupabaseConfigured() {
  return Boolean(SUPABASE_CONFIG.url && SUPABASE_CONFIG.anonKey);
}

function setAuthStatus(message) {
  if (authStatus) {
    authStatus.textContent = message;
  }
}

function setStoredStatus(message) {
  if (serverContractStatus) {
    serverContractStatus.textContent = message;
  }
}

function setLoginFormDisabled(disabled) {
  loginForm?.querySelectorAll("input, button").forEach((element) => {
    element.disabled = disabled;
  });
}

function setCloudButtonsDisabled(disabled) {
  if (loadServerContractButton) {
    loadServerContractButton.disabled = disabled;
  }
  if (loadRemoteContractButton) {
    loadRemoteContractButton.disabled = disabled;
  }
  if (deleteServerContractButton) {
    deleteServerContractButton.disabled = disabled;
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
