"use strict";


const Joi =
  require(
    "joi"
  );


const {
  RESOURCE_TYPE_PATTERN,
} =
  require(
    "../../constants/resourceTypes"
  );


const {
  RESOURCE_CAPABILITY_VALUES,
} =
  require(
    "../../constants/resourceCapabilities"
  );


const {
  PLAYBOOK_ID_REGEX,
} =
  require(
    "../../constants/playbook"
  );


const {
  KNOWLEDGE_API_VERSION,

  FAILURE_MODE_KIND,

  FAILURE_MODE_ID_PATTERN,

  KNOWLEDGE_SEMVER_PATTERN,

  KNOWLEDGE_SCOPE,

  KNOWLEDGE_SCOPE_VALUES,

  KNOWLEDGE_LIFECYCLE,

  KNOWLEDGE_LIFECYCLE_VALUES,

  FAILURE_MODE_SEVERITY_VALUES,

  KNOWLEDGE_EVIDENCE_TYPE_VALUES,
} =
  require(
    "../../constants/knowledge"
  );


const {
  KNOWLEDGE_DOMAIN_PATTERN,
} =
  require(
    "../../constants/knowledgeDomains"
  );


// ============================================================================
// COMMON
// ============================================================================

const nullableString =
  Joi
    .string()
    .trim()
    .min(
      1
    )
    .max(
      2048
    )
    .allow(
      null
    );


const metadataSchema =
  Joi
    .object()
    .unknown(
      true
    )
    .default(
      {}
    );


// ============================================================================
// KNOWLEDGE SCOPE
// ============================================================================

const scopeSchema =
  Joi
    .object({

      scopeType:
        Joi
          .string()
          .valid(
            ...KNOWLEDGE_SCOPE_VALUES
          )
          .required(),

      organizationId:
        nullableString
          .default(
            null
          ),

      environmentId:
        nullableString
          .default(
            null
          ),
    })
    .custom(
      (
        value,
        helpers
      ) => {

        if (
          value.scopeType ===
          KNOWLEDGE_SCOPE.GLOBAL
        ) {
          if (
            value.organizationId !==
              null ||
            value.environmentId !==
              null
          ) {
            return helpers
              .error(
                "knowledge.scope.global"
              );
          }

          return value;
        }


        if (
          value.scopeType ===
          KNOWLEDGE_SCOPE.ORGANIZATION
        ) {
          if (
            !value.organizationId
          ) {
            return helpers
              .error(
                "knowledge.scope.organizationRequired"
              );
          }


          if (
            value.environmentId !==
            null
          ) {
            return helpers
              .error(
                "knowledge.scope.organizationEnvironmentForbidden"
              );
          }


          return value;
        }


        if (
          value.scopeType ===
          KNOWLEDGE_SCOPE.ENVIRONMENT
        ) {
          if (
            !value.organizationId
          ) {
            return helpers
              .error(
                "knowledge.scope.organizationRequired"
              );
          }


          if (
            !value.environmentId
          ) {
            return helpers
              .error(
                "knowledge.scope.environmentRequired"
              );
          }


          return value;
        }


        return value;
      }
    )
    .messages({

      "knowledge.scope.global":
        "GLOBAL knowledge cannot carry organizationId or environmentId",

      "knowledge.scope.organizationRequired":
        "organizationId is required for organization/environment knowledge",

      "knowledge.scope.organizationEnvironmentForbidden":
        "ORGANIZATION knowledge cannot carry environmentId",

      "knowledge.scope.environmentRequired":
        "environmentId is required for ENVIRONMENT knowledge",
    })
    .required()
    .unknown(
      false
    );


// ============================================================================
// TRIGGER / SYMPTOM
// ============================================================================

const evidenceIndicatorSchema =
  Joi
    .object({

      id:
        Joi
          .string()
          .trim()
          .min(
            1
          )
          .max(
            256
          )
          .required(),

      description:
        Joi
          .string()
          .trim()
          .min(
            1
          )
          .max(
            4096
          )
          .required(),

      evidenceType:
        Joi
          .string()
          .valid(
            ...KNOWLEDGE_EVIDENCE_TYPE_VALUES
          )
          .allow(
            null
          )
          .default(
            null
          ),

      expression:
        nullableString
          .default(
            null
          ),

      required:
        Joi
          .boolean()
          .default(
            false
          ),

      metadata:
        metadataSchema,
    })
    .unknown(
      false
    );


// ============================================================================
// PLAYBOOK REFERENCE
// ============================================================================

