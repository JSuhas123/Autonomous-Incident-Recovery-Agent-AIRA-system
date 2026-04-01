/**
 * Kubernetes Services Module
 * 
 * Exports:
 * - K8sClient: Base Kubernetes client with retry logic
 * - ResilientK8sExecutor: Enhanced executor with audit, timeout, pre/post state tracking
 * - getK8sClient: Function to get singleton K8s client
 * - getResilientK8sExecutor: Function to get singleton resilient executor
 */

const { K8sClient, getK8sClient } = require('./k8sClient');
const { ResilientK8sExecutor } = require('./resilientK8sExecutor');

let resilientExecutor = null;

/**
 * Get singleton resilient K8s executor
 */
function getResilientK8sExecutor() {
  if (!resilientExecutor) {
    const k8sClient = getK8sClient();
    resilientExecutor = new ResilientK8sExecutor(k8sClient);
  }
  return resilientExecutor;
}

module.exports = {
  K8sClient,
  getK8sClient,
  ResilientK8sExecutor,
  getResilientK8sExecutor,
};
