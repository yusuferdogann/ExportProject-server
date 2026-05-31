/**
 * /api/pg/authorization — Prisma/PostgreSQL Authorization controller.
 *
 * Mongo karsiligi: server/controllers/Authorization/index.js
 *
 * Endpoint'ler:
 *  GET    /hierarchy                hiyerarsi agaci (admin kok + worker'lar)
 *  GET    /role-templates           system+custom rol sablonlari (yoksa olustur)
 *  GET    /custom-roles             ozel roller (createdBy populate)
 *  POST   /custom-roles             ozel rol olustur + atanmis kullanicilara uygula
 *  PUT    /assign-role/:targetUserId  kullaniciya rol ata (template veya custom)
 *  GET    /user/:id/logs            rol atama loglari
 *  GET    /user/:id                 kullanici/worker detay
 *  POST   /sub-user                 alt kullanici ekle (worker + opsiyonel user)
 *  GET    /permission-definitions   yetki modul/aksiyon/label tablosu
 *
 * Mongo karsiligindaki davranis korunmustur:
 *  - assignedUserIds ile gelen kullanicilarin User.permissions/customRoleId
 *    alanlari guncellenir, RoleAssignmentLog yazilir.
 *  - User'a "assignedUserIds[]" yerine PG'de CustomRoleUser join tablosu da
 *    senkron tutulur (primary customRoleId zaten varsa join'e de eklenir).
 *  - RoleTemplate yoksa system roller seed edilir (companyId scope'da).
 */

const asyncErrorWrapper = require("express-async-handler");
const { getPrisma } = require("../../../db/prisma");
const CustomError = require("../../../helpers/error/CustomError");
const PERMISSIONS = require("../../../constants/permissions");
const authPerms = require("../../../constants/authorizationPermissions");
const { isAuthorizationTreeAdmin } = require("../../../constants/roles");
const { hashPassword } = require("../../../helpers/pg/authHelpers");

const VALID_ROLES = [
  "owner",
  "foreign_trade_manager",
  "general_manager",
  "finance_manager",
  "administrator",
  "demo",
  "employee",
];

async function ensureUniqueUsername(prisma, base, companyId) {
  let username = base;
  let suffix = 0;
  while (await prisma.user.findFirst({ where: { username, companyId } })) {
    suffix += 1;
    username = `${base}${suffix}`;
  }
  return username;
}