const playbookReferenceSchema =
  Joi
    .object({

      playbookId:
        Joi
          .string()
          .pattern(
            PLAYBOOK_ID_REGEX
          )
          .required(),

      versionConstraint:
        nullableString
          .default(
            null
          ),

      strategy:
        Joi
          .string()
          .trim()
          .min(
            1
          )
          .max(
            512
          )
          .required(),

      priority:
        Joi
          .number()
          .integer()
          .min(
            0
          )
          .max(
            1000
          )
          .default(
            100
          ),

      required:
        Joi
          .boolean()
          .default(
            false
          ),

      metadata:
        metadataSchema,
    })
    .unknown(
      false
    );


// ============================================================================
// RISK
// ============================================================================

const riskSchema =
  Joi
    .object({

      level:
        Joi
          .string()
          .valid(
            "LOW",
            "MEDIUM",
            "HIGH",
            "CRITICAL"
          )
          .required(),

      blastRadius:
        nullableString
          .default(
            null
          ),

      reversible:
        Joi
          .boolean()
          .default(
            false
          ),

      dataLossPotential:
        Joi
          .string()
          .valid(
            "NONE",
            "LOW",
            "MEDIUM",
            "HIGH",
            "UNKNOWN"
          )
          .default(
            "UNKNOWN"
          ),

      metadata:
        metadataSchema,
    })
    .unknown(
      false
    );


// ============================================================================
// SAFETY
// ============================================================================

const safetySchema =
  Joi
    .object({

      evidenceOnly:
        Joi
          .boolean()
          .valid(
            true
          )
          .default(
            true
          ),

      executionAuthorized:
        Joi
          .boolean()
          .valid(
            false
          )
          .default(
            false
          ),

      grantsExecutionPermission:
        Joi
          .boolean()
          .valid(
            false
          )
          .default(
            false
          ),

      bypassesPolicy:
        Joi
          .boolean()
          .valid(
            false
          )
          .default(
            false
          ),

      bypassesAuthorization:
        Joi
          .boolean()
          .valid(
            false
          )
          .default(
            false
          ),

      bypassesApproval:
        Joi
          .boolean()
          .valid(
            false
          )
          .default(
            false
          ),

      bypassesEntitlements:
        Joi
          .boolean()
          .valid(
            false
          )
          .default(
            false
          ),

      bypassesKillSwitch:
        Joi
          .boolean()
          .valid(
            false
          )
          .default(
            false
          ),
    })
    .default(
      () => ({
        evidenceOnly:
          true,

        executionAuthorized:
          false,

        grantsExecutionPermission:
          false,

        bypassesPolicy:
          false,

        bypassesAuthorization:
          false,

        bypassesApproval:
          false,

        bypassesEntitlements:
          false,

        bypassesKillSwitch:
          false,
      })
    )
    .unknown(
      false
    );


// ============================================================================
// FAILURE MODE
// ============================================================================

