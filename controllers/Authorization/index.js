const asyncErrorWrapper = require("express-async-handler");
const Worker = require("../../models/Worker");
const User = require("../../models/User");
const RoleTemplate = require("../../models/RoleTemplate");
const CustomRole = require("../../models/CustomRole");
const RoleAssignmentLog = require("../../models/RoleAssignmentLog");
const Company = require("../../models/Company");
const PERMISSIONS = require("../../constants/permissions");
const authPerms = require("../../constants/authorizationPermissions");
const { isAuthorizationTreeAdmin } = require("../../constants/roles");

/**
 * Hiyerarşi ağacı - Giriş yapan admin (Yönetici) her zaman en üstte, tüm çalışanlar ona bağlı
 */
const getHierarchy = asyncErrorWrapper(async (req, res) => {
  const { companyId, id: currentUserId } = req.user;

  const workers = await Worker.find({ companyId })
    .populate("userId", "username email role permissions roleTemplateId customRoleId")
    .sort({ createdAt: 1 })
    .lean();

  const userLookup = {};
  const users = await User.find({ companyId }).select("username email role permissions roleTemplateId customRoleId").lean();
  users.forEach((u) => {
    userLookup[u._id.toString()] = u;
  });

  const buildNode = (w) => {
    const u = w.userId ? userLookup[w.userId._id?.toString() || w.userId] : null;
    const roleLabel = u?.role || w.title || "Çalışan";
    return {
      id: w._id.toString(),
      workerId: w._id,
      userId: w.userId?._id?.toString() || w.userId?.toString(),
      name: w.name || u?.username,
      email: w.email || u?.email,
      role: roleLabel,
      avatar: w.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(w.name || "U")}&background=4f46e5&color=fff`,
      parentId: w.parentId?.toString() || null,
      children: [],
      permissions: u?.permissions || [],
    };
  };

  const map = {};
  workers.forEach((w) => {
    const node = buildNode(w);
    map[node.id] = node;
  });

  const oldRoots = [];
  workers.forEach((w) => {
    const node = map[w._id.toString()];
    if (!node) return;
    if (w.parentId) {
      const parent = map[w.parentId.toString()];
      if (parent) parent.children.push(node);
      else oldRoots.push(node);
    } else {
      oldRoots.push(node);
    }
  });

  const currentUser = await User.findById(currentUserId).select("username email role").lean();
  const isAdmin = isAuthorizationTreeAdmin(currentUser?.role);

  if (isAdmin) {
    const adminRoot = {
      id: `admin-${currentUserId}`,
      workerId: null,
      userId: currentUserId.toString(),
      name: currentUser?.username || req.user?.name || "Yönetici",
      email: currentUser?.email || "",
      role: "Admin",
      avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent((currentUser?.username || "Y")[0])}&background=2563eb&color=fff`,
      parentId: null,
      children: oldRoots,
      permissions: [],
    };
    res.json({ success: true, data: [adminRoot] });
  } else {
    res.json({ success: true, data: oldRoots });
  }
});

/**
 * Rol şablonları listesi
 */
const getRoleTemplates = asyncErrorWrapper(async (req, res) => {
  const { companyId } = req.user;

  let templates = await RoleTemplate.find({ companyId }).lean();
  if (templates.length === 0) {
    const systemRoles = [
      { name: "Admin", description: "Sistemdeki tüm modülleri yönetebilir.", permissions: PERMISSIONS.admin || [], isSystem: true },
      { name: "Manager", description: "Belirli modüllerde yönetim yetkisine sahiptir.", permissions: (PERMISSIONS.professional || []).concat("finance:bank:view", "finance:bank:manage"), isSystem: true },
      { name: "Professional", description: "Raporlama ve dashboard erişimi vardır.", permissions: PERMISSIONS.professional || [], isSystem: true },
      { name: "Custom", description: "Yetkiler manuel olarak belirlenir.", permissions: [], isSystem: true },
    ];
    const created = await RoleTemplate.insertMany(
      systemRoles.map((r) => ({ companyId, ...r }))
    );
    templates = created.map((c) => c.toObject ? c.toObject() : c);
  }

  res.json({ success: true, data: templates });
});

/**
 * Özel roller listesi
 */
const getCustomRoles = asyncErrorWrapper(async (req, res) => {
  const { companyId } = req.user;

  const roles = await CustomRole.find({ companyId })
    .populate("createdBy", "username")
    .lean();

  res.json({ success: true, data: roles });
});

/**
 * Özel rol oluştur
 */
