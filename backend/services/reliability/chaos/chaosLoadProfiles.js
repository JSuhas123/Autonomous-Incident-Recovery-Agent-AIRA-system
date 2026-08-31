"use strict";


const CHAOS_LOAD_PROFILE_VERSION =
  "21.10A-v1";


const CHAOS_LOAD_STAGE =
  Object.freeze({
    BASELINE:
      "BASELINE",

    NORMAL:
      "NORMAL",

    EXPECTED_PEAK:
      "EXPECTED_PEAK",

    OVERLOAD:
      "OVERLOAD",

    BREAKPOINT_SEARCH:
      "BREAKPOINT_SEARCH",

    RECOVERY:
      "RECOVERY",
  });


const CHAOS_LOAD_PROFILE =
  Object.freeze({
    SMOKE: {
      key:
        "SMOKE",

      stages: [
        {
          stage:
            CHAOS_LOAD_STAGE.BASELINE,

          targetRatePerSecond:
            1,

          durationSeconds:
            5,
        },

        {
          stage:
            CHAOS_LOAD_STAGE.NORMAL,

          targetRatePerSecond:
            5,

          durationSeconds:
            10,
        },

        {
          stage:
            CHAOS_LOAD_STAGE.RECOVERY,

          targetRatePerSecond:
            1,

          durationSeconds:
            5,
        },
      ],
    },


    DEVELOPMENT: {
      key:
        "DEVELOPMENT",

      stages: [
        {
          stage:
            CHAOS_LOAD_STAGE.BASELINE,

          targetRatePerSecond:
            5,

          durationSeconds:
            10,
        },

        {
          stage:
            CHAOS_LOAD_STAGE.NORMAL,

          targetRatePerSecond:
            25,

          durationSeconds:
            20,
        },

        {
          stage:
            CHAOS_LOAD_STAGE.EXPECTED_PEAK,

          targetRatePerSecond:
            75,

          durationSeconds:
            20,
        },

        {
          stage:
            CHAOS_LOAD_STAGE.OVERLOAD,

          targetRatePerSecond:
            150,

          durationSeconds:
            20,
        },

        {
          stage:
            CHAOS_LOAD_STAGE.RECOVERY,

          targetRatePerSecond:
            5,

          durationSeconds:
            20,
        },
      ],
    },


    CERTIFICATION: {
      key:
        "CERTIFICATION",

      /*
       * Rates here are starting targets, NOT claims about AIRA capacity.
       *
       * The later adaptive breakpoint runner will increase load until
       * measurable degradation or hard failure occurs.
       */
      stages: [
        {
          stage:
            CHAOS_LOAD_STAGE.BASELINE,

          targetRatePerSecond:
            10,

          durationSeconds:
            30,
        },

        {
          stage:
            CHAOS_LOAD_STAGE.NORMAL,

          targetRatePerSecond:
            100,

          durationSeconds:
            60,
        },

        {
          stage:
            CHAOS_LOAD_STAGE.EXPECTED_PEAK,

          targetRatePerSecond:
            250,

          durationSeconds:
            60,
        },

        {
          stage:
            CHAOS_LOAD_STAGE.OVERLOAD,

          targetRatePerSecond:
            500,

          durationSeconds:
            60,
        },

        {
          stage:
            CHAOS_LOAD_STAGE.BREAKPOINT_SEARCH,

          targetRatePerSecond:
            750,

          durationSeconds:
            60,
        },

        {
          stage:
            CHAOS_LOAD_STAGE.RECOVERY,

          targetRatePerSecond:
            10,

          durationSeconds:
            60,
        },
      ],
    },
  });


function getChaosLoadProfile(
  key
) {
  const profile =
    CHAOS_LOAD_PROFILE[
      String(
        key ||
        ""
      ).toUpperCase()
    ];


  if (
    !profile
  ) {
    throw profileError(
      "CHAOS_LOAD_PROFILE_UNKNOWN",
      `Unknown chaos load profile ${key}`
    );
  }


  return deepCloneFreeze(
    profile
  );
}


function validateChaosLoadProfile(
  profile
) {
  if (
    !profile ||

    typeof profile !==
      "object"
  ) {
    throw profileError(
      "CHAOS_LOAD_PROFILE_INVALID",
      "Chaos load profile is required"
    );
  }


  if (
    !Array.isArray(
      profile.stages
    ) ||

    profile.stages.length ===
      0
  ) {
    throw profileError(
      "CHAOS_LOAD_PROFILE_STAGES_REQUIRED",
      "Chaos load profile must contain stages"
    );
  }


  let baselineSeen =
    false;

  let recoverySeen =
    false;


  for (
    const stage
    of profile.stages
  ) {
    if (
      !Object.values(
        CHAOS_LOAD_STAGE
      ).includes(
        stage.stage
      )
    ) {
      throw profileError(
        "CHAOS_LOAD_STAGE_INVALID",
        `Unknown chaos load stage ${stage.stage}`
      );
    }


    if (
      !Number.isFinite(
        stage.targetRatePerSecond
      ) ||

      stage.targetRatePerSecond <=
        0
    ) {
      throw profileError(
        "CHAOS_LOAD_RATE_INVALID",
        "targetRatePerSecond must be greater than zero"
      );
    }


    if (
      !Number.isFinite(
        stage.durationSeconds
      ) ||

      stage.durationSeconds <=
        0
    ) {
      throw profileError(
        "CHAOS_LOAD_DURATION_INVALID",
        "durationSeconds must be greater than zero"
      );
    }


    if (
      stage.stage ===
      CHAOS_LOAD_STAGE.BASELINE
    ) {
      baselineSeen =
        true;
    }


    if (
      stage.stage ===
      CHAOS_LOAD_STAGE.RECOVERY
    ) {
      recoverySeen =
        true;
    }
  }


  if (
    !baselineSeen
  ) {
    throw profileError(
      "CHAOS_LOAD_BASELINE_REQUIRED",
      "Every chaos experiment requires a baseline stage"
    );
  }


  if (
    !recoverySeen
  ) {
    throw profileError(
      "CHAOS_LOAD_RECOVERY_REQUIRED",
      "Every chaos experiment requires a recovery stage"
    );
  }


  return true;
}


function deepCloneFreeze(
  value
) {
  const clone =
    JSON.parse(
      JSON.stringify(
        value
      )
    );


  deepFreeze(
    clone
  );


  return clone;
}


function deepFreeze(
  value
) {
  if (
    !value ||

    typeof value !==
      "object" ||

    Object.isFrozen(
      value
    )
  ) {
    return value;
  }


  Object.freeze(
    value
  );


  Object.values(
    value
  ).forEach(
    deepFreeze
  );


  return value;
}


function profileError(
  code,
  message
) {
  return Object.assign(
    new Error(
      message
    ),

    {
      name:
        "ReliabilityChaosLoadProfileError",

      code,

      executionAuthorized:
        false,
    }
  );
}


module.exports = {
  CHAOS_LOAD_PROFILE_VERSION,

  CHAOS_LOAD_STAGE,

  CHAOS_LOAD_PROFILE,

  getChaosLoadProfile,

  validateChaosLoadProfile,

  profileError,
};