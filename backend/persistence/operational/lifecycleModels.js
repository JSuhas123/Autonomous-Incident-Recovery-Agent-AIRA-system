"use strict";

const {
  incidentLifecycleRepository,
} = require("../repositories");

const {
  recoveryVerificationRepository,
} = require(
  "../repositories/recoveryVerificationProvider"
);

const RecoveryVerification = {
  async findOne(filter = {}) {
    const {
      organizationId,
      environmentId,
      incidentId,
      verificationId,
    } = filter;

    if (
      !organizationId ||
      !environmentId
    ) {
      return null;
    }

    if (verificationId) {
      return recoveryVerificationRepository
        .findByIdentifier(
          {
            organizationId,
            environmentId,
          },
          verificationId
        );
    }

    if (!incidentId) {
      return null;
    }

    return recoveryVerificationRepository
      .findCurrent({
        organizationId,
        environmentId,
        incidentId,
      });
  },
};

const IncidentLifecycle = {
  async findOne(filter = {}) {
    const {
      organizationId,
      environmentId,
      incidentId,
    } = filter;

    if (
      !organizationId ||
      !environmentId ||
      !incidentId
    ) {
      return null;
    }

    return incidentLifecycleRepository
      .findCurrent({
        organizationId,
        environmentId,
        incidentId,
      });
  },
};

module.exports = {
  RecoveryVerification,
  IncidentLifecycle,
};
