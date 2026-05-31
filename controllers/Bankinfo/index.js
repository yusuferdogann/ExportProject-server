const asyncErrorWrapper = require("express-async-handler");
const Bankinfo = require("../../models/Bankinfo");

const getBanks = asyncErrorWrapper(async (req, res) => {
  const { companyId } = req.user;

  const banks = await Bankinfo.find({ companyId }).sort({ createdAt: -1 }).lean();

  res.json({ success: true, data: banks });
});

const createBank = asyncErrorWrapper(async (req, res) => {
  const { companyId } = req.user;
  const { bankName, sube, switch: swiftCode, iban, status, accountHolder } = req.body;

  if (!bankName?.trim() || !iban?.trim()) {
    return res.status(400).json({
      success: false,
      message: "Banka adı ve IBAN zorunludur",
    });
  }

  const bank = await Bankinfo.create({
    companyId,
    bankName: bankName.trim(),
    sube: sube?.trim() || "",
    switch: swiftCode?.trim() || "",
    iban: iban.trim(),
    status: status || "bekliyor",
    accountHolder: accountHolder?.trim() || "",
  });

  res.status(201).json({ success: true, data: bank });
});

const updateBank = asyncErrorWrapper(async (req, res) => {
  const { companyId } = req.user;
  const { id } = req.params;
  const { bankName, sube, switch: swiftCode, iban, status, accountHolder } = req.body;

  const bank = await Bankinfo.findOneAndUpdate(
    { _id: id, companyId },
    {
      bankName,
      sube,
      switch: swiftCode,
      iban,
      status,
      accountHolder,
    },
    { new: true }
  ).lean();

  if (!bank) {
    return res.status(404).json({ success: false, message: "Banka kaydı bulunamadı" });
  }

  res.json({ success: true, data: bank });
});

const deleteBank = asyncErrorWrapper(async (req, res) => {
  const { companyId } = req.user;
  const { id } = req.params;

  const bank = await Bankinfo.findOneAndDelete({ _id: id, companyId });

  if (!bank) {
    return res.status(404).json({ success: false, message: "Banka kaydı bulunamadı" });
  }

  res.json({ success: true, message: "Banka kaydı silindi" });
});

module.exports = {
  getBanks,
  createBank,
  updateBank,
  deleteBank,
};

