"use strict";


/**
 * ============================================================================
 * AIRA PHASE 23.3C
 * HUMAN ESCALATION NOTIFICATION DELIVERY SERVICE
 * ============================================================================
 *
 * Delivery paths:
 *
 *   Direct integration target
 *          ↓
 *   IntegrationNotificationGateway
 *
 * OR
 *
 *   USER / TEAM / generic target
 *          ↓
 *   existing tenant notification routing rules
 *
 *
 * SAFETY
 * ------
 *
 * NOTIFICATION != ACKNOWLEDGEMENT
 * ACKNOWLEDGEMENT != CONTROL
 * NOTIFICATION != EXECUTION AUTHORIZATION
 *
 * Provider delivery success means only:
 *
 *   the notification was delivered.
 *
 * It does NOT mean:
 *
 *   - the incident was resolved
 *   - the operator acknowledged
 *   - the operator acquired control
 *   - execution was authorized
 *
 * ============================================================================
 */


const {
  IntegrationNotificationGateway,
} =
  require(
    "../integrations/integrationNotificationGateway"
  );


const notificationRoutingService =
  require(
    "../notifications/notificationRoutingService"
  );


const {
  resolveTarget,
} =
  require(
    "./humanNotificationTargetResolver"
  );


function createError(
  message,
  code,
  retryable =
    true,
  details =
    {}
) {
  return Object.assign(
    new Error(
      message
    ),
    {
      code,

      retryable,

      executionAuthorized:
        false,

      ...details,
    }
  );
}


/*
 * ============================================================================
 * DELIVERY SERVICE
 * ============================================================================
 */


class HumanNotificationDeliveryService {
  constructor(
    options =
      {}
  ) {
    /*
     * integrationNotificationGateway.js exports:
     *
     * {
     *   IntegrationNotificationGateway,
     *   NOTIFICATION_TYPE,
     *   ...
     * }
     *
     * Therefore the constructor MUST be imported through destructuring.
     */
    this.integrationGateway =
      options.integrationGateway ||

      new IntegrationNotificationGateway(
        options.integrationOptions ||
        {}
      );


    this.routingService =
      options.routingService ||
      notificationRoutingService;
  }