const createCustomRole = asyncErrorWrapper(async (req, res) => {
  const { companyId } = req.user;
  const userId = req.user.id;
  const { name, permissions = [], assignedUserIds = [] } = req.body;

  if (!name?.trim()) {
    return res.status(400).json({ success: false, message: "Rol adı zorunludur" });
  }

  const existing = await CustomRole.findOne({ companyId, name: name.trim() });
  if (existing) {
    return res.status(400).json({ success: false, message: "Bu isimde rol zaten var" });
  }

  const role = await CustomRole.create({
    companyId,
    name: name.trim(),
    permissions: Array.isArray(permissions) ? permissions : [],
    createdBy: userId,
    assignedUserIds: assignedUserIds || [],
  });

  for (const uid of assignedUserIds || []) {
    await User.findByIdAndUpdate(uid, {
      customRoleId: role._id,
      roleTemplateId: null,
      permissions: role.permissions,
    });
    await RoleAssignmentLog.create({
      companyId,
      targetUserId: uid,
      roleName: role.name,
      roleType: "custom",
      roleId: role._id,
      roleModel: "customroles",
      permissions: role.permissions,
      action: "assigned",
      performedBy: userId,
    });
  }

  res.status(201).json({ success: true, data: role });
});

/**
 * Kullanıcıya rol ata (şablon veya özel)
 */
const assignRoleToUser = asyncErrorWrapper(async (req, res) => {
  const { companyId } = req.user;
  const userId = req.user.id;
  const { targetUserId } = req.params;
  const { roleTemplateId, customRoleId } = req.body;

  const target = await User.findOne({ _id: targetUserId, companyId });
  if (!target) {
    return res.status(404).json({ success: false, message: "Kullanıcı bulunamadı" });
  }

  let roleName = "";
  let permissions = [];
  let roleType = "";
  let roleId = null;
  let roleModel = "";

  if (customRoleId) {
    const role = await CustomRole.findOne({ _id: customRoleId, companyId });
    if (!role) return res.status(404).json({ success: false, message: "Özel rol bulunamadı" });
    roleName = role.name;
    permissions = role.permissions || [];
    roleType = "custom";
    roleId = role._id;
    roleModel = "customroles";
  } else if (roleTemplateId) {
    const template = await RoleTemplate.findOne({ _id: roleTemplateId, companyId });
    if (!template) return res.status(404).json({ success: false, message: "Rol şablonu bulunamadı" });
    roleName = template.name;
    permissions = template.permissions || [];
    roleType = "template";
    roleId = template._id;
    roleModel = "roletemplates";
  } else {
    return res.status(400).json({ success: false, message: "roleTemplateId veya customRoleId gerekli" });
  }

  await User.findByIdAndUpdate(targetUserId, {
    roleTemplateId: roleType === "template" ? roleId : null,
    customRoleId: roleType === "custom" ? roleId : null,
    permissions,
  });

  await RoleAssignmentLog.create({
    companyId,
    targetUserId,
    roleName,
    roleType,
    roleId,
    roleModel,
    permissions,
    action: "assigned",
    performedBy: userId,
  });

  const updated = await User.findById(targetUserId).select("-password").lean();
  res.json({ success: true, data: updated });
});

/**
 * Kullanıcı detayı (id worker veya user id olabilir)
 */
const getUserDetail = asyncErrorWrapper(async (req, res) => {
  const { companyId } = req.user;
  const { id } = req.params;

  let worker = await Worker.findOne({ _id: id, companyId })
    .populate("userId", "username email role permissions roleTemplateId customRoleId createdAt")
    .lean();

  if (!worker) {
    const user = await User.findOne({ _id: id, companyId }).select("-password").lean();
    if (!user) {
      return res.status(404).json({ success: false, message: "Kullanıcı bulunamadı" });
    }

    // Kullanıcıya bağlı bir worker var mı, oradan yönetici bilgisini çıkar
    const workerOfUser = await Worker.findOne({ userId: user._id, companyId }).lean();
    let managerName = null;
    let managerWorkerId = null;

    if (workerOfUser?.parentId) {
      const parent = await Worker.findOne({ _id: workerOfUser.parentId, companyId })
        .populate("userId", "username email")
        .lean();
      if (parent) {
        managerName = parent.name || parent.userId?.username || null;
        managerWorkerId = parent._id?.toString() || null;
      }
    }

    const company = await Company.findById(companyId).lean();
    return res.json({
      success: true,
      data: {
        id: user._id.toString(),
        workerId: workerOfUser?._id?.toString() || null,
        userId: user._id.toString(),
        name: user.username,
        email: user.email,
        role: user.role,
        avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(user.username || "U")}`,
        companyName: company?.name,
        createdAt: user.createdAt,
        permissions: user.permissions || [],
        roleTemplateId: user.roleTemplateId,
        customRoleId: user.customRoleId,
        managerName,
        managerWorkerId,
      },
    });
  }

  const u = worker.userId;
  const company = await Company.findById(companyId).lean();
  const roleLabel = u?.role || worker.title || "Çalışan";

  // Yönetici bilgisi
  let managerName = null;
  let managerWorkerId = null;
  if (worker.parentId) {
    const parent = await Worker.findOne({ _id: worker.parentId, companyId })
      .populate("userId", "username email")
      .lean();
    if (parent) {
      managerName = parent.name || parent.userId?.username || null;
      managerWorkerId = parent._id?.toString() || null;
    }
  }

  res.json({
    success: true,
    data: {
      id: worker._id.toString(),
      workerId: worker._id.toString(),
      userId: u?._id?.toString(),
      name: worker.name || u?.username,
      email: worker.email || u?.email,
      role: roleLabel,
      avatar: worker.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(worker.name || "U")}`,
      companyName: company?.name,
      createdAt: worker.createdAt,
      permissions: u?.permissions || [],
      roleTemplateId: u?.roleTemplateId,
      customRoleId: u?.customRoleId,
      managerName,
      managerWorkerId,
    },
  });
});