const failureModeSchema =
  Joi
    .object({

      apiVersion:
        Joi
          .string()
          .valid(
            KNOWLEDGE_API_VERSION
          )
          .default(
            KNOWLEDGE_API_VERSION
          ),

      kind:
        Joi
          .string()
          .valid(
            FAILURE_MODE_KIND
          )
          .default(
            FAILURE_MODE_KIND
          ),

      /**
       * PostgreSQL public identity is assigned later by persistence.
       *
       * failureModeId is the stable human/domain-facing logical ID.
       */
      publicId:
        nullableString
          .default(
            null
          ),

      failureModeId:
        Joi
          .string()
          .pattern(
            FAILURE_MODE_ID_PATTERN
          )
          .required(),

      semver:
        Joi
          .string()
          .pattern(
            KNOWLEDGE_SEMVER_PATTERN
          )
          .required(),

      name:
        Joi
          .string()
          .trim()
          .min(
            1
          )
          .max(
            512
          )
          .required(),

      description:
        Joi
          .string()
          .trim()
          .min(
            1
          )
          .max(
            8192
          )
          .required(),

      domain:
        Joi
          .string()
          .pattern(
            KNOWLEDGE_DOMAIN_PATTERN
          )
          .required(),

      scope:
        scopeSchema,

      resourceTypes:
        Joi
          .array()
          .items(
            Joi
              .string()
              .pattern(
                RESOURCE_TYPE_PATTERN
              )
          )
          .min(
            1
          )
          .unique()
          .required(),

      severity:
        Joi
          .string()
          .valid(
            ...FAILURE_MODE_SEVERITY_VALUES
          )
          .required(),

      lifecycle:
        Joi
          .string()
          .valid(
            ...KNOWLEDGE_LIFECYCLE_VALUES
          )
          .default(
            KNOWLEDGE_LIFECYCLE.DRAFT
          ),

      triggers:
        Joi
          .array()
          .items(
            evidenceIndicatorSchema
          )
          .default(
            []
          ),

      symptoms:
        Joi
          .array()
          .items(
            evidenceIndicatorSchema
          )
          .min(
            1
          )
          .required(),

      /**
       * These become first-class entities in Phase 18.8–18.9.
       *
       * Keeping IDs here prevents FailureMode from embedding mutable
       * investigation/evidence structures forever.
       */
      evidenceRequirementIds:
        Joi
          .array()
          .items(
            Joi
              .string()
              .trim()
              .min(
                1
              )
              .max(
                512
              )
          )
          .unique()
          .default(
            []
          ),

      investigationStepIds:
        Joi
          .array()
          .items(
            Joi
              .string()
              .trim()
              .min(
                1
              )
              .max(
                512
              )
          )
          .unique()
          .default(
            []
          ),

      hypothesisIds:
        Joi
          .array()
          .items(
            Joi
              .string()
              .trim()
              .min(
                1
              )
              .max(
                512
              )
          )
          .unique()
          .default(
            []
          ),

      playbooks:
        Joi
          .array()
          .items(
            playbookReferenceSchema
          )
          .default(
            []
          ),

      requiredCapabilities:
        Joi
          .array()
          .items(
            Joi
              .string()
              .valid(
                ...RESOURCE_CAPABILITY_VALUES
              )
          )
          .unique()
          .default(
            []
          ),

      risk:
        riskSchema
          .required(),

      /**
       * These describe requirements.
       *
       * They are NOT final policy decisions.
       */
      policyRequirements:
        Joi
          .array()
          .items(
            Joi
              .string()
              .trim()
              .min(
                1
              )
              .max(
                512
              )
          )
          .unique()
          .default(
            []
          ),

      rollback:
        Joi
          .object({

            required:
              Joi
                .boolean()
                .default(
                  false
                ),

            strategy:
              nullableString
                .default(
                  null
                ),
          })
          .default(
            () => ({
              required:
                false,

              strategy:
                null,
            })
          )
          .unknown(
            false
          ),

      verification:
        Joi
          .object({

            required:
              Joi
                .boolean()
                .default(
                  true
                ),

            requirementIds:
              Joi
                .array()
                .items(
                  Joi
                    .string()
                    .trim()
                    .min(
                      1
                    )
                    .max(
                      512
                    )
                )
                .unique()
                .default(
                  []
                ),
          })
          .default(
            () => ({
              required:
                true,

              requirementIds:
                [],
            })
          )
          .unknown(
            false
          ),

      escalation:
        Joi
          .object({

            required:
              Joi
                .boolean()
                .default(
                  true
                ),

            reasons:
              Joi
                .array()
                .items(
                  Joi
                    .string()
                    .trim()
                    .min(
                      1
                    )
                    .max(
                      512
                    )
                )
                .unique()
                .default(
                  []
                ),
          })
          .default(
            () => ({
              required:
                true,

              reasons:
                [],
            })
          )
          .unknown(
            false
          ),

      provenance:
        Joi
          .object({

            source:
              Joi
                .string()
                .trim()
                .min(
                  1
                )
                .max(
                  512
                )
                .required(),

            sourceVersion:
              nullableString
                .default(
                  null
                ),

            importedFrom:
              nullableString
                .default(
                  null
                ),
          })
          .required()
          .unknown(
            false
          ),

      metadata:
        metadataSchema,

      safety:
        safetySchema,
    })
    .unknown(
      false
    );


// ============================================================================
// VALIDATION
// ============================================================================

function validateFailureMode(
  value
) {
  return failureModeSchema
    .validate(
      value,
      {
        abortEarly:
          false,

        allowUnknown:
          false,

        stripUnknown:
          false,
      }
    );
}


function assertValidFailureMode(
  value
) {
  const {
    error,

    value:
      validated,
  } =
    validateFailureMode(
      value
    );


  if (
    error
  ) {
    const validationError =
      new Error(
        error.message
      );


    validationError.code =
      "FAILURE_MODE_CONTRACT_INVALID";


    validationError.details =
      error.details;


    throw validationError;
  }


  return validated;
}


module.exports = {
  scopeSchema,

  evidenceIndicatorSchema,

  playbookReferenceSchema,

  riskSchema,

  safetySchema,

  failureModeSchema,

  validateFailureMode,

  assertValidFailureMode,
};