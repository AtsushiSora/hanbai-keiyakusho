import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const rootPath = fileURLToPath(new URL("../", import.meta.url));
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".webp": "image/webp",
};

function serveStatic() {
  return new Promise((resolve) => {
    const server = createServer(async (request, response) => {
      try {
        const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
        const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
        const path = normalize(join(rootPath, relative));
        if (!path.startsWith(rootPath)) throw new Error("Invalid path");
        const info = await stat(path);
        const file = info.isDirectory() ? join(path, "index.html") : path;
        response.writeHead(200, {
          "Content-Type": mimeTypes[extname(file)] || "application/octet-stream",
          "Cache-Control": "no-store",
        });
        response.end(await readFile(file));
      } catch {
        response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Not found");
      }
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function logPass(label) {
  console.log(`PASS  ${label}`);
}

const server = await serveStatic();
const address = server.address();
const baseUrl = `http://127.0.0.1:${address.port}`;
let browser;

try {
  browser = await chromium.launch({
    channel: process.env.CI ? undefined : "chrome",
    headless: true,
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  const completionToken = "a".repeat(64);
  const handoffToken = "22222222-2222-4222-8222-222222222222";
  let cloudContracts = [];
  let managementCompletionPayload = null;

  await context.route("https://wlinebwdmbnbjbyvqrig.supabase.co/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.method() === "POST" && url.pathname === "/auth/v1/token") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          access_token: "sales-e2e-token",
          refresh_token: "sales-e2e-refresh",
          expires_in: 3600,
          token_type: "bearer",
          user: { id: "sales-e2e-admin", email: "admin@example.test" },
        }),
      });
      return;
    }

    if (request.method() === "GET" && url.pathname === "/rest/v1/order_auto_contracts") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(cloudContracts) });
      return;
    }

    if (request.method() === "GET" && url.pathname === "/rest/v1/order_auto_admin_notifications") {
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      return;
    }

    if (request.method() === "POST" && url.pathname === "/rest/v1/rpc/save_order_auto_contract") {
      const input = request.postDataJSON();
      const record = {
        id: input.p_id,
        user_id: "sales-e2e-admin",
        buyer_name: input.p_buyer_name,
        buyer_email: input.p_buyer_email,
        vehicle_name: input.p_vehicle_name,
        total_price: input.p_total_price,
        status: input.p_status,
        document_type: input.p_document_type,
        data: input.p_data,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      cloudContracts = [record];
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(record) });
      return;
    }

    if (request.method() === "POST" && url.pathname === "/rest/v1/rpc/complete_contract_handoff") {
      managementCompletionPayload = request.postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true }),
      });
      return;
    }

    await route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
  });

  await page.goto(baseUrl);
  await page.evaluate(({ token, completion }) => {
    sessionStorage.setItem(`orderAutoContractHandoff:${token}`, JSON.stringify({
      version: 1,
      target: "sale",
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      payload: {
        assignmentId: null,
        completionToken: completion,
        customerName: "架空 販売太郎",
        contractDate: "2026-09-03",
        vehicleName: "プリウス",
        vehicleMaker: "トヨタ",
        vehicleGrade: "S",
        vehicleYear: "2022",
        chassisNumber: "ZVW50-1234567",
        managementNumber: "26-0099",
        vehicleMileage: "32000",
        vehicleColor: "白",
        inspectionDate: "2027-04",
        amount: 1280000,
        paymentMethod: "振込",
      },
    }));
  }, { token: handoffToken, completion: completionToken });

  await page.goto(`${baseUrl}/contract-create.html?handoff=${handoffToken}`);
  await page.waitForFunction(() => document.querySelector('[name="buyerName"]')?.value === "架空 販売太郎");
  assert.equal(await page.locator('[name="buyerName"]').inputValue(), "架空 販売太郎");
  assert.equal(await page.locator('[name="contractDate"]').inputValue(), "2026-09-03");
  assert.equal(await page.locator('[name="controlNo"]').inputValue(), "26-0099");
  assert.equal(await page.locator('[name="vehicleName"]').inputValue(), "トヨタ プリウス");
  assert.equal(await page.locator('[name="vehicleGrade"]').inputValue(), "S");
  assert.equal(await page.locator('[name="vehicleYear"]').inputValue(), "2022");
  assert.equal(await page.locator('[name="vehicleVin"]').inputValue(), "ZVW50-1234567");
  assert.equal(await page.locator('[name="vehicleMileage"]').inputValue(), "32,000");
  assert.equal(await page.locator('[name="vehicleColor"]').inputValue(), "白");
  assert.equal(await page.locator('[name="inspectionDate"]').inputValue(), "2027-04");
  assert.equal(await page.locator('[name="basePrice"]').inputValue(), "1,280,000");
  assert.equal(await page.locator('[name="totalPrice"]').inputValue(), "1,280,000");
  assert.equal(await page.locator('[name="paymentMethod"]').inputValue(), "銀行振込");
  assert.equal(new URL(page.url()).searchParams.has("handoff"), false);
  assert.equal(await page.evaluate((token) => sessionStorage.getItem(`orderAutoContractHandoff:${token}`), handoffToken), null);
  logPass("管理システムから販売契約の車両・金額を一度だけ自動入力");

  await page.locator('[name="email"]').fill("admin@example.test");
  await page.locator('[name="password"]').fill("e2e-password");
  await page.locator('#adminLoginForm button[type="submit"]').click();
  await page.waitForFunction(() => document.body.classList.contains("is-admin-authenticated"));
  await page.locator('[name="buyerAddress"]').fill("架空県架空市1-2-3");
  await page.locator("#completeContractButton").click();
  await page.locator("#saveServerContractButton").click();
  await page.waitForFunction(() => document.querySelector("#contractSaveStatus")?.textContent?.includes("クラウド保存しました"));
  await page.waitForTimeout(100);

  assert.deepEqual(managementCompletionPayload, {
    p_completion_token: completionToken,
    p_external_contract_id: cloudContracts[0].id,
  });
  logPass("販売契約の完了結果を管理システムへ通知");

  console.log("\n販売契約E2Eテストに合格しました。");
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
