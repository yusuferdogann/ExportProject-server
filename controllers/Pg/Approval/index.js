/**
 * /api/pg/approval — Prisma/PostgreSQL Approval controller.
 *
 * Mongo karsiligi: server/controllers/Approval/index.js
 *
 * Endpoint'ler:
 *   POST /                      yeni approval olustur (entityType + entityId)
 *   GET  /                       sirketin tum approval'lari (enriched)
 *   GET  /:approvalId            detay (entity dahil)
 *   GET  /:approvalId/history    log history (user populate)
 *   POST /:approvalId/approve    bekleyen onayi approve et + entity status guncelle
 *   POST /:approvalId/reject     bekleyen onayi reject et + entity status guncelle
 *   POST /:approvalId/delegate   step'i baska kullaniciya devret
 */

const asyncErrorWrapper = require("express-async-handler");
const { getPrisma } = require("../../../db/prisma");
const CustomError = require("../../../helpers/error/CustomError");
const { ADMIN_PANEL_ROLES } = require("../../../constants/roles");

const ENTITY_DELEGATE = {
  invoice: "invoice",
  proforma: "proforma",
  checklist: "checklist",
  pricequote: "priceOffer",
};

const fetchEntity = async (prisma, type, id) => {
  switch (type) {
    case "invoice":
      return prisma.invoice.findUnique({ where: { id } });
    case "proforma":
      return prisma.proforma.findUnique({ where: { id } });
    case "checklist":
      return prisma.checklist.findUnique({ where: { id } });
    case "pricequote":
      return prisma.priceOffer.findUnique({ where: { id } });
    default:
      return null;
  }
};

const updateEntity = async (prisma, type, id, data) => {
  switch (type) {
    case "invoice":
      return prisma.invoice.update({ where: { id }, data });
    case "proforma":
      return prisma.proforma.update({ where: { id }, data });
    case "checklist":
      return prisma.checklist.update({ where: { id }, data });
    case "pricequote":
      return prisma.priceOffer.update({ where: { id }, data });
    default:
      return null;
  }
};

const buildEntityLabel = (approval, entity) => {
  if (!entity) return approval.entityType;
  switch (approval.entityType) {
    case "invoice":
      return `Fatura #${entity.invoiceNo || entity.id}`;
    case "proforma":
      return `Proforma #${entity.quoteNumber || entity.id}`;
    case "checklist":
      return `Checklist #${entity.invoiceNumber || entity.id}`;
    case "pricequote":
      return `Teklif #${entity?.priceInfo?.quoteNumber || entity.id}`;
    default:
      return approval.entityType;
  }
};

const mapUserRoleLabel = (role) => {
  if (!role) return "User";
  if (role === "employee") return "Employee";
  if (ADMIN_PANEL_ROLES.includes(role)) return "Manager";
  return role.charAt(0).toUpperCase() + role.slice(1);
};

const canUserApprove = (user) => {
  if (!user) return false;
  return ADMIN_PANEL_ROLES.includes(user.role);
};

const enrichApproval = async (prisma, approval, currentUser) => {
  const creator = await prisma.user.findUnique({
    where: { id: approval.createdById },
    select: { id: true, username: true, email: true },
  });
  const entity = await fetchEntity(prisma, approval.entityType, approval.entityId);
  const entityName = buildEntityLabel(approval, entity);

  return {
    id: approval.id,
    entityType: approval.entityType,
    entityId: approval.entityId,
    entityName,
    requestedBy: creator?.username || "Bilinmeyen",
    createdAt: approval.createdAt,
    status: approval.status,
    currentStep: approval.currentStep
      ? `Adim ${approval.currentStep}`
      : "Onay Bekliyor",
    canApprove: canUserApprove(currentUser),
  };
};

const finalizeEntity = async (prisma, approval, status) => {
  const entityType = approval.entityType;
  if (!ENTITY_DELEGATE[entityType]) return;

  const update = { approvalId: approval.id };
  if (status === "approved") {
    update.status = "approved";
    update.approvedAt = new Date();
  } else if (status === "rejected") {
    update.status = "rejected";
    update.rejectedAt = new Date();
  }
  try {
    await updateEntity(prisma, entityType, approval.entityId, update);
  } catch (e) {
    // entity zaten silinmis olabilir; rapor amacli ignore
  }
};

