"use strict";

const {
  createFromEscalation,
} =
  require(
    "./humanTaskService"
  );

const {
  routeNotification,
} =
  require(
    "../notifications/notificationRoutingService"
  );


async function handleEscalation(
  escalation
) {
  const task =
    await createFromEscalation(
      escalation
    );

  await routeNotification({
    notificationId:
      "escalation_" +
      escalation
        .escalationId,

    organizationId:
      escalation
        .organizationId,

    environmentId:
      escalation
        .environmentId,

    incidentId:
      escalation
        .incidentId,

    escalationId:
      escalation
        .escalationId,

    humanTaskId:
      task
        .public_id,

    eventType:
      "incident.escalated",

    severity:
      escalation
        .priority,

    title:
      "AIRA incident escalated",

    message:
      escalation
        .message,
  });

  return {
    escalation,

    humanTask:
      task,

    executionAuthorized:
      false,
  };
}


module.exports = {
  handleEscalation,
};