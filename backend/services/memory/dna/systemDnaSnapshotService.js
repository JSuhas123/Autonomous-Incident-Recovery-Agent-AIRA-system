"use strict";


class SystemDnaSnapshotService {

  createError(
    message,
    code,
    status =
      422
  ) {
    const error =
      new Error(
        message
      );

    error.code =
      code;

    error.status =
      status;

    return error;
  }


  compare({
    previous =
      null,

    current,
  }) {
    if (
      !current
    ) {
      throw this.createError(
        "Current System DNA is required",
        "SYSTEM_DNA_CURRENT_REQUIRED"
      );
    }


    if (
      !previous
    ) {
      return {
        changed:
          true,

        reason:
          "INITIAL_SNAPSHOT",

        previousFingerprint:
          null,

        currentFingerprint:
          current.fingerprint,

        sameFingerprint:
          false,
      };
    }


    const sameFingerprint =
      previous.fingerprint ===
      current.fingerprint;


    return {
      changed:
        !sameFingerprint,

      reason:
        sameFingerprint
          ? "UNCHANGED"
          : "DNA_CHANGED",

      previousFingerprint:
        previous.fingerprint ||
        null,

      currentFingerprint:
        current.fingerprint,

      sameFingerprint,
    };
  }


  shouldPersist({
    previous,
    current,
  }) {
    return this
      .compare({
        previous,
        current,
      })
      .changed;
  }
}


const systemDnaSnapshotService =
  new SystemDnaSnapshotService();


module.exports = {
  SystemDnaSnapshotService,

  systemDnaSnapshotService,
};