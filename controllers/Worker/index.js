const asyncErrorWrapper = require("express-async-handler");
const Worker = require("../../models/Worker");
const User = require("../../models/User");

const getWorkers = asyncErrorWrapper(async (req, res) => {
  const { companyId } = req.user;

  const workers = await Worker.find({ companyId })
    .populate("userId", "username email")
    .sort({ createdAt: -1 })
    .lean();

  res.json({ success: true, data: workers });
});

const createWorker = asyncErrorWrapper(async (req, res) => {
  const { companyId } = req.user;

  if (!companyId) {
    return res.status(400).json({
      success: false,
      message: "Şirket bilgisi bulunamadı",
    });
  }

  const { name, title, phone, email, avatar, createAccount } = req.body;

  if (!name) {
    return res.status(400).json({
      success: false,
      message: "Ad soyad zorunludur",
    });
  }

  let userId = null;
  if (createAccount && email && email.trim()) {
    let existing = await User.findOne({ email: email.trim().toLowerCase(), companyId });
    if (!existing) {
      existing = await User.findOne({ email: email.trim().toLowerCase() });
      if (existing && String(existing.companyId) !== String(companyId)) {
        await User.findByIdAndUpdate(existing._id, { companyId });
      }
    }
    if (existing) {
      userId = existing._id;
    } else {
      try {
        const usernameBase = email.split("@")[0] || name.replace(/\s/g, "").toLowerCase();
        let username = usernameBase;
        let suffix = 0;
        while (await User.findOne({ username, companyId })) {
          suffix++;
          username = `${usernameBase}${suffix}`;
        }
        const user = await User.create({
          username,
          email: email.trim().toLowerCase(),
          password: "1234",
          role: "employee",
          companyId,
        });
        userId = user._id;
      } catch (err) {
        if (err.code === 11000) {
          existing = await User.findOne({ email: email.trim().toLowerCase() });
          if (existing) userId = existing._id;
          else return res.status(400).json({ success: false, message: "Bu e-posta adresi zaten kullanılıyor" });
        } else {
          throw err;
        }
      }
    }
  }

  const worker = await Worker.create({
    companyId,
    name,
    title: title || "",
    phone: phone || "",
    email: email || "",
    avatar: avatar || "",
    userId: userId || undefined,
  });

  const populated = await Worker.findById(worker._id)
    .populate("userId", "username email")
    .lean();

  res.status(201).json({ success: true, data: populated });
});

const updateWorker = asyncErrorWrapper(async (req, res) => {
  const { companyId } = req.user;
  const { id } = req.params;
  const { name, title, phone, email, avatar } = req.body;

  const worker = await Worker.findOneAndUpdate(
    { _id: id, companyId },
    { name, title, phone, email, avatar },
    { new: true }
  )
    .populate("userId", "username email")
    .lean();

  if (!worker) {
    return res.status(404).json({ success: false, message: "Çalışan bulunamadı" });
  }

  res.json({ success: true, data: worker });
});

const createAccountForWorker = asyncErrorWrapper(async (req, res) => {
  const { companyId } = req.user;
  const { id } = req.params;

  console.debug("[createAccountForWorker] id:", id, "companyId:", companyId, "req.params:", req.params);

  if (!id) {
    return res.status(400).json({ success: false, message: "Çalışan ID gerekli" });
  }

  const worker = await Worker.findById(id).lean();
  console.debug("[createAccountForWorker] worker bulundu:", !!worker, worker ? { _id: worker._id, companyId: worker.companyId } : null);

  if (!worker) {
    return res.status(404).json({ success: false, message: "Çalışan bulunamadı" });
  }
  if (companyId && String(worker.companyId) !== String(companyId)) {
    return res.status(403).json({ success: false, message: "Bu çalışana erişim yetkiniz yok" });
  }
  if (worker.userId) {
    return res.json({ success: true, data: { userId: String(worker.userId) }, message: "Hesap zaten mevcut" });
  }
  const email = worker.email?.trim();
  if (!email) {
    return res.status(400).json({
      success: false,
      message: "Bu çalışanın e-posta adresi yok. Mesaj alabilmesi için önce e-posta ekleyin.",
    });
  }

  let user = await User.findOne({ email: email.toLowerCase(), companyId });
  if (!user) {
    user = await User.findOne({ email: email.toLowerCase() });
    if (user) {
      if (String(user.companyId) !== String(companyId)) {
        await User.findByIdAndUpdate(user._id, { companyId });
      }
    } else {
      try {
        const usernameBase = email.split("@")[0] || worker.name.replace(/\s/g, "").toLowerCase();
        let username = usernameBase;
        let suffix = 0;
        while (await User.findOne({ username, companyId })) {
          suffix++;
          username = `${usernameBase}${suffix}`;
        }
        user = await User.create({
          username,
          email: email.toLowerCase(),
          password: "1234",
          role: "employee",
          companyId,
        });
      } catch (err) {
        if (err.code === 11000) {
          user = await User.findOne({ email: email.toLowerCase() });
          if (!user) {
            return res.status(400).json({ success: false, message: "Bu e-posta zaten kullanılıyor" });
          }
        } else {
          throw err;
        }
      }
    }
  }

  await Worker.findByIdAndUpdate(id, { userId: user._id });

  res.json({ success: true, data: { userId: String(user._id) } });
});

const deleteWorker = asyncErrorWrapper(async (req, res) => {
  const { companyId } = req.user;
  const { id } = req.params;

  const worker = await Worker.findOneAndDelete({ _id: id, companyId });

  if (!worker) {
    return res.status(404).json({ success: false, message: "Çalışan bulunamadı" });
  }

  res.json({ success: true, message: "Çalışan silindi" });
});

module.exports = {
  getWorkers,
  createWorker,
  updateWorker,
  deleteWorker,
  createAccountForWorker,
};
