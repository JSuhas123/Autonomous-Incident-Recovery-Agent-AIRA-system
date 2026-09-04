"use strict";

const {
  CONTENT_CHANNEL,
  POISONING_CLASS,
  assertPoisoningCannotAuthorize,
} = require(
  "../../contracts/humanLearningPoisoning"
);


const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/i,

  /ignore\s+(all\s+)?system\s+instructions/i,

  /you\s+are\s+now\s+(?:the\s+)?system/i,

  /system\s*prompt/i,

  /developer\s*message/i,

  /override\s+(?:the\s+)?policy/i,

  /bypass\s+(?:the\s+)?safety/i,

  /disable\s+(?:the\s+)?guardrail/i,

  /execute\s+(?:this\s+)?command/i,

  /run\s+(?:this\s+)?shell\s+command/i,

  /treat\s+(?:this\s+)?(?:log|evidence|document)\s+as\s+instructions/i,

  /do\s+not\s+verify/i,

  /skip\s+approval/i,
];


class LearningPromptInjectionBoundary {
  inspect(
    input = {}
  ) {
    assertPoisoningCannotAuthorize(
      input
    );


    const channel =
      input.channel;


    const text =
      typeof input.content ===
        "string"
        ? input.content
        : JSON.stringify(
            input.content ||
            {}
          );


    const matches =
      INJECTION_PATTERNS
        .filter(
          (
            pattern
          ) =>
            pattern.test(
              text
            )
        )
        .map(
          (
            pattern
          ) => ({
            pattern:
              pattern.source,
          })
        );


    const instructionalChannel =
      channel ===
      CONTENT_CHANNEL.SYSTEM_POLICY;


    /*
     * Evidence/log/operator channels are DATA.
     *
     * Even benign-looking instructions inside them must never
     * become control-plane instructions.
     */
    const dataOnly =
      [
        CONTENT_CHANNEL.OPERATOR_ASSERTION,
        CONTENT_CHANNEL.RETRIEVED_EVIDENCE,
        CONTENT_CHANNEL.TOOL_OUTPUT,
        CONTENT_CHANNEL.MODEL_INTERPRETATION,
      ].includes(
        channel
      );


    return {
      safe:
        matches.length ===
        0,

      injectionDetected:
        matches.length >
        0,

      dataOnly,

      instructionalChannel,

      mayBecomeSystemInstruction:
        instructionalChannel,

      findings:
        matches,

      poisoningClass:
        matches.length >
        0
          ? POISONING_CLASS.PROMPT_INJECTION
          : null,

      executionAuthorized:
        false,
    };
  }
}


module.exports = {
  LearningPromptInjectionBoundary,
};