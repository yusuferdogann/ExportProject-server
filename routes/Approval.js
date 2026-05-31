const express = require("express");
const { getAccessToRoute } = require("../Middleware/authorization/auth");
const {
  createApproval,
  listApprovals,
  getApprovalDetail,
  getApprovalHistory,
  approveStep,
  rejectStep,
  delegateApproval,
} = require("../controllers/Approval/index");

const router = express.Router();

router.use(getAccessToRoute);

router.post("/", createApproval);
router.get("/", listApprovals);
router.get("/:approvalId", getApprovalDetail);
router.get("/:approvalId/history", getApprovalHistory);
router.post("/:approvalId/approve", approveStep);
router.post("/:approvalId/reject", rejectStep);
router.post("/:approvalId/delegate", delegateApproval);

module.exports = router;
