"use strict";

const {
  CONTENT_CHANNEL,
  TRUST_LEVEL,
  POISONING_CLASS,
  assertPoisoningCannotAuthorize,
} = require(
  "../../contracts/humanLearningPoisoning"
);


class LearningEvidenceTrustService {
  constructor(
    options = {}
  ) {
    this.promptInjectionBoundary =
      options.promptInjectionBoundary;
  }


  assess(
    input = {}
  ) {
    assertPoisoningCannotAuthorize(
      input
    );


    const channel =
      input.channel;


    const injection =
      this.promptInjectionBoundary
        ? this.promptInjectionBoundary
            .inspect({
              channel,

              content:
                input.content,

              executionAuthorized:
                false,
            })
        : {
            injectionDetected:
              false,
          };


    let trustLevel =
      TRUST_LEVEL.UNTRUSTED;


    switch (
      channel
    ) {
      case CONTENT_CHANNEL
        .VALIDATED_FACT:

        trustLevel =
          TRUST_LEVEL.VERIFIED;

        break;


      case CONTENT_CHANNEL
        .TOOL_OUTPUT:

        trustLevel =
          input.sourceAuthenticated ===
            true
          &&
          input.fresh ===
            true
            ? TRUST_LEVEL.HIGH
            : TRUST_LEVEL.MEDIUM;

        break;


      case CONTENT_CHANNEL
        .RETRIEVED_EVIDENCE:

        trustLevel =
          input.sourceAuthenticated ===
            true
          &&
          input.integrityVerified ===
            true
            ? TRUST_LEVEL.MEDIUM
            : TRUST_LEVEL.LOW;

        break;


      case CONTENT_CHANNEL
        .OPERATOR_ASSERTION:

        trustLevel =
          TRUST_LEVEL.LOW;

        break;


      case CONTENT_CHANNEL
        .MODEL_INTERPRETATION:

        trustLevel =
          TRUST_LEVEL.LOW;

        break;


      case CONTENT_CHANNEL
        .SYSTEM_POLICY:

        trustLevel =
          TRUST_LEVEL.HIGH;

        break;


      default:

        trustLevel =
          TRUST_LEVEL.UNTRUSTED;
    }


    const reasons =
      [];


    if (
      injection.injectionDetected ===
      true
    ) {
      trustLevel =
        TRUST_LEVEL.UNTRUSTED;


      reasons.push(
        POISONING_CLASS
          .PROMPT_INJECTION
      );
    }


    if (
      input.crossTenantSource ===
      true
    ) {
      trustLevel =
        TRUST_LEVEL.UNTRUSTED;


      reasons.push(
        POISONING_CLASS
          .CROSS_TENANT_CONTAMINATION
      );
    }


    if (
      input.integrityVerified ===
      false
      &&
      channel ===
        CONTENT_CHANNEL
          .RETRIEVED_EVIDENCE
    ) {
      reasons.push(
        POISONING_CLASS
          .RETRIEVED_EVIDENCE_POISONING
      );
    }


    return {
      channel,

      trustLevel,

      trusted:
        [
          TRUST_LEVEL.HIGH,
          TRUST_LEVEL.VERIFIED,
        ].includes(
          trustLevel
        ),

      usableAsEvidence:
        trustLevel !==
        TRUST_LEVEL.UNTRUSTED,

      usableAsInstruction:
        channel ===
        CONTENT_CHANNEL.SYSTEM_POLICY
        &&
        injection.injectionDetected !==
        true,

      reasons,

      injection,

      executionAuthorized:
        false,
    };
  }
}


module.exports = {
  LearningEvidenceTrustService,
};