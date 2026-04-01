const express = require('express');
const router = express.Router();
const reportingService = require('../services/core/reportingService');

/**
 * Phase 10: Reporting Routes
 * 
 * Generate comprehensive reports on AIRA effectiveness, failures, and recommendations
 */

/**
 * POST /effectiveness
 * Generate effectiveness report
 */
router.post('/effectiveness', async (req, res) => {
  try {
    const { tenantId = 'default', startDate, endDate } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: startDate, endDate'
      });
    }

    const report = await reportingService.generateEffectivenessReport(
      tenantId,
      new Date(startDate),
      new Date(endDate)
    );

    res.json({
      success: true,
      reportId: report._id,
      reportType: 'effectiveness',
      summary: report.summary,
      metrics: report.metrics
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /failure-analysis
 * Generate failure analysis report
 */
router.post('/failure-analysis', async (req, res) => {
  try {
    const { tenantId = 'default', startDate, endDate } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: startDate, endDate'
      });
    }

    const report = await reportingService.generateFailureAnalysisReport(
      tenantId,
      new Date(startDate),
      new Date(endDate)
    );

    res.json({
      success: true,
      reportId: report._id,
      reportType: 'failure_analysis',
      summary: report.summary,
      findings: report.findings,
      recommendations: report.recommendations,
      riskAreas: report.riskAreas
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /confidence-calibration
 * Generate confidence calibration report
 */
router.post('/confidence-calibration', async (req, res) => {
  try {
    const { tenantId = 'default', startDate, endDate } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: startDate, endDate'
      });
    }

    const report = await reportingService.generateConfidenceCalibrationReport(
      tenantId,
      new Date(startDate),
      new Date(endDate)
    );

    res.json({
      success: true,
      reportId: report._id,
      reportType: 'confidence_calibration',
      summary: report.summary,
      metrics: report.metrics,
      recommendations: report.recommendations
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /executive-summary
 * Generate executive summary report
 */
router.post('/executive-summary', async (req, res) => {
  try {
    const { tenantId = 'default', startDate, endDate } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: startDate, endDate'
      });
    }

    const report = await reportingService.generateExecutiveSummaryReport(
      tenantId,
      new Date(startDate),
      new Date(endDate)
    );

    res.json({
      success: true,
      reportId: report._id,
      reportType: 'executive_summary',
      summary: report.summary,
      metrics: report.metrics,
      businessImpact: report.metrics.businessImpact
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /reports
 * Get all reports for tenant
 */
router.get('/reports', async (req, res) => {
  try {
    const { tenantId = 'default', type, limit = 10 } = req.query;

    const reports = await reportingService.getReports(
      tenantId,
      type,
      parseInt(limit)
    );

    res.json({
      success: true,
      tenantId,
      reportsCount: reports.length,
      reports: reports.map(r => ({
        id: r._id,
        type: r.reportType,
        period: r.period,
        generatedAt: r.generatedAt,
        status: r.status
      }))
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /reports/:reportId
 * Get specific report
 */
router.get('/reports/:reportId', async (req, res) => {
  try {
    const { reportId } = req.params;

    const report = await reportingService.getReport(reportId);

    if (!report) {
      return res.status(404).json({
        success: false,
        error: 'Report not found'
      });
    }

    res.json({
      success: true,
      report
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /reports/:reportId/archive
 * Archive report
 */
router.post('/reports/:reportId/archive', async (req, res) => {
  try {
    const { reportId } = req.params;

    const report = await reportingService.archiveReport(reportId);

    res.json({
      success: true,
      message: 'Report archived',
      reportId
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
