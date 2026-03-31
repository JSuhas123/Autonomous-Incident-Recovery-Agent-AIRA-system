function getSystemState(errorRate) {
  if (errorRate < 20) {
    return "HEALTHY";
  }

  if (errorRate <= 40) {
    return "WARNING";
  }

  return "CRITICAL";
}

module.exports = {
  getSystemState,
};
