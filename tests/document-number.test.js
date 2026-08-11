import test from "node:test";
import assert from "node:assert/strict";
import { createNextDocumentNumber, getJapanDatePrefix } from "../src/document-number.js";

const testDate = new Date("2026-08-10T15:30:00.000Z");

test("日本時間の日付6桁を作成する", () => {
  assert.equal(getJapanDatePrefix(testDate), "260811");
});

test("当日の最初の番号を8桁で作成する", () => {
  assert.equal(createNextDocumentNumber([], testDate), "26081101");
});

test("当日の最大連番の次を作成する", () => {
  const contracts = [
    { data: { estimateNo: "26081101" } },
    { data: { estimateNo: "26081103" } },
    { data: { estimateNo: "26081099" } },
  ];
  assert.equal(createNextDocumentNumber(contracts, testDate), "26081104");
});

test("99件に達した日は空文字を返す", () => {
  assert.equal(
    createNextDocumentNumber([{ data: { estimateNo: "26081199" } }], testDate),
    "",
  );
});
