"use strict";

/**
 * Kubernetes Playbook Mapping Service
 *
 * Purpose:
 * Maps deterministic Kubernetes diagnosis codes to the canonical
 * AIRA playbook responsible for handling that incident.
 *
 * IMPORTANT:
 * - This service does NOT execute playbooks.
 * - This service does NOT allow the LLM to invent playbook IDs.
 * - Unknown diagnoses return null.
 */

const KUBERNETES_PLAYBOOK_MAPPINGS = Object.freeze({
  K8S_CRASH_LOOP_BACKOFF: {
    playbookId: "PB-K8S-CRASHLOOP-001",
    category: "container_recovery",
    riskLevel: "HIGH",
  },

  K8S_OOM_KILLED: {
    playbookId: "PB-K8S-OOM-001",
    category: "resource_recovery",
    riskLevel: "HIGH",
  },

  K8S_FAILED_ROLLOUT: {
    playbookId: "PB-K8S-FAILED-ROLLOUT-001",
    category: "deployment_recovery",
    riskLevel: "HIGH",
  },

  K8S_IMAGE_PULL_FAILURE: {
    playbookId: "PB-K8S-IMAGEPULL-001",
    category: "image_recovery",
    riskLevel: "MEDIUM",
  },

  K8S_NODE_NOT_READY: {
    playbookId: "PB-K8S-NODE-NOTREADY-001",
    category: "node_recovery",
    riskLevel: "HIGH",
  },
});

class KubernetesPlaybookMappingService {
  /**
   * Return the complete mapping for a diagnosis code.
   */
  getMapping(diagnosisCode) {
    if (!diagnosisCode) {
      return null;
    }

    const normalized =
      String(diagnosisCode)
        .trim()
        .toUpperCase();

    const mapping =
      KUBERNETES_PLAYBOOK_MAPPINGS[
        normalized
      ];

    if (!mapping) {
      return null;
    }

    return {
      diagnosisCode: normalized,
      ...mapping,
    };
  }

  /**
   * Convenience method for retrieving only the playbook ID.
   */
  getPlaybookId(diagnosisCode) {
    return (
      this.getMapping(diagnosisCode)
        ?.playbookId ?? null
    );
  }

  /**
   * Whether AIRA has a deterministic mapping for this diagnosis.
   */
  isMapped(diagnosisCode) {
    return Boolean(
      this.getMapping(diagnosisCode)
    );
  }

  /**
   * Prevent arbitrary / hallucinated playbook IDs.
   */
  isApprovedPlaybook(playbookId) {
    if (!playbookId) {
      return false;
    }

    return Object.values(
      KUBERNETES_PLAYBOOK_MAPPINGS
    ).some(
      (mapping) =>
        mapping.playbookId ===
        playbookId
    );
  }

  /**
   * Used by tests / diagnostics / admin tooling.
   */
  listMappings() {
    return Object.entries(
      KUBERNETES_PLAYBOOK_MAPPINGS
    ).map(
      ([diagnosisCode, mapping]) => ({
        diagnosisCode,
        ...mapping,
      })
    );
  }
}

const kubernetesPlaybookMappingService =
  new KubernetesPlaybookMappingService();

module.exports = {
  KubernetesPlaybookMappingService,
  kubernetesPlaybookMappingService,
  KUBERNETES_PLAYBOOK_MAPPINGS,
};