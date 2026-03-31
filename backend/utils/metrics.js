function calculateMetrics(logs) {
  if (!Array.isArray(logs) || logs.length === 0) {
    return {
      errorRate: 0,
      averageResponseTime: 0,
      sampleSize: 0,
      errorCount: 0,
    };
  }

  const errorCount = logs.filter((log) => log.status === "error").length;
  const totalResponseTime = logs.reduce((sum, log) => sum + log.responseTime, 0);

  return {
    errorRate: Number(((errorCount / logs.length) * 100).toFixed(2)),
    averageResponseTime: Number((totalResponseTime / logs.length).toFixed(2)),
    sampleSize: logs.length,
    errorCount,
  };
}

module.exports = {
  calculateMetrics,
};
