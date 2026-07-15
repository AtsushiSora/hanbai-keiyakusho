import { getUser, handleAuthCallback, login, logout, onAuthChange } from "@netlify/identity";

const ENABLE_TEST_LOGIN = true;
const testLoginStorageKey = "orderAutoTestLogin";

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
const deleteServerContractButton = document.querySelector("#deleteServerContractButton");
const serverContractStatus = document.querySelector("#serverContractStatus");
const contractCardList = document.querySelector("#contractCardList");
const contractListSearch = document.querySelector("#contractListSearch");
const contractStatusTabs = document.querySelector("#contractStatusTabs");
const exportContractsButton = document.querySelector("#exportContractsButton");
const importContractsButton = document.querySelector("#importContractsButton");
const importContractsFile = document.querySelector("#importContractsFile");

let currentUser = null;
let serverContracts = [];
let isTestLogin = false;
let listFilter = "all";
let listSearch = "";

initAdminAuth();

async function initAdminAuth() {
  setAuthStatus("ログイン状態を確認しています。");
  setupTestLoginButton();

  if (ENABLE_TEST_LOGIN && sessionStorage.getItem(testLoginStorageKey) === "1") {
    activateTestLogin();
    return;
  }

  try {
    await handleAuthCallback();
  } catch {
    setAuthStatus("ログイン確認でエラーが発生しました。再度ログインしてください。");
  }

  currentUser = await getUser();
  await applyAuthState();

  onAuthChange(async (_event, user) => {
    currentUser = user;
    await applyAuthState();
  });
}

loginForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(loginForm);
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");

  if (!email || !password) {
    setAuthStatus("メールアドレスとパスワードを入力してください。");
    return;
  }

  setAuthStatus("ログインしています。");
  setAuthControlsDisabled(true);

  try {
    currentUser = await login(email, password);
    loginForm.reset();
    await applyAuthState();
  } catch {
    setAuthStatus("ログインできませんでした。メールアドレスまたはパスワードを確認してください。");
  } finally {
    setAuthControlsDisabled(false);
  }
});

logoutButton?.addEventListener("click", async () => {
  if (isTestLogin) {
    sessionStorage.removeItem(testLoginStorageKey);
  } else {
    await logout();
  }
  isTestLogin = false;
  currentUser = null;
  serverContracts = [];
  renderServerContracts();
  await applyAuthState();
});

refreshServerContractsButton?.addEventListener("click", loadServerContracts);
saveServerContractButton?.addEventListener("click", saveServerContract);
loadServerContractButton?.addEventListener("click", loadSelectedServerContract);
loadRemoteContractButton?.addEventListener("click", () => loadSelectedServerContract("remote"));
deleteServerContractButton?.addEventListener("click", deleteSelectedServerContract);
serverContractSelect?.addEventListener("change", () => setServerButtonsDisabled(!serverContractSelect.value));
contractListSearch?.addEventListener("input", () => {
  listSearch = contractListSearch.value.trim().toLowerCase();
  renderServerContracts(serverContractSelect?.value || "");
});
contractStatusTabs?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-filter]");
  if (!button) {
    return;
  }
  listFilter = button.dataset.filter || "all";
  contractStatusTabs.querySelectorAll("[data-filter]").forEach((item) => {
    item.classList.toggle("active", item === button);
  });
  renderServerContracts(serverContractSelect?.value || "");
});
contractCardList?.addEventListener("click", handleContractCardClick);
exportContractsButton?.addEventListener("click", exportContractsJson);
importContractsButton?.addEventListener("click", () => importContractsFile?.click());
importContractsFile?.addEventListener("change", importContractsJson);