function avatarUrl(name) {
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name || "U")}&background=4f46e5&color=fff`;
}

function buildWorkerNode(w, userLookup) {
  const u = w.userId ? userLookup[w.userId] : null;
  const roleLabel = u?.role || w.title || "Calisan";
  return {
    id: w.id,
    workerId: w.id,
    userId: w.userId || null,
    name: w.name || u?.username,
    email: w.email || u?.email,
    role: roleLabel,
    avatar: w.avatar || avatarUrl(w.name),
    parentId: w.parentId || null,
    children: [],
    permissions: u?.permissions || [],
  };
}

/** GET /api/pg/authorization/hierarchy */
const getHierarchy = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const companyId = req.userPg?.companyId || req.user?.companyId;
  const currentUserId = req.userPg?.id || req.user?.id;
  if (!companyId) return next(new CustomError("Sirket bilgisi yok", 400));

  const workers = await prisma.worker.findMany({
    where: { companyId },
    orderBy: { createdAt: "asc" },
  });

  const users = await prisma.user.findMany({
    where: { companyId },
    select: {
      id: true,
      username: true,
      email: true,
      role: true,
      permissions: true,
      roleTemplateId: true,
      customRoleId: true,
    },
  });
  const userLookup = {};
  users.forEach((u) => {
    userLookup[u.id] = u;
  });

  const map = {};
  workers.forEach((w) => {
    map[w.id] = buildWorkerNode(w, userLookup);
  });

  const oldRoots = [];
  workers.forEach((w) => {
    const node = map[w.id];
    if (!node) return;
    if (w.parentId) {
      const parent = map[w.parentId];
      if (parent) parent.children.push(node);
      else oldRoots.push(node);
    } else {
      oldRoots.push(node);
    }
  });

  const currentUser = userLookup[currentUserId];
  const isAdmin = isAuthorizationTreeAdmin(currentUser?.role);
  if (isAdmin) {
    const adminRoot = {
      id: `admin-${currentUserId}`,
      workerId: null,
      userId: currentUserId,
      name: currentUser?.username || "Yonetici",
      email: currentUser?.email || "",
      role: "Admin",
      avatar: avatarUrl((currentUser?.username || "Y")[0]),
      parentId: null,
      children: oldRoots,
      permissions: [],
    };
    return res.json({ success: true, data: [adminRoot] });
  }

  res.json({ success: true, data: oldRoots });
});

/** GET /api/pg/authorization/role-templates */
const getRoleTemplates = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const companyId = req.userPg?.companyId || req.user?.companyId;
  if (!companyId) return next(new CustomError("Sirket bilgisi yok", 400));

  let templates = await prisma.roleTemplate.findMany({ where: { companyId } });
  if (templates.length === 0) {
    const systemRoles = [
      {
        name: "Admin",
        description: "Sistemdeki tum modulleri yonetebilir.",
        permissions: PERMISSIONS.admin || [],
        isSystem: true,
      },
      {
        name: "Manager",
        description: "Belirli modullerde yonetim yetkisine sahiptir.",
        permissions: (PERMISSIONS.professional || []).concat(
          "finance:bank:view",
          "finance:bank:manage"
        ),
        isSystem: true,
      },
      {
        name: "Professional",
        description: "Raporlama ve dashboard erisimi vardir.",
        permissions: PERMISSIONS.professional || [],
        isSystem: true,
      },
      {
        name: "Custom",
        description: "Yetkiler manuel olarak belirlenir.",
        permissions: [],
        isSystem: true,
      },
    ];
    await prisma.$transaction(
      systemRoles.map((r) =>
        prisma.roleTemplate.create({ data: { companyId, ...r } })
      )
    );
    templates = await prisma.roleTemplate.findMany({ where: { companyId } });
  }

  res.json({
    success: true,
    data: templates.map((t) => ({ _id: t.id, ...t })),
  });
});

/** GET /api/pg/authorization/custom-roles */
const getCustomRoles = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const companyId = req.userPg?.companyId || req.user?.companyId;
  if (!companyId) return next(new CustomError("Sirket bilgisi yok", 400));

  const roles = await prisma.customRole.findMany({
    where: { companyId },
    include: {
      createdBy: { select: { id: true, username: true } },
      assignedUsers: {
        select: {
          userId: true,
          user: { select: { id: true, username: true, email: true } },
        },
      },
    },
  });

  const data = roles.map((r) => ({
    _id: r.id,
    id: r.id,
    name: r.name,
    permissions: r.permissions,
    companyId: r.companyId,
    createdBy: r.createdBy
      ? { _id: r.createdBy.id, username: r.createdBy.username }
      : null,
    assignedUserIds: r.assignedUsers.map((au) => au.userId),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));

  res.json({ success: true, data });
});

/** POST /api/pg/authorization/custom-roles */
const createCustomRole = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const companyId = req.userPg?.companyId || req.user?.companyId;
  const userId = req.userPg?.id || req.user?.id;
  if (!companyId || !userId) {
    return next(new CustomError("Sirket/kullanici bilgisi yok", 400));
  }

  const { name, permissions = [], assignedUserIds = [] } = req.body || {};
  if (!name || !String(name).trim()) {
    return res
      .status(400)
      .json({ success: false, message: "Rol adi zorunludur" });
  }

  const cleanName = String(name).trim();
  const existing = await prisma.customRole.findFirst({
    where: { companyId, name: cleanName },
  });
  if (existing) {
    return res
      .status(400)
      .json({ success: false, message: "Bu isimde rol zaten var" });
  }

  const cleanPerms = Array.isArray(permissions)
    ? permissions.filter((p) => typeof p === "string")
    : [];
  const cleanAssigned = Array.isArray(assignedUserIds)
    ? assignedUserIds.filter((u) => typeof u === "string")
    : [];

  const role = await prisma.customRole.create({
    data: {
      companyId,
      name: cleanName,
      permissions: cleanPerms,
      createdById: userId,
    },
  });

  for (const uid of cleanAssigned) {
    const target = await prisma.user.findFirst({
      where: { id: uid, companyId },
      select: { id: true },
    });
    if (!target) continue;

    await prisma.user.update({
      where: { id: uid },
      data: {
        customRoleId: role.id,
        roleTemplateId: null,
        permissions: cleanPerms,
      },
    });
    await prisma.customRoleUser.upsert({
      where: {
        customRoleId_userId: { customRoleId: role.id, userId: uid },
      },
      create: { customRoleId: role.id, userId: uid },
      update: {},
    });
    await prisma.roleAssignmentLog.create({
      data: {
        companyId,
        targetUserId: uid,
        roleName: role.name,
        roleType: "custom",
        roleModel: "customroles",
        customRoleId: role.id,
        permissions: cleanPerms,
        action: "assigned",
        performedById: userId,
      },
    });
  }

  res.status(201).json({
    success: true,
    data: { _id: role.id, ...role, assignedUserIds: cleanAssigned },
  });
});

/** PUT /api/pg/authorization/assign-role/:targetUserId */
const assignRoleToUser = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const companyId = req.userPg?.companyId || req.user?.companyId;
  const userId = req.userPg?.id || req.user?.id;
  const { targetUserId } = req.params;
  const { roleTemplateId, customRoleId } = req.body || {};

  const target = await prisma.user.findFirst({
    where: { id: targetUserId, companyId },
  });
  if (!target) {
    return res
      .status(404)
      .json({ success: false, message: "Kullanici bulunamadi" });
  }

  let roleName = "";
  let permissions = [];
  let roleType = "template";
  let roleId = null;
  let roleModel = "roletemplates";

  if (customRoleId) {
    const role = await prisma.customRole.findFirst({
      where: { id: customRoleId, companyId },
    });
    if (!role) {
      return res
        .status(404)
        .json({ success: false, message: "Ozel rol bulunamadi" });
    }
    roleName = role.name;
    permissions = role.permissions || [];
    roleType = "custom";
    roleId = role.id;
    roleModel = "customroles";
  } else if (roleTemplateId) {
    const template = await prisma.roleTemplate.findFirst({
      where: { id: roleTemplateId, companyId },
    });
    if (!template) {
      return res
        .status(404)
        .json({ success: false, message: "Rol sablonu bulunamadi" });
    }
    roleName = template.name;
    permissions = template.permissions || [];
    roleType = "template";
    roleId = template.id;
    roleModel = "roletemplates";
  } else {
    return res.status(400).json({
      success: false,
      message: "roleTemplateId veya customRoleId gerekli",
    });
  }

  await prisma.user.update({
    where: { id: targetUserId },
    data: {
      roleTemplateId: roleType === "template" ? roleId : null,
      customRoleId: roleType === "custom" ? roleId : null,
      permissions,
    },
  });

  if (roleType === "custom") {
    await prisma.customRoleUser.upsert({
      where: {
        customRoleId_userId: {
          customRoleId: roleId,
          userId: targetUserId,
        },
      },
      create: { customRoleId: roleId, userId: targetUserId },
      update: {},
    });
  }

  await prisma.roleAssignmentLog.create({
    data: {
      companyId,
      targetUserId,
      roleName,
      roleType,
      roleModel,
      customRoleId: roleType === "custom" ? roleId : null,
      roleTemplateId: roleType === "template" ? roleId : null,
      permissions,
      action: "assigned",
      performedById: userId,
    },
  });

  const updated = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: {
      id: true,
      username: true,
      email: true,
      role: true,
      permissions: true,
      companyId: true,
      roleTemplateId: true,
      customRoleId: true,
      createdAt: true,
    },
  });

  res.json({ success: true, data: { _id: updated.id, ...updated } });
});

/** GET /api/pg/authorization/user/:id */
const getUserDetail = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const companyId = req.userPg?.companyId || req.user?.companyId;
  const { id } = req.params;

  const worker = await prisma.worker.findFirst({
    where: { id, companyId },
    include: {
      user: {
        select: {
          id: true,
          username: true,
          email: true,
          role: true,
          permissions: true,
          roleTemplateId: true,
          customRoleId: true,
          createdAt: true,
        },
      },
    },
  });
  const company = await prisma.company.findUnique({ where: { id: companyId } });

  if (worker) {
    const u = worker.user;
    let managerName = null;
    let managerWorkerId = null;
    if (worker.parentId) {
      const parent = await prisma.worker.findFirst({
        where: { id: worker.parentId, companyId },
        include: { user: { select: { username: true, email: true } } },
      });
      if (parent) {
        managerName = parent.name || parent.user?.username || null;
        managerWorkerId = parent.id;
      }
    }
    return res.json({
      success: true,
      data: {
        id: worker.id,
        workerId: worker.id,
        userId: u?.id,
        name: worker.name || u?.username,
        email: worker.email || u?.email,
        role: u?.role || worker.title || "Calisan",
        avatar: worker.avatar || avatarUrl(worker.name),
        companyName: company?.name,
        createdAt: worker.createdAt,
        permissions: u?.permissions || [],
        roleTemplateId: u?.roleTemplateId,
        customRoleId: u?.customRoleId,
        managerName,
        managerWorkerId,
      },
    });
  }

  // worker degil → User?
  const user = await prisma.user.findFirst({
    where: { id, companyId },
    select: {
      id: true,
      username: true,
      email: true,
      role: true,
      permissions: true,
      roleTemplateId: true,
      customRoleId: true,
      createdAt: true,
    },
  });
  if (!user) {
    return res
      .status(404)
      .json({ success: false, message: "Kullanici bulunamadi" });
  }

  const workerOfUser = await prisma.worker.findFirst({
    where: { userId: user.id, companyId },
  });
  let managerName = null;
  let managerWorkerId = null;
  if (workerOfUser?.parentId) {
    const parent = await prisma.worker.findFirst({
      where: { id: workerOfUser.parentId, companyId },
      include: { user: { select: { username: true, email: true } } },
    });
    if (parent) {
      managerName = parent.name || parent.user?.username || null;
      managerWorkerId = parent.id;
    }
  }

  res.json({
    success: true,
    data: {
      id: user.id,
      workerId: workerOfUser?.id || null,
      userId: user.id,
      name: user.username,
      email: user.email,
      role: user.role,
      avatar: avatarUrl(user.username),
      companyName: company?.name,
      createdAt: user.createdAt,
      permissions: user.permissions || [],
      roleTemplateId: user.roleTemplateId,
      customRoleId: user.customRoleId,
      managerName,
      managerWorkerId,
    },
  });
});

/** GET /api/pg/authorization/user/:id/logs */
const getRoleAssignmentLogs = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const companyId = req.userPg?.companyId || req.user?.companyId;
  const { id: userId } = req.params;

  const logs = await prisma.roleAssignmentLog.findMany({
    where: { companyId, targetUserId: userId },
    include: { performedBy: { select: { id: true, username: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const formatted = logs.map((l) => ({
    id: l.id,
    action: `${l.roleName} rolu ${l.action === "assigned" ? "atandi" : l.action}`,
    by: l.performedBy?.username || "Bilinmiyor",
    date: l.createdAt,
    permissions: l.permissions,
  }));
  res.json({ success: true, data: formatted });
});

/** POST /api/pg/authorization/sub-user */
const addSubUser = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const companyId = req.userPg?.companyId || req.user?.companyId;
  const {
    parentId,
    workerId,
    name,
    email,
    role,
    permissions = [],
  } = req.body || {};

  const userRole = VALID_ROLES.includes(role) ? role : "demo";

  // Mevcut calisani parent'a bagla
  if (workerId) {
    if (parentId) {
      const parent = await prisma.worker.findFirst({
        where: { id: parentId, companyId },
      });
      if (!parent) {
        return res
          .status(404)
          .json({ success: false, message: "Ust kullanici bulunamadi" });
      }
    }

    const worker = await prisma.worker.findFirst({
      where: { id: workerId, companyId },
    });
    if (!worker) {
      return res
        .status(404)
        .json({ success: false, message: "Calisan bulunamadi" });
    }

    await prisma.worker.update({
      where: { id: workerId },
      data: { parentId: parentId || null, title: userRole },
    });
    if (worker.userId) {
      await prisma.user.update({
        where: { id: worker.userId },
        data: { role: userRole },
      });
    }
    const populated = await prisma.worker.findUnique({
      where: { id: workerId },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            email: true,
            role: true,
            permissions: true,
          },
        },
      },
    });
    return res
      .status(201)
      .json({ success: true, data: { _id: populated.id, ...populated } });
  }

  // Yeni worker olustur
  if (!name || !String(name).trim()) {
    return res
      .status(400)
      .json({ success: false, message: "Isim veya calisan secimi zorunludur" });
  }
  if (parentId) {
    const parent = await prisma.worker.findFirst({
      where: { id: parentId, companyId },
    });
    if (!parent) {
      return res
        .status(404)
        .json({ success: false, message: "Ust kullanici bulunamadi" });
    }
  }

  let userId = null;
  if (email && String(email).trim()) {
    const normalized = String(email).trim().toLowerCase();
    let existing = await prisma.user.findFirst({
      where: { email: normalized, companyId },
    });
    if (!existing) {
      existing = await prisma.user.findUnique({ where: { email: normalized } });
      if (existing && existing.companyId !== companyId) {
        existing = await prisma.user.update({
          where: { id: existing.id },
          data: { companyId },
        });
      }
    }
    if (existing) {
      userId = existing.id;
    } else {
      const usernameBase = (
        normalized.split("@")[0] || name.replace(/\s/g, "").toLowerCase()
      ).slice(0, 20);
      const username = await ensureUniqueUsername(prisma, usernameBase, companyId);
      const created = await prisma.user.create({
        data: {
          username,
          email: normalized,
          password: await hashPassword("1234"),
          role: userRole,
          permissions: Array.isArray(permissions)
            ? permissions.filter((p) => typeof p === "string")
            : [],
          companyId,
        },
        select: { id: true },
      });
      userId = created.id;
    }
  }

  const worker = await prisma.worker.create({
    data: {
      companyId,
      name: String(name).trim(),
      email: email ? String(email).trim() : "",
      title: userRole,
      parentId: parentId || null,
      userId: userId || undefined,
    },
    include: {
      user: {
        select: {
          id: true,
          username: true,
          email: true,
          role: true,
          permissions: true,
        },
      },
    },
  });

  res.status(201).json({ success: true, data: { _id: worker.id, ...worker } });
});

/** GET /api/pg/authorization/permission-definitions */
const getPermissionDefinitions = asyncErrorWrapper(async (req, res, next) => {
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
