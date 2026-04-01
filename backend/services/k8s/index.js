/**
 * Kubernetes Services Module
 */

const { K8sClient, getK8sClient } = require('./k8sClient');

module.exports = {
  K8sClient,
  getK8sClient,
};