async function applyAuthState() {
  document.body.classList.remove("auth-loading");

  if (isTestLogin) {
    document.body.classList.add("is-admin-authenticated");
    loginPanel.hidden = true;
    adminUserLabel.textContent = "テスト用ログイン中";
    serverContracts = [];
    renderServerContracts();
    setAuthStatus("");
    setServerStatus("テスト用ログイン中です。サーバー保存・契約一覧はNetlifyログイン時のみ利用できます。");
    return;
  }

  if (!currentUser) {
    document.body.classList.remove("is-admin-authenticated");
    loginPanel.hidden = false;
    setAuthStatus("管理者アカウントでログインしてください。");
    return;
  }

  adminUserLabel.textContent = `${currentUser.email || "管理者"} でログイン中`;

  try {
    await loadServerContracts();
    document.body.classList.add("is-admin-authenticated");
    loginPanel.hidden = true;
    setAuthStatus("");
  } catch (error) {
    document.body.classList.remove("is-admin-authenticated");
    loginPanel.hidden = false;
    setAuthStatus(error?.status === 403 ? "このアカウントには管理者権限がありません。" : "認証確認に失敗しました。");
  }
}

async function loadServerContracts() {
  if (isTestLogin) {
    serverContracts = [];
    renderServerContracts();
    setServerStatus("テスト用ログイン中はサーバー契約一覧を利用できません。");
    return;
  }

  if (!currentUser) {
    return;
  }

  setServerStatus("契約一覧を読み込んでいます。");
  const response = await fetch("/api/contracts", {
    headers: authHeaders(),
    credentials: "same-origin",
  });

  if (!response.ok) {
    const error = new Error("Contract list failed");
    error.status = response.status;
    throw error;
  }

  const result = await response.json();
  serverContracts = Array.isArray(result.contracts) ? result.contracts : [];
  renderServerContracts();
  setServerStatus(serverContracts.length ? `${serverContracts.length}件の契約を読み込みました。` : "保存済み契約はありません。");
}

function renderServerContracts(selectedId = "") {
  if (serverContractSelect && !serverContracts.length) {
    serverContractSelect.innerHTML = '<option value="">保存済み契約はありません</option>';
    setServerButtonsDisabled(true);
  }

  if (serverContractSelect && serverContracts.length) {
    serverContractSelect.innerHTML = [
    '<option value="">契約を選択してください</option>',
    ...serverContracts.map((contract) => `<option value="${escapeHtml(contract.id)}">${escapeHtml(getServerContractLabel(contract))}</option>`),
    ].join("");
    serverContractSelect.value = selectedId;
    setServerButtonsDisabled(!serverContractSelect.value);
  }

  renderContractCards(selectedId);
}

