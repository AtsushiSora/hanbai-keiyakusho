import { getUser, handleAuthCallback, login, logout, onAuthChange } from "@netlify/identity";

const loginPanel = document.querySelector("#loginPanel");
const loginForm = document.querySelector("#adminLoginForm");
const authStatus = document.querySelector("#authStatus");
const adminUserLabel = document.querySelector("#adminUserLabel");
const logoutButton = document.querySelector("#adminLogoutButton");
const refreshServerContractsButton = document.querySelector("#refreshServerContractsButton");
const serverContractSelect = document.querySelector("#serverContractSelect");
const loadServerContractButton = document.querySelector("#loadServerContractButton");
const saveServerContractButton = document.querySelector("#saveServerContractButton");
const deleteServerContractButton = document.querySelector("#deleteServerContractButton");
const serverContractStatus = document.querySelector("#serverContractStatus");

let currentUser = null;
let serverContracts = [];

initAdminAuth();

async function initAdminAuth() {
  setAuthStatus("ログイン状態を確認しています。");

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
  await logout();
  currentUser = null;
  serverContracts = [];
  renderServerContracts();
  await applyAuthState();
});

refreshServerContractsButton?.addEventListener("click", loadServerContracts);
saveServerContractButton?.addEventListener("click", saveServerContract);
loadServerContractButton?.addEventListener("click", loadSelectedServerContract);
deleteServerContractButton?.addEventListener("click", deleteSelectedServerContract);
serverContractSelect?.addEventListener("change", () => setServerButtonsDisabled(!serverContractSelect.value));

async function applyAuthState() {
  document.body.classList.remove("auth-loading");

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
  if (!serverContractSelect) {
    return;
  }

  if (!serverContracts.length) {
    serverContractSelect.innerHTML = '<option value="">保存済み契約はありません</option>';
    setServerButtonsDisabled(true);
    return;
  }

  serverContractSelect.innerHTML = [
    '<option value="">契約を選択してください</option>',
    ...serverContracts.map((contract) => `<option value="${escapeHtml(contract.id)}">${escapeHtml(getServerContractLabel(contract))}</option>`),
  ].join("");
  serverContractSelect.value = selectedId;
  setServerButtonsDisabled(!serverContractSelect.value);
}

async function saveServerContract() {
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

async function loadSelectedServerContract() {
  const selectedId = serverContractSelect?.value;
  if (!selectedId || !window.contractTool) {
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
  window.contractTool.loadRecordPayload(result.contract);
  setServerStatus("契約情報をフォームに読み込みました。");
}

async function deleteSelectedServerContract() {
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
  loadServerContractButton.disabled = disabled;
  deleteServerContractButton.disabled = disabled;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