/** POST /api/pg/approval */
const createApproval = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const companyId = req.userPg?.companyId || req.user?.companyId;
  const userId = req.userPg?.id || req.user?.id;
  const { entityType, entityId } = req.body || {};

  if (!entityType || !entityId) {
    return res.status(400).json({
      success: false,
      message: "entityType ve entityId zorunludur",
    });
  }
  if (!ENTITY_DELEGATE[entityType]) {
    return res.status(400).json({
      success: false,
      message: `Desteklenmeyen entityType: ${entityType}`,
    });
  }

  const existing = await prisma.approval.findFirst({
    where: { companyId, entityType, entityId, status: "pending" },
  });
  if (existing) {
    return res.status(400).json({
      success: false,
      message: "Bu kayit icin zaten bekleyen bir onay sureci var",
    });
  }

  const approval = await prisma.approval.create({
    data: {
      companyId,
      createdById: userId,
      entityType,
      entityId,
      status: "pending",
      currentStep: 1,
    },
  });

  const step = await prisma.approvalStep.create({
    data: {
      approvalId: approval.id,
      stepOrder: 1,
      role: "manager",
      status: "pending",
    },
  });

  await prisma.approvalLog.create({
    data: {
      approvalId: approval.id,
      stepId: step.id,
      action: "created",
      userId,
      comment: "Talep olusturuldu",
    },
  });

  const enriched = await enrichApproval(prisma, approval, req.user);
  res.status(201).json({ success: true, data: enriched });
});

/** GET /api/pg/approval */
const listApprovals = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const companyId = req.userPg?.companyId || req.user?.companyId;
  if (!companyId) return next(new CustomError("Sirket bilgisi yok", 400));

  const approvals = await prisma.approval.findMany({
    where: { companyId },
    orderBy: { createdAt: "desc" },
  });

  const enriched = await Promise.all(
    approvals.map((a) => enrichApproval(prisma, a, req.user))
  );
  res.status(200).json({ success: true, data: enriched });
});

/** GET /api/pg/approval/:approvalId */
const getApprovalDetail = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const companyId = req.userPg?.companyId || req.user?.companyId;
  const { approvalId } = req.params;

  const approval = await prisma.approval.findFirst({
    where: { id: approvalId, companyId },
  });
  if (!approval) {
    return res
      .status(404)
      .json({ success: false, message: "Onay kaydi bulunamadi" });
  }

  const creator = await prisma.user.findUnique({
    where: { id: approval.createdById },
    select: { id: true, username: true, email: true },
  });
  const entity = await fetchEntity(prisma, approval.entityType, approval.entityId);
  const entityName = buildEntityLabel(approval, entity);

  res.status(200).json({
    success: true,
    data: {
      id: approval.id,
      entityType: approval.entityType,
      entityId: approval.entityId,
      entityName,
      requestedBy: creator?.username || "Bilinmeyen",
      createdAt: approval.createdAt,
      status: approval.status,
      entity,
    },
  });
});

/** GET /api/pg/approval/:approvalId/history */
const getApprovalHistory = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const companyId = req.userPg?.companyId || req.user?.companyId;
  const { approvalId } = req.params;

  const approval = await prisma.approval.findFirst({
    where: { id: approvalId, companyId },
  });
  if (!approval) {
    return res
      .status(404)
      .json({ success: false, message: "Onay kaydi bulunamadi" });
  }

  const logs = await prisma.approvalLog.findMany({
    where: { approvalId: approval.id },
    orderBy: { createdAt: "asc" },
    include: {
      user: { select: { id: true, username: true, role: true } },
    },
  });

  const history = logs.map((log) => ({
    id: log.id,
    role: mapUserRoleLabel(log.user?.role),
    action: log.action,
    comment: log.comment,
    date: log.createdAt,
    user: {
      id: log.user?.id,
      username: log.user?.username,
    },
  }));

  res.status(200).json({ success: true, data: history });
});

async function actOnStep(prisma, approval, userId, statusValue, comment) {
  const existingStep = await prisma.approvalStep.findFirst({
    where: {
      approvalId: approval.id,
      stepOrder: approval.currentStep || 1,
    },
  });

  let step;
  if (existingStep) {
    step = await prisma.approvalStep.update({
      where: { id: existingStep.id },
      data: {
        status: statusValue,
        actionById: userId,
        actionAt: new Date(),
        comment,
      },
    });
  } else {
    step = await prisma.approvalStep.create({
      data: {
        approvalId: approval.id,
        stepOrder: approval.currentStep || 1,
        role: "manager",
        status: statusValue,
        actionById: userId,
        actionAt: new Date(),
        comment,
      },
    });
  }
  return step;
}

