/**
 * /api/pg/approval — PG paralel Approval route'lari.
 */

const express = require("express");
const {
  createApproval,
  listApprovals,
  getApprovalDetail,
  getApprovalHistory,
  approveStep,
  rejectStep,
  delegateApproval,
} = require("../../controllers/Pg/Approval");
const { getAccessToRoutePg } = require("../../Middleware/Pg/auth");

const router = express.Router();

router.use(getAccessToRoutePg);
router.post("/", createApproval);
router.get("/", listApprovals);
router.get("/:approvalId", getApprovalDetail);
router.get("/:approvalId/history", getApprovalHistory);
router.post("/:approvalId/approve", approveStep);
router.post("/:approvalId/reject", rejectStep);
router.post("/:approvalId/delegate", delegateApproval);

module.exports = router;