async function saveServerContract() {
  if (isTestLogin) {
    setServerStatus("テスト用ログイン中はサーバー保存できません。印刷・PDF保存や端末内履歴で確認してください。");
    return;
  }

  if (!currentUser || !window.contractTool) {
    return;
  }

  const selectedId = serverContractSelect?.value || "";
  const payload = window.contractTool.getRecordPayload();
  setServerStatus("契約を保存しています。");

  const response = await fetch(selectedId ? `/api/contracts/${encodeURIComponent(selectedId)}` : "/api/contracts", {
    method: "POST",
    headers: {
      ...authHeaders(),
      "Content-Type": "application/json",
    },
    credentials: "same-origin",
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    setServerStatus("契約を保存できませんでした。");
    return;
  }

  const result = await response.json();
  await loadServerContracts();
  renderServerContracts(result.contract?.id || selectedId);
  setServerStatus("契約をサーバーに保存しました。");
}

async function loadSelectedServerContract(targetPage = "create") {
  if (isTestLogin) {
    setServerStatus("テスト用ログイン中はサーバー契約の読み込みはできません。");
    return;
  }

  const selectedId = serverContractSelect?.value;
  if (!selectedId) {
    setServerStatus("読み込む契約を選択してください。");
    return;
  }

  setServerStatus("契約を読み込んでいます。");
  const response = await fetch(`/api/contracts/${encodeURIComponent(selectedId)}`, {
    headers: authHeaders(),
    credentials: "same-origin",
  });

  if (!response.ok) {
    setServerStatus("契約を読み込めませんでした。");
    return;
  }

  const result = await response.json();
  if (targetPage === "remote") {
    try {
      sessionStorage.setItem("orderAutoContractDraft", JSON.stringify(result.contract?.data || {}));
    } catch {
      setServerStatus("契約情報をメール・LINE契約ページへ渡せませんでした。");
      return;
    }
    window.location.href = "contract-contact.html";
    return;
  }

  if (document.body.classList.contains("contract-list-page")) {
    try {
      sessionStorage.setItem("orderAutoContractDraft", JSON.stringify(result.contract?.data || {}));
    } catch {
      setServerStatus("契約情報を作成ページへ渡せませんでした。");
      return;
    }
    window.location.href = "contract-create.html";
    return;
  }

  if (!window.contractTool) {
    setServerStatus("契約書作成ページで読み込んでください。");
    return;
  }

  window.contractTool.loadRecordPayload(result.contract);
  setServerStatus("契約情報をフォームに読み込みました。");
}

async function deleteSelectedServerContract() {
  if (isTestLogin) {
    setServerStatus("テスト用ログイン中はサーバー契約の削除はできません。");
    return;
  }

  const selectedId = serverContractSelect?.value;
  if (!selectedId) {
    setServerStatus("削除する契約を選択してください。");
    return;
  }

  const selected = serverContracts.find((contract) => contract.id === selectedId);
  if (!window.confirm(`${selected ? getServerContractLabel(selected) : "選択した契約"}をサーバーから削除します。よろしいですか。`)) {
    return;
  }

  const response = await fetch(`/api/contracts/${encodeURIComponent(selectedId)}`, {
    method: "DELETE",
    headers: authHeaders(),
    credentials: "same-origin",
  });

  if (!response.ok) {
    setServerStatus("契約を削除できませんでした。");
    return;
  }

  await loadServerContracts();
  setServerStatus("契約を削除しました。");
}

async function handleContractCardClick(event) {
  const button = event.target.closest("[data-contract-action]");
  if (!button) {
    return;
  }

  const id = button.dataset.contractId || "";
  const source = button.dataset.contractSource || "server";
  const action = button.dataset.contractAction || "";
  if (!id || !action) {
    return;
  }

  if (source === "local") {
    handleLocalContractAction(id, action);
    return;
  }

  if (serverContractSelect) {
    serverContractSelect.value = id;
    setServerButtonsDisabled(false);
  }

  if (action === "edit") {
    await loadSelectedServerContract("create");
  } else if (action === "remote") {
    await loadSelectedServerContract("remote");
  } else if (action === "delete") {
    await deleteSelectedServerContract();
  }
}

function handleLocalContractAction(id, action) {
  const record = getLocalContractRecords().find((item) => item.id === id);
  if (!record) {
    setServerStatus("契約を読み込めませんでした。");
    renderServerContracts();
    return;
  }

  if (action === "delete") {
    if (!window.confirm(`${getContractCardTitle(toDisplayContract(record, "local"))}を削除します。よろしいですか。`)) {
      return;
    }
    const nextRecords = getLocalContractRecords().filter((item) => item.id !== id);
    writeLocalContractRecords(nextRecords);
    renderServerContracts();
    setServerStatus("端末内の契約を削除しました。");
    return;
  }

  try {
    sessionStorage.setItem("orderAutoContractDraft", JSON.stringify(record.data || {}));
  } catch {
    setServerStatus("契約情報を次のページへ渡せませんでした。");
    return;
  }
  window.location.href = action === "remote" ? "contract-contact.html" : "contract-create.html";
}

function renderContractCards(selectedId = "") {
  if (!contractCardList) {
    return;
  }

  const contracts = getVisibleContracts();
  if (!contracts.length) {
    contractCardList.innerHTML = `<div class="contract-list-empty">${isTestLogin ? "端末内に保存された契約はありません。" : "表示できる契約はありません。"}</div>`;
    return;
  }

  contractCardList.innerHTML = contracts
    .map((contract) => {
      const title = getContractCardTitle(contract);
      const subtitle = getContractCardSubtitle(contract);
      const status = contract.status || "下書き";
      return `
        <article class="contract-list-card ${contract.id === selectedId ? "is-active" : ""}">
          <div class="contract-card-main">
            <strong>${escapeHtml(title)}</strong>
            <span>${escapeHtml(subtitle)}</span>
          </div>
          <div class="contract-card-actions">
            <span class="contract-status-chip">${escapeHtml(status)}</span>
            <button class="secondary-button" type="button" data-contract-action="remote" data-contract-source="${escapeHtml(contract.source)}" data-contract-id="${escapeHtml(contract.id)}">メール・LINE契約</button>
            <button class="secondary-button" type="button" data-contract-action="edit" data-contract-source="${escapeHtml(contract.source)}" data-contract-id="${escapeHtml(contract.id)}">編集</button>
            <button class="secondary-button danger" type="button" data-contract-action="delete" data-contract-source="${escapeHtml(contract.source)}" data-contract-id="${escapeHtml(contract.id)}">削除</button>
          </div>
        </article>
      `;
    })
    .join("");
}

function getVisibleContracts() {
  return getDisplayContracts().filter((contract) => {
    const status = contract.status || "下書き";
    const matchesFilter = listFilter === "all" || status === listFilter;
    const haystack = [
      contract.id,
      contract.buyerName,
      contract.vehicleName,
      contract.totalPrice,
      status,
    ]
      .join(" ")
      .toLowerCase();
    const matchesSearch = !listSearch || haystack.includes(listSearch);
    return matchesFilter && matchesSearch;
  });
}

function getDisplayContracts() {
  if (isTestLogin) {
    return getLocalContractRecords().map((record) => toDisplayContract(record, "local"));
  }

  return serverContracts.map((contract) => toDisplayContract(contract, "server"));
}

function toDisplayContract(record, source) {
  const data = record.data || {};
  return {
    id: record.id,
    source,
    buyerName: record.buyerName || data.buyerName || "",
    vehicleName: record.vehicleName || data.vehicleName || "",
    totalPrice: record.totalPrice || formatYen(data.totalPrice || calculateTotal(data)) || "",
    status: record.status || data.remoteStatus || data.contractStatus || "下書き",
    updatedAt: record.updatedAt || record.savedAt || record.savedAt || "",
    data,
  };
}

function getContractCardTitle(contract) {
  return contract.buyerName || "買主未入力";
}

function getContractCardSubtitle(contract) {
  const vehicle = contract.vehicleName || "車両未入力";
  const total = contract.totalPrice || "金額未入力";
  return `${vehicle} / 売買契約${total ? ` / ${total}` : ""}`;
}

function getLocalContractRecords() {
  try {
    const records = JSON.parse(localStorage.getItem("orderAutoContractRecords") || "[]");
    return Array.isArray(records) ? records : [];
  } catch {
    return [];
  }
}

function writeLocalContractRecords(records) {
  try {
    localStorage.setItem("orderAutoContractRecords", JSON.stringify(records));
    return true;
  } catch {
    return false;
  }
}

async function exportContractsJson() {
  const contracts = isTestLogin ? getLocalContractRecords() : await fetchFullServerContracts();
  const payload = {
    exportedAt: new Date().toISOString(),
    source: isTestLogin ? "local" : "server",
    contracts,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `order-auto-sales-contracts-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  setServerStatus("JSONを出力しました。");
}

async function fetchFullServerContracts() {
  const results = [];
  for (const summary of serverContracts) {
    try {
      const response = await fetch(`/api/contracts/${encodeURIComponent(summary.id)}`, {
        headers: authHeaders(),
        credentials: "same-origin",
      });
      if (response.ok) {
        const result = await response.json();
        results.push(result.contract || summary);
      } else {
        results.push(summary);
      }
    } catch {
      results.push(summary);
    }
  }
  return results;
}

async function importContractsJson() {
  const file = importContractsFile?.files?.[0];
  if (!file) {
    return;
  }

  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const contracts = Array.isArray(parsed) ? parsed : parsed.contracts;
    if (!Array.isArray(contracts)) {
      throw new Error("Invalid JSON");
    }

    if (isTestLogin) {
      const normalized = contracts.map(normalizeImportedLocalRecord);
      writeLocalContractRecords([...normalized, ...getLocalContractRecords()].slice(0, 100));
      renderServerContracts();
      setServerStatus(`${normalized.length}件の契約を端末内に取り込みました。`);
    } else {
      const savedCount = await importContractsToServer(contracts);
      await loadServerContracts();
      setServerStatus(`${savedCount}件の契約をクラウドへ取り込みました。`);
    }
  } catch {
    setServerStatus("JSONを取り込めませんでした。ファイル形式を確認してください。");
  } finally {
    if (importContractsFile) {
      importContractsFile.value = "";
    }
  }
}

function normalizeImportedLocalRecord(record) {
  const data = record.data || record;
  return {
    id: record.id || createLocalRecordId(),
    savedAt: record.savedAt || record.createdAt || new Date().toISOString(),
    data,
  };
}

async function importContractsToServer(contracts) {
  let savedCount = 0;
  for (const contract of contracts) {
    const data = contract.data || contract;
    const id = sanitizeImportId(contract.id || "");
    const response = await fetch(id ? `/api/contracts/${encodeURIComponent(id)}` : "/api/contracts", {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json",
      },
      credentials: "same-origin",
      body: JSON.stringify({ data }),
    });
    if (response.ok) {
      savedCount += 1;
    }
  }
  return savedCount;
}

function sanitizeImportId(id) {
  const cleaned = String(id || "").replace(/[^a-zA-Z0-9_-]/g, "");
  return cleaned.length > 0 && cleaned.length <= 120 ? cleaned : "";
}

function createLocalRecordId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `contract-${Date.now()}-${Math.random().toString(16).slice(2)}`;
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
  return amount > 0 ? `金 ${amount.toLocaleString("ja-JP")} 円` : "";
}

function setupTestLoginButton() {
  if (!testLoginButton) {
    return;
  }

  testLoginButton.hidden = !ENABLE_TEST_LOGIN;
  testLoginButton.addEventListener("click", () => {
    sessionStorage.setItem(testLoginStorageKey, "1");
    activateTestLogin();
  });
}

async function activateTestLogin() {
  isTestLogin = true;
  currentUser = {
    email: "test-admin@example.local",
    token: { access_token: "test-login" },
  };
  await applyAuthState();
}

function authHeaders() {
  const token = getAuthToken(currentUser);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function getAuthToken(user) {
  return user?.token?.access_token || user?.token?.accessToken || user?.access_token || user?.accessToken || "";
}

function getServerContractLabel(contract) {
  const buyer = contract.buyerName || "買主未入力";
  const vehicle = contract.vehicleName || "車両未入力";
  const total = contract.totalPrice || "金額未入力";
  const updated = formatDateTime(contract.updatedAt || contract.savedAt);
  return `${updated} / ${buyer} / ${vehicle} / ${total}`;
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

function setAuthStatus(message) {
  if (authStatus) {
    authStatus.textContent = message;
  }
}

function setServerStatus(message) {
  if (serverContractStatus) {
    serverContractStatus.textContent = message;
  }
}

function setAuthControlsDisabled(disabled) {
  loginForm?.querySelectorAll("input, button").forEach((element) => {
    element.disabled = disabled;
  });
}

function setServerButtonsDisabled(disabled) {
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
