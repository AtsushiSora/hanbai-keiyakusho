import { isSupabaseConfigured, supabase } from "./src/supabase-client.js";

const form = document.querySelector("#invitePasswordForm");
const description = document.querySelector("#inviteDescription");
const status = document.querySelector("#inviteStatus");
const loginLink = document.querySelector("#loginLink");

initialize();
form?.addEventListener("submit", updatePassword);

async function initialize() {
  if (!isSupabaseConfigured()) {
    showUnavailable("Supabase設定が未入力です。管理者へお問い合わせください。");
    return;
  }

  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const query = new URLSearchParams(window.location.search);
  const authError = hash.get("error_description") || query.get("error_description");
  if (authError) {
    showUnavailable("招待リンクが無効か、有効期限が切れています。管理者へ再発行を依頼してください。");
    return;
  }

  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.user) {
    showUnavailable("招待情報を確認できませんでした。招待メールのリンクをもう一度開いてください。");
    return;
  }

  description.textContent = `${data.session.user.email || "管理者"} のパスワードを設定します。12文字以上で入力してください。`;
  form.hidden = false;
  status.textContent = "";
}

async function updatePassword(event) {
  event.preventDefault();
  const formData = new FormData(form);
  const password = String(formData.get("password") || "");
  const confirmation = String(formData.get("passwordConfirm") || "");

  if (password.length < 12) {
    status.textContent = "パスワードは12文字以上で入力してください。";
    return;
  }
  if (password !== confirmation) {
    status.textContent = "確認用パスワードが一致しません。";
    return;
  }

  const submitButton = form.querySelector("button[type='submit']");
  submitButton.disabled = true;
  status.textContent = "パスワードを設定しています。";

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    submitButton.disabled = false;
    status.textContent = "パスワードを設定できませんでした。招待リンクを開き直してお試しください。";
    return;
  }

  await supabase.auth.signOut();
  form.reset();
  form.hidden = true;
  description.textContent = "管理者パスワードを設定しました。";
  status.textContent = "管理者ログイン画面からログインしてください。";
  loginLink.hidden = false;
  history.replaceState(null, "", window.location.pathname);
}

function showUnavailable(message) {
  description.textContent = message;
  status.textContent = "";
  form.hidden = true;
  loginLink.hidden = false;
}