/** POST /api/pg/approval/:approvalId/approve */
const approveStep = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const companyId = req.userPg?.companyId || req.user?.companyId;
  const userId = req.userPg?.id || req.user?.id;
  const { approvalId } = req.params;
  const { comment } = req.body || {};

  const approval = await prisma.approval.findFirst({
    where: { id: approvalId, companyId },
  });
  if (!approval) {
    return res
      .status(404)
      .json({ success: false, message: "Onay kaydi bulunamadi" });
  }
  if (approval.status !== "pending") {
    return res.status(400).json({
      success: false,
      message: "Sadece bekleyen onaylar guncellenebilir",
    });
  }

  const updated = await prisma.approval.update({
    where: { id: approval.id },
    data: { status: "approved", completedAt: new Date() },
  });

  const step = await actOnStep(prisma, approval, userId, "approved", comment);

  await prisma.approvalLog.create({
    data: {
      approvalId: approval.id,
      stepId: step.id,
      action: "approved",
      userId,
      comment,
    },
  });

  await finalizeEntity(prisma, approval, "approved");

  const enriched = await enrichApproval(prisma, updated, req.user);
  res.status(200).json({ success: true, data: enriched });
});

/** POST /api/pg/approval/:approvalId/reject */
const rejectStep = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const companyId = req.userPg?.companyId || req.user?.companyId;
  const userId = req.userPg?.id || req.user?.id;
  const { approvalId } = req.params;
  const { comment } = req.body || {};

  const approval = await prisma.approval.findFirst({
    where: { id: approvalId, companyId },
  });
  if (!approval) {
    return res
      .status(404)
      .json({ success: false, message: "Onay kaydi bulunamadi" });
  }
  if (approval.status !== "pending") {
    return res.status(400).json({
      success: false,
      message: "Sadece bekleyen onaylar guncellenebilir",
    });
  }

  const updated = await prisma.approval.update({
    where: { id: approval.id },
    data: { status: "rejected", completedAt: new Date() },
  });

  const step = await actOnStep(prisma, approval, userId, "rejected", comment);

  await prisma.approvalLog.create({
    data: {
      approvalId: approval.id,
      stepId: step.id,
      action: "rejected",
      userId,
      comment,
    },
  });

  await finalizeEntity(prisma, approval, "rejected");

  const enriched = await enrichApproval(prisma, updated, req.user);
  res.status(200).json({ success: true, data: enriched });
});

/** POST /api/pg/approval/:approvalId/delegate */
const delegateApproval = asyncErrorWrapper(async (req, res, next) => {
  const prisma = getPrisma();
  const companyId = req.userPg?.companyId || req.user?.companyId;
  const userId = req.userPg?.id || req.user?.id;
  const { approvalId } = req.params;
  const { assignedTo, comment } = req.body || {};

  if (!assignedTo) {
    return res
      .status(400)
      .json({ success: false, message: "assignedTo zorunludur" });
  }

  const approval = await prisma.approval.findFirst({
    where: { id: approvalId, companyId },
  });
  if (!approval) {
    return res
      .status(404)
      .json({ success: false, message: "Onay kaydi bulunamadi" });
  }

  const assignee = await prisma.user.findFirst({
    where: { id: assignedTo, companyId },
    select: { id: true },
  });
  if (!assignee) {
    return res
      .status(400)
      .json({ success: false, message: "Gecersiz assignedTo" });
  }

  const existingStep = await prisma.approvalStep.findFirst({
    where: {
      approvalId: approval.id,
      stepOrder: approval.currentStep || 1,
    },
  });

  let step;
  if (existingStep) {
    step = await prisma.approvalStep.update({
      where: { id: existingStep.id },
      data: { assignedToId: assignedTo },
    });
  } else {
    step = await prisma.approvalStep.create({
      data: {
        approvalId: approval.id,
        stepOrder: approval.currentStep || 1,
        role: "manager",
        status: "pending",
        assignedToId: assignedTo,
      },
    });
  }

  await prisma.approvalLog.create({
    data: {
      approvalId: approval.id,
      stepId: step.id,
      action: "delegated",
      userId,
      comment,
    },
  });

  res.status(200).json({ success: true });
});

module.exports = {
  createApproval,
  listApprovals,
  getApprovalDetail,
  getApprovalHistory,
  approveStep,
  rejectStep,
  delegateApproval,
};
