function normalizeFirmName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "");
}

function normalizeMail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeWebsite(value) {
  let s = String(value || "").trim().toLowerCase();
  s = s.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
  return s;
}

function hasDuplicateCheckFields({ firmName, phone, mail, website }) {
  return (
    Boolean(String(firmName || "").trim()) &&
    Boolean(String(phone || "").trim()) &&
    Boolean(String(mail || "").trim()) &&
    Boolean(String(website || "").trim())
  );
}

function customerMatchesDuplicate(customer, input) {
  return (
    normalizeFirmName(customer.firmName) === normalizeFirmName(input.firmName) &&
    normalizePhone(customer.phone) === normalizePhone(input.phone) &&
    normalizeMail(customer.mail) === normalizeMail(input.mail) &&
    normalizeWebsite(customer.website) === normalizeWebsite(input.website)
  );
}

function resolveRegisteredBy(customer) {
  return (
    customer.createdByName ||
    customer.createdByUser?.username ||
    "başka bir kullanıcı"
  );
}

module.exports = {
  normalizeFirmName,
  normalizePhone,
  normalizeMail,
  normalizeWebsite,
  hasDuplicateCheckFields,
  customerMatchesDuplicate,
  resolveRegisteredBy,
};
