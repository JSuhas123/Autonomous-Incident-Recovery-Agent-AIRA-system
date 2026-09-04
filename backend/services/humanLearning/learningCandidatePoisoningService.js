"use strict";

const {
  POISONING_CLASS,
  CONTENT_CHANNEL,
  assertPoisoningCannotAuthorize,
} = require(
  "../../contracts/humanLearningPoisoning"
);


const SECRET_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,

  /\bbearer\s+[a-z0-9._~+/=-]{12,}\b/i,

  /\b(?:password|passwd|api[_-]?key|client[_-]?secret|token)\s*[:=]\s*[^\s,}]+/i,

  /\bAWS_SECRET_ACCESS_KEY\b/i,
];


class LearningCandidatePoisoningService {
  constructor(
    options = {}
  ) {
    this.evidenceTrustService =
      options.evidenceTrustService;

    this.promptInjectionBoundary =
      options.promptInjectionBoundary;

    this.outcomeVerifier =
      options.outcomeVerifier;
  }


  evaluate(
    input = {}
  ) {
    assertPoisoningCannotAuthorize(
      input
    );


    const findings =
      [];


    const add =
      (
        poisoningClass,
        severity,
        reason
      ) => {
        if (
          findings.some(
            (
              item
            ) =>
              item.poisoningClass ===
              poisoningClass
          )
        ) {
          return;
        }


        findings.push({
          poisoningClass,

          severity,

          reason,
        });
      };


    const candidate =
      input.candidate ||
      {};


    const candidateText =
      JSON.stringify(
        candidate
      );


    /*
     * --------------------------------------------------------------
     * Prompt / instruction injection
     * --------------------------------------------------------------
     */
    for (
      const content
      of input.contentItems ||
      []
    ) {
      const inspection =
        this.promptInjectionBoundary
          .inspect({
            channel:
              content.channel,

            content:
              content.content,

            executionAuthorized:
              false,
          });


      if (
        inspection.injectionDetected
      ) {
        add(
          POISONING_CLASS.PROMPT_INJECTION,

          "CRITICAL",

          "Instruction-like content detected in untrusted learning material"
        );
      }


      const trust =
        this.evidenceTrustService
          .assess({
            ...content,

            executionAuthorized:
              false,
          });


      if (
        content.channel ===
          CONTENT_CHANNEL
            .RETRIEVED_EVIDENCE
        &&
        trust.usableAsEvidence !==
          true
      ) {
        add(
          POISONING_CLASS.RETRIEVED_EVIDENCE_POISONING,

          "HIGH",

          "Retrieved evidence failed trust requirements"
        );
      }


      if (
        trust.reasons.includes(
          POISONING_CLASS
            .CROSS_TENANT_CONTAMINATION
        )
      ) {
        add(
          POISONING_CLASS.CROSS_TENANT_CONTAMINATION,

          "CRITICAL",

          "Evidence crossed a tenant isolation boundary"
        );
      }
    }


    /*
     * --------------------------------------------------------------
     * Secret exfiltration
     * --------------------------------------------------------------
     */
    if (
      SECRET_PATTERNS.some(
        (
          pattern
        ) =>
          pattern.test(
            candidateText
          )
      )
    ) {
      add(
        POISONING_CLASS.SECRET_EXFILTRATION,

        "CRITICAL",

        "Candidate contains secret-like material"
      );
    }


    /*
     * --------------------------------------------------------------
     * Outcome verification
     * --------------------------------------------------------------
     */
    const outcome =
      this.outcomeVerifier
        .verify({
          ...(input.outcome || {}),

          executionAuthorized:
            false,
        });


    if (
      outcome.falseSuccessDetected
    ) {
      add(
        POISONING_CLASS.FALSE_SUCCESS,

        "HIGH",

        "Service recovery claim did not survive verification requirements"
      );
    }


    if (
      outcome.temporaryMitigationDetected
    ) {
      add(
        POISONING_CLASS.TEMPORARY_MITIGATION,

        "MEDIUM",

        "Mitigation restored behavior without proving root-cause correction"
      );
    }


    /*
     * --------------------------------------------------------------
     * Unsupported RCA / causal claims
     * --------------------------------------------------------------
     */
    if (
      input.rootCauseClaimed ===
        true
      &&
      input.rootCauseEvidenceSupported !==
        true
    ) {
      add(
        POISONING_CLASS.UNSUPPORTED_CAUSAL_CLAIM,

        "HIGH",

        "Root-cause claim lacks supporting causal evidence"
      );


      add(
        POISONING_CLASS.INCORRECT_RCA,

        "HIGH",

        "Human or model RCA cannot be promoted without evidence"
      );
    }


    /*
     * --------------------------------------------------------------
     * Contradiction
     * --------------------------------------------------------------
     */
    if (
      input.contradictoryEvidence ===
        true
    ) {
      add(
        POISONING_CLASS.CONTRADICTORY_EVIDENCE,

        "HIGH",

        "Candidate conflicts with observed evidence"
      );
    }


    /*
     * --------------------------------------------------------------
     * Human outcome poisoning
     * --------------------------------------------------------------
     */
    if (
      input.humanDeclaredResolved ===
        true
      &&
      outcome.serviceRestored !==
        true
    ) {
      add(
        POISONING_CLASS.BAD_HUMAN_RESOLUTION,

        "HIGH",

        "Human resolution declaration is not independently verified"
      );
    }


    const passed =
      findings.length ===
      0;


    return {
      passed,

      findings,

      outcome,

      candidateStillTruthLevel:
        "CANDIDATE",

      publicationEligible:
        false,

      executionAuthorized:
        false,
    };
  }
}


module.exports = {
  LearningCandidatePoisoningService,
};