  async deliver(
    request
  ) {
    if (
      !request ||
      typeof request !==
        "object"
    ) {
      throw createError(
        "Notification request is required",
        "HUMAN_NOTIFICATION_REQUEST_REQUIRED",
        false
      );
    }


    /*
     * ========================================================================
     * AUTHORITY FIREWALL
     * ========================================================================
     */


    if (
      request.executionAuthorized ===
        true
    ) {
      throw createError(
        "Notification request cannot contain execution authority",
        "HUMAN_NOTIFICATION_AUTHORITY_VIOLATION",
        false
      );
    }


    if (
      request.humanControlGranted ===
        true ||
      request.acknowledgementGranted ===
        true
    ) {
      throw createError(
        "Notification request cannot grant acknowledgement or human control",
        "HUMAN_NOTIFICATION_AUTHORITY_VIOLATION",
        false
      );
    }


    /*
     * Resolve the persisted target snapshot.
     *
     * RabbitMQ payload is NOT authoritative here.
     * HumanNotificationWorker reloads this request from PostgreSQL first.
     */
    const target =
      resolveTarget(
        request.targetSnapshot ||
        {}
      );


    /*
     * ========================================================================
     * DIRECT PHASE-20 INTEGRATION DELIVERY
     * ========================================================================
     *
     * Examples:
     *
     * Slack
     * PagerDuty
     * Microsoft Teams
     * Webhook
     *
     * This uses the already-certified Phase-20
     * IntegrationNotificationGateway.
     */


    if (
      target.directIntegration
    ) {
      let result;


      try {
        result =
          await this
            .integrationGateway
            .sendIncident(
              {
                organizationId:
                  request.organizationId,

                environmentId:
                  request.environmentId,

                integrationId:
                  target.integrationId,

                provider:
                  target.provider,
              },

              {
                incidentId:
                  request.incidentId,

                title:
                  request.title,

                message:
                  request.message,

                severity:
                  request.severity,

                metadata: {
                  notificationRequestId:
                    request.publicId,

                  escalationId:
                    request.escalationId,

                  humanTaskId:
                    request.humanTaskId ||
                    null,

                  assignmentId:
                    request.assignmentId ||
                    null,

                  acknowledgementDeadline:
                    request
                      .acknowledgementDeadline ||
                    null,

                  notificationEventType:
                    request
                      .notificationEventType ||
                    null,

                  targetRef:
                    request.targetRef ||
                    null,

                  humanControlGranted:
                    false,

                  acknowledgementGranted:
                    false,

                  executionAuthorized:
                    false,
                },
              }
            );
      } catch (
        error
      ) {
        /*
         * Provider/runtime failures are retryable unless the lower layer
         * explicitly says otherwise.
         */
        throw createError(
          error?.message ||
          `Notification provider failed: ${target.provider}`,

          error?.code ||
          "HUMAN_NOTIFICATION_PROVIDER_DELIVERY_FAILED",

          error?.retryable !==
            false,

          {
            provider:
              target.provider,

            integrationId:
              target.integrationId,

            cause:
              error,
          }
        );
      }


      /*
       * Provider results are not allowed to manufacture operational
       * authority.
       */
      if (
        result?.executionAuthorized ===
          true ||
        result?.authorizationGranted ===
          true ||
        result?.humanControlGranted ===
          true ||
        result?.acknowledgementGranted ===
          true
      ) {
        throw createError(
          "Notification provider attempted to grant operational authority",
          "HUMAN_NOTIFICATION_PROVIDER_AUTHORITY_VIOLATION",
          false,
          {
            provider:
              target.provider,

            integrationId:
              target.integrationId,
          }
        );
      }


      if (
        result?.delivered !==
        true
      ) {
        throw createError(
          `Notification provider did not confirm delivery: ${target.provider}`,
          "HUMAN_NOTIFICATION_PROVIDER_DELIVERY_FAILED",
          true,
          {
            provider:
              target.provider,

            integrationId:
              target.integrationId,

            providerResult:
              result ||
              null,
          }
        );
      }


      return {
        delivered:
          true,

        mode:
          "INTEGRATION_GATEWAY",

        provider:
          target.provider,

        integrationId:
          target.integrationId,

        channelType:
          target.provider,

        destinationRef:
          request.targetRef ||
          target.integrationId,

        providerResult:
          result,

        partial:
          false,

        humanControlGranted:
          false,

        acknowledgementGranted:
          false,

        executionAuthorized:
          false,
      };
    }


    /*
     * ========================================================================
     * TENANT NOTIFICATION ROUTING
     * ========================================================================
     *
     * USER / TEAM escalation targets do not automatically imply a specific
     * external address.
     *
     * We therefore use the existing notification routing system:
     *
     * event
     *   ↓
     * tenant routing rule
     *   ↓
     * configured active channel(s)
     *
     * We deliberately do NOT:
     *
     *   - guess email addresses
     *   - guess Slack users
     *   - invent PagerDuty destinations
     *   - invent integrations
     */


    let routed;


    try {
      routed =
        await this
          .routingService
          .routeNotification({
            notificationId:
              request.publicId,

            organizationId:
              request.organizationId,

            environmentId:
              request.environmentId,

            tenantId:
              request.organizationId,

            incidentId:
              request.incidentId,

            humanTaskId:
              request.humanTaskId ||
              null,

            escalationId:
              request.escalationId,

            eventType:
              request
                .notificationEventType,

            severity:
              request.severity,

            title:
              request.title,

            message:
              request.message,

            metadata: {
              assignmentId:
                request.assignmentId ||
                null,

              targetRef:
                request.targetRef ||
                null,

              targetType:
                request.targetType ||
                null,

              acknowledgementDeadline:
                request
                  .acknowledgementDeadline ||
                null,

              humanControlGranted:
                false,

              acknowledgementGranted:
                false,

              executionAuthorized:
                false,
            },
          });
    } catch (
      error
    ) {
      throw createError(
        error?.message ||
        "Tenant notification routing failed",

        error?.code ||
        "HUMAN_NOTIFICATION_ROUTING_FAILED",

        error?.retryable !==
          false,

        {
          cause:
            error,
        }
      );
    }


    /*
     * No matching configured route is a configuration failure.
     *
     * Requeueing forever cannot repair missing tenant configuration.
     */
    if (
      !routed ||
      routed.routed !==
        true ||
      Number(
        routed.attempted ||
        0
      ) ===
        0
    ) {
      throw createError(
        "No active tenant notification route matched this escalation",
        "HUMAN_NOTIFICATION_ROUTE_NOT_FOUND",
        false
      );
    }


    /*
     * A route may fan out to multiple channels.
     */
    const results =
      Array.isArray(
        routed.results
      )
        ? routed.results
        : [];


    const deliveredResults =
      results.filter(
        (
          result
        ) =>
          result?.delivered ===
          true
      );


    /*
     * Every configured route failed.
     *
     * This is treated as retryable because provider availability may recover.
     */
    if (
      deliveredResults.length ===
      0
    ) {
      throw createError(
        "All routed notification provider deliveries failed",
        "HUMAN_NOTIFICATION_ALL_ROUTES_FAILED",
        true,
        {
          providerResult:
            routed,
        }
      );
    }


    /*
     * At least one route succeeded.
     *
     * Do not resend the entire fanout merely because another route failed.
     * Doing that could duplicate notifications to already-successful
     * destinations.
     */
    const partial =
      deliveredResults.length <
      Number(
        routed.attempted ||
        results.length
      );


    return {
      delivered:
        true,

      mode:
        "ROUTING_RULES",

      provider:
        "tenant-routing",

      integrationId:
        null,

      channelType:
        "multi",

      destinationRef:
        request.targetRef ||
        null,

      providerResult:
        routed,

      partial,

      humanControlGranted:
        false,

      acknowledgementGranted:
        false,

      executionAuthorized:
        false,
    };
  }
}


/*
 * ============================================================================
 * DEFAULT SERVICE
 * ============================================================================
 */


const defaultService =
  new HumanNotificationDeliveryService();


module.exports =
  defaultService;


module.exports
  .HumanNotificationDeliveryService =
  HumanNotificationDeliveryService;