/**
 * Rol atama logları
 */
const getRoleAssignmentLogs = asyncErrorWrapper(async (req, res) => {
  const { companyId } = req.user;
  const { id: userId } = req.params;

  const logs = await RoleAssignmentLog.find({ companyId, targetUserId: userId })
    .populate("performedBy", "username")
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();

  const formatted = logs.map((l) => ({
    id: l._id,
    action: `${l.roleName} rolü ${l.action === "assigned" ? "atandı" : l.action}`,
    by: l.performedBy?.username || "Bilinmiyor",
    date: l.createdAt,
    permissions: l.permissions,
  }));

  res.json({ success: true, data: formatted });
});

/**
 * Alt kullanıcı ekle: Mevcut çalışanı parent'a bağla veya yeni worker oluştur
 */
const addSubUser = asyncErrorWrapper(async (req, res) => {
  const { companyId } = req.user;
  const { parentId, workerId, name, email, role, permissions = [] } = req.body;

  const validRoles = [
    "owner",
    "foreign_trade_manager",
    "general_manager",
    "finance_manager",
    "administrator",
    "demo",
    "employee",
  ];
  const userRole = validRoles.includes(role) ? role : "demo";

  // Mevcut çalışanı parent'a bağla (yeni modal: Çalışanlar select)
  if (workerId) {
    if (parentId) {
      const parent = await Worker.findOne({ _id: parentId, companyId });
      if (!parent) {
        return res.status(404).json({ success: false, message: "Üst kullanıcı bulunamadı" });
      }
    }

    const worker = await Worker.findOne({ _id: workerId, companyId });
    if (!worker) {
      return res.status(404).json({ success: false, message: "Çalışan bulunamadı" });
    }

    await Worker.findByIdAndUpdate(workerId, {
      parentId: parentId || null,
      title: userRole,
    });

    if (worker.userId) {
      await User.findByIdAndUpdate(worker.userId, { role: userRole });
    }

    const populated = await Worker.findById(workerId)
      .populate("userId", "username email role permissions")
      .lean();
    return res.status(201).json({ success: true, data: populated });
  }

  // Yeni worker oluştur (eski akış)
  if (!name?.trim()) {
    return res.status(400).json({ success: false, message: "İsim veya çalışan seçimi zorunludur" });
  }

  if (parentId) {
    const parent = await Worker.findOne({ _id: parentId, companyId });
    if (!parent) {
      return res.status(404).json({ success: false, message: "Üst kullanıcı bulunamadı" });
    }
  }

  let userId = null;
  if (email?.trim()) {
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
      const usernameBase = (email.split("@")[0] || name.replace(/\s/g, "").toLowerCase()).slice(0, 20);
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
        role: userRole,
        permissions: permissions || [],
        companyId,
      });
      userId = user._id;
    }
  }

  const worker = await Worker.create({
    companyId,
    name: name.trim(),
    email: email?.trim() || "",
    title: userRole,
    parentId: parentId || null,
    userId,
  });

  const populated = await Worker.findById(worker._id)
    .populate("userId", "username email role permissions")
    .lean();

  res.status(201).json({ success: true, data: populated });
});

/**
 * Yetki tanımları (frontend için)
 */
const getPermissionDefinitions = asyncErrorWrapper(async (req, res) => {
  res.json({
    success: true,
    data: {
      modules: authPerms.MODULES,
      actions: authPerms.ACTIONS,
      permissionLabels: authPerms.PERMISSION_LABELS,
    },
  });
});

module.exports = {
  getHierarchy,
  getRoleTemplates,
  getCustomRoles,
  createCustomRole,
  assignRoleToUser,
  getUserDetail,
  getRoleAssignmentLogs,
  addSubUser,
  getPermissionDefinitions,
};
