export function createNextDocumentNumber(contracts, date = new Date()) {
  const prefix = getJapanDatePrefix(date);
  const lastSequence = contracts.reduce((highest, contract) => {
    const number = String(contract?.data?.estimateNo || "");
    return number.startsWith(prefix) && /^\d{8}$/.test(number)
      ? Math.max(highest, Number(number.slice(6)))
      : highest;
  }, 0);
  return lastSequence >= 99 ? "" : `${prefix}${String(lastSequence + 1).padStart(2, "0")}`;
}

export function getJapanDatePrefix(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type) => parts.find((item) => item.type === type)?.value || "00";
  return `${part("year")}${part("month")}${part("day")}`;
}
