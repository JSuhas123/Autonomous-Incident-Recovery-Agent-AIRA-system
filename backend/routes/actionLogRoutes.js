const express = require("express");
const { actionLogService } = require("../services/execution");
const ActionLogService = actionLogService;

const router = express.Router();

router.get("/", async (req, res, next) => {
  try {
    const actionLogs = await ActionLogService.getLatestActionLogs(req.query.limit || 50);
    res.json({
      data: actionLogs,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
