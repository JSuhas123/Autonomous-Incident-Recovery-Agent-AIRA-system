"use strict";

/**
 * ============================================================================
 * AIRA PHASE 25.1C
 * REGISTRATION PRODUCT BOOTSTRAP SERVICE
 * ============================================================================
 *
 * Converts a successful identity/organization registration into the first
 * AIRA product-entry state.
 *
 * IMPORTANT
 *
 * Identity registration remains owned by authService.
 *
 * This service does NOT:
 * - create users
 * - grant roles
 * - grant permissions
 * - create execution authority
 * - modify autonomy
 *
 * It only establishes product-facing state after the canonical organization
 * bootstrap has succeeded.
 * ============================================================================
 */

const {
  environmentRepository,
} = require(
  "../../persistence/repositories"
);

const {
  OrganizationProfileService,
} = require(
  "./organizationProfileService"
);

const {
  buildProductContext,
} = require(
  "./productContextService"
);


const REGISTRATION_NEXT_ACTIONS =
  Object.freeze({
    COMPLETE_COMPANY_PROFILE:
      "complete_company_profile",

    INVITE_TEAM:
      "invite_team",

    CONNECT_OBSERVABILITY:
      "connect_observability",

    ENTER_PLATFORM:
      "enter_platform",
  });


function createBootstrapError(
  message,
  status,
  code
) {
  const error =
    new Error(
      message
    );

  error.status =
    status;

  error.code =
    code;

  error.executionAuthorized =
    false;

  return error;
}


function asId(
  value
) {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  return typeof value ===
    "string"
    ? value
    : value.toString();
}


function normalizeEnvironment(
  environment
) {
  if (!environment) {
    return null;
  }

  return {
    id:
      asId(
        environment._id ??
        environment.id
      ),

    organizationId:
      asId(
        environment.organizationId
      ),

    name:
      environment.name ??
      null,

    slug:
      environment.slug ??
      null,

    type:
      environment.type ??
      environment.environmentType ??
      null,

    criticality:
      environment.criticality ??
      null,

    status:
      environment.status ??
      null,

    isDefault:
      Boolean(
        environment.isDefault ??
        environment.settings
          ?.isDefault
      ),
  };
}


function deriveRegistrationNextAction(
  {
    profile,
  } = {}
) {
  if (
    !profile ||
    profile.profileStatus !==
      "complete"
  ) {
    return REGISTRATION_NEXT_ACTIONS
      .COMPLETE_COMPANY_PROFILE;
  }

  /*
   * Future Phase 25 onboarding evidence will advance these stages using
   * server-observed facts.
   *
   * At this point we intentionally stop at invite_team.
   */
  return REGISTRATION_NEXT_ACTIONS
    .INVITE_TEAM;
}


class RegistrationProductBootstrapService {
  constructor(
    options = {}
  ) {
    this.environmentRepository =
      options.environmentRepository ||
      environmentRepository;

    this.organizationProfileService =
      options.organizationProfileService ||
      new OrganizationProfileService(
        options
          .organizationProfileServiceOptions ||
        {}
      );
  }


  async resolveDefaultEnvironment(
    organizationId
  ) {
    if (!organizationId) {
      throw createBootstrapError(
        "Organization identity is required for product bootstrap",
        500,
        "PRODUCT_REGISTRATION_ORGANIZATION_REQUIRED"
      );
    }

    /*
     * Prefer explicitly/default-marked environment.
     *
     * Repository implementations normalize persistence differences.
     */
    let environment =
      await this
        .environmentRepository
        .findOne({
          organizationId,

          isDefault:
            true,

          status:
            "active",
        });


    if (!environment) {
      /*
       * Compatibility fallback.
       *
       * Older bootstrap data may not persist isDefault directly.
       */
      environment =
        await this
          .environmentRepository
          .findOne({
            organizationId,

            status:
              "active",
          });
    }


    if (!environment) {
      throw createBootstrapError(
        "Canonical organization environment was not found after registration",
        503,
        "PRODUCT_REGISTRATION_ENVIRONMENT_MISSING"
      );
    }


    return environment;
  }


  async bootstrap(
    authResult
  ) {
    if (
      !authResult ||
      typeof authResult !==
        "object"
    ) {
      throw createBootstrapError(
        "Successful authentication result is required",
        500,
        "PRODUCT_REGISTRATION_AUTH_RESULT_REQUIRED"
      );
    }


    const user =
      authResult.user;

    const organization =
      authResult.organization;

    const membership =
      authResult.membership;


    if (
      !user?.id ||
      !organization?.id ||
      !membership?.id ||
      !membership?.role
    ) {
      throw createBootstrapError(
        "Registration result is missing canonical identity state",
        500,
        "PRODUCT_REGISTRATION_IDENTITY_INCOMPLETE"
      );
    }


    const environment =
      await this
        .resolveDefaultEnvironment(
          organization.id
        );


    const normalizedEnvironment =
      normalizeEnvironment(
        environment
      );


    /*
     * Phase 25 initial profile.
     *
     * Organization name is a reasonable initial legal/display-name candidate,
     * but all other enterprise profile fields remain incomplete.
     *
     * This intentionally causes onboarding to continue.
     */
    const profile =
      await this
        .organizationProfileService
        .upsertProfile({
          organizationId:
            organization.id,

          environmentId:
            normalizedEnvironment.id,

          input: {
            legalName:
              organization.name,

            metadata: {
              source:
                "registration",

              phase:
                "25.1C",
            },
          },
        });


    /*
     * ProductContext is derived from authenticated registration state.
     *
     * Persona is presentation only.
     */
    const productContext =
      buildProductContext({
        authenticationType:
          "session",

        userId:
          user.id,

        membershipId:
          membership.id,

        organizationId:
          organization.id,

        tenantId:
          organization.tenantId ??
          null,

        role:
          membership.role,

        organization,

        membership,

        environment:
          normalizedEnvironment,

        environmentId:
          normalizedEnvironment.id,

        requestId:
          null,
      });


    const nextAction =
      deriveRegistrationNextAction({
        profile,
      });


    return {
      version:
        "25.1C",

      productContext,

      organizationProfile:
        profile,

      onboarding: {
        registrationComplete:
          true,

        organizationCreated:
          true,

        ownerMembershipCreated:
          membership.role ===
          "owner",

        defaultEnvironmentReady:
          true,

        companyProfileComplete:
          profile
            ?.profileStatus ===
          "complete",

        nextAction,
      },

      landing: {
        path:
          productContext
            .identity
            .personaMetadata
            .defaultLandingPath,

        reason:
          "product_persona",
      },

      safety: {
        registrationGrantsExecutionAuthority:
          false,

        profileGrantsExecutionAuthority:
          false,

        personaGrantsExecutionAuthority:
          false,

        executionAuthorized:
          false,
      },
    };
  }
}


module.exports = {
  REGISTRATION_NEXT_ACTIONS,

  normalizeEnvironment,

  deriveRegistrationNextAction,

  RegistrationProductBootstrapService,
};