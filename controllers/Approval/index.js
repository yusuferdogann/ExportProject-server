const asyncErrorWrapper = require("express-async-handler");

const Approval = require("../../models/Approval");
const ApprovalLog = require("../../models/ApprovalLogs");
const ApprovalStep = require("../../models/ApprovalStep");
const Invoice = require("../../models/Invoice");
const Proforma = require("../../models/Proforma");
const Checklist = require("../../models/Checklist");
const PriceQuote = require("../../models/PriceOffer");
const User = require("../../models/User");

const ENTITY_MODELS = {
  invoice: Invoice,
  proforma: Proforma,
  checklist: Checklist,
  pricequote: PriceQuote,
};

const { ADMIN_PANEL_ROLES } = require("../../constants/roles");

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

const buildEntityLabel = (approval, entity) => {
  if (!entity) return approval.entityType;

  switch (approval.entityType) {
    case "invoice":
      return `Fatura #${entity.invoiceNo || entity._id}`;
    case "proforma":
      return `Proforma #${entity.quoteNumber || entity._id}`;
    case "checklist":
      return `Checklist #${entity.invoiceNumber || entity._id}`;
    case "pricequote":
      return `Teklif #${entity?.priceInfo?.quoteNumber || entity._id}`;
    default:
      return approval.entityType;
  }
};

const enrichApproval = async (approval, currentUser) => {
  const user = await User.findById(approval.createdBy).lean();

  const Model = ENTITY_MODELS[approval.entityType];
  const entity = Model
    ? await Model.findById(approval.entityId).lean()
    : null;

  const entityName = buildEntityLabel(approval, entity);

  return {
    id: approval._id,
    entityType: approval.entityType,
    entityId: approval.entityId,
    entityName,
    requestedBy: user?.username || "Bilinmeyen",
    createdAt: approval.createdAt,
    status: approval.status,
    currentStep: approval.currentStep
      ? `Adım ${approval.currentStep}`
      : "Onay Bekliyor",
    canApprove: canUserApprove(currentUser),
  };
};

const updateEntityStatus = async (approval, status) => {
  const Model = ENTITY_MODELS[approval.entityType];
  if (!Model) return;

  const update = {
    approvalId: approval._id,
  };

  if (status === "approved") {
    update.status = "approved";
    update.approvedAt = new Date();
  } else if (status === "rejected") {
    update.status = "rejected";
    update.rejectedAt = new Date();
  }

  await Model.findByIdAndUpdate(approval.entityId, update);
};

const createApproval = asyncErrorWrapper(async (req, res) => {
  const { entityType, entityId } = req.body;
  const companyId = req.user.companyId || req.user.id;

  if (!entityType || !entityId) {
    return res.status(400).json({
      success: false,
      message: "entityType ve entityId zorunludur",
    });
  }

  const existing = await Approval.findOne({
    companyId,
    entityType,
    entityId,
    status: "pending",
  });

  if (existing) {
    return res.status(400).json({
      success: false,
      message: "Bu kayıt için zaten bekleyen bir onay süreci var",
    });
  }

  const approval = await Approval.create({
    companyId,
    createdBy: req.user.id,
    entityType,
    entityId,
    status: "pending",
    currentStep: 1,
  });

  const step = await ApprovalStep.create({
    approvalId: approval._id,
    stepOrder: 1,
    role: "manager",
    status: "pending",
  });

  await ApprovalLog.create({
    approvalId: approval._id,
    stepId: step._id,
    action: "created",
    userId: req.user.id,
    comment: "Talep oluşturuldu",
  });

  const enriched = await enrichApproval(approval, req.user);
  res.status(201).json({ success: true, data: enriched });
});

const listApprovals = asyncErrorWrapper(async (req, res) => {
  const companyId = req.user.companyId || req.user.id;

  const approvals = await Approval.find({ companyId })
    .sort({ createdAt: -1 });

  const enriched = await Promise.all(
    approvals.map((a) => enrichApproval(a, req.user))
  );

  res.status(200).json({ success: true, data: enriched });
});

const getApprovalDetail = asyncErrorWrapper(async (req, res) => {
  const { approvalId } = req.params;
  const companyId = req.user.companyId || req.user.id;

  const approval = await Approval.findOne({
    _id: approvalId,
    companyId,
  });

  if (!approval) {
    return res.status(404).json({
      success: false,
      message: "Onay kaydı bulunamadı",
    });
  }

  const user = await User.findById(approval.createdBy).lean();
  const Model = ENTITY_MODELS[approval.entityType];
  const entity = Model
    ? await Model.findById(approval.entityId).lean()
    : null;

  const entityName = buildEntityLabel(approval, entity);

  res.status(200).json({
    success: true,
    data: {
      id: approval._id,
      entityType: approval.entityType,
      entityId: approval.entityId,
      entityName,
      requestedBy: user?.username || "Bilinmeyen",
      createdAt: approval.createdAt,
      status: approval.status,
      entity,
    },
  });
});

const getApprovalHistory = asyncErrorWrapper(async (req, res) => {
  const { approvalId } = req.params;
  const companyId = req.user.companyId || req.user.id;

  const approval = await Approval.findOne({
    _id: approvalId,
    companyId,
  });

  if (!approval) {
    return res.status(404).json({
      success: false,
      message: "Onay kaydı bulunamadı",
    });
  }

  const logs = await ApprovalLog.find({ approvalId: approval._id })
    .sort({ createdAt: 1 })
    .populate("userId")
    .lean();

  const history = logs.map((log) => ({
    id: log._id,
    role: mapUserRoleLabel(log.userId?.role),
    action: log.action,
    comment: log.comment,
    date: log.createdAt,
    user: {
      id: log.userId?._id,
      username: log.userId?.username,
    },
  }));

  res.status(200).json({
    success: true,
    data: history,
  });
});

const approveStep = asyncErrorWrapper(async (req, res) => {
  const { approvalId } = req.params;
  const { comment } = req.body || {};
  const companyId = req.user.companyId || req.user.id;

  const approval = await Approval.findOne({
    _id: approvalId,
    companyId,
  });

  if (!approval) {
    return res.status(404).json({
      success: false,
      message: "Onay kaydı bulunamadı",
    });
  }

  if (approval.status !== "pending") {
    return res.status(400).json({
      success: false,
      message: "Sadece bekleyen onaylar güncellenebilir",
    });
  }

  approval.status = "approved";
  approval.completedAt = new Date();
  await approval.save();

  const step = await ApprovalStep.findOneAndUpdate(
    { approvalId: approval._id, stepOrder: approval.currentStep || 1 },
    {
      $set: {
        status: "approved",
        actionBy: req.user.id,
        actionAt: new Date(),
        comment,
      },
    },
    { new: true, upsert: true }
  );

  await ApprovalLog.create({
    approvalId: approval._id,
    stepId: step._id,
    action: "approved",
    userId: req.user.id,
    comment,
  });

  await updateEntityStatus(approval, "approved");

  const enriched = await enrichApproval(approval, req.user);
  res.status(200).json({ success: true, data: enriched });
});

const rejectStep = asyncErrorWrapper(async (req, res) => {
  const { approvalId } = req.params;
  const { comment } = req.body || {};
  const companyId = req.user.companyId || req.user.id;

  const approval = await Approval.findOne({
    _id: approvalId,
    companyId,
  });

  if (!approval) {
    return res.status(404).json({
      success: false,
      message: "Onay kaydı bulunamadı",
    });
  }

  if (approval.status !== "pending") {
    return res.status(400).json({
      success: false,
      message: "Sadece bekleyen onaylar güncellenebilir",
    });
  }

  approval.status = "rejected";
  approval.completedAt = new Date();
  await approval.save();

  const step = await ApprovalStep.findOneAndUpdate(
    { approvalId: approval._id, stepOrder: approval.currentStep || 1 },
    {
      $set: {
        status: "rejected",
        actionBy: req.user.id,
        actionAt: new Date(),
        comment,
      },
    },
    { new: true, upsert: true }
  );

  await ApprovalLog.create({
    approvalId: approval._id,
    stepId: step._id,
    action: "rejected",
    userId: req.user.id,
    comment,
  });

  await updateEntityStatus(approval, "rejected");

  const enriched = await enrichApproval(approval, req.user);
  res.status(200).json({ success: true, data: enriched });
});

const delegateApproval = asyncErrorWrapper(async (req, res) => {
  const { approvalId } = req.params;
  const { assignedTo, comment } = req.body || {};
  const companyId = req.user.companyId || req.user.id;

  if (!assignedTo) {
    return res.status(400).json({
      success: false,
      message: "assignedTo zorunludur",
    });
  }

  const approval = await Approval.findOne({
    _id: approvalId,
    companyId,
  });

  if (!approval) {
    return res.status(404).json({
      success: false,
      message: "Onay kaydı bulunamadı",
    });
  }

  const step = await ApprovalStep.findOneAndUpdate(
    { approvalId: approval._id, stepOrder: approval.currentStep || 1 },
    {
      $set: {
        assignedTo,
      },
    },
    { new: true, upsert: true }
  );

  await ApprovalLog.create({
    approvalId: approval._id,
    stepId: step._id,
    action: "delegated",
    userId: req.user.id,
    comment,
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

