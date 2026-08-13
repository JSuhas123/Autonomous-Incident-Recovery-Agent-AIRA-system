"use strict";

const crypto =
  require("node:crypto");

const ALGORITHM =
  "aes-256-gcm";

const IV_BYTES =
  12;

const TAG_BYTES =
  16;

const SECRET_VERSION =
  "v1";

const PREFIX =
  `aira-secret:${SECRET_VERSION}:`;

function getMasterKey() {
  const raw =
    process.env
      .INTEGRATION_SECRET_KEY;

  if (!raw) {
    if (
      process.env.NODE_ENV ===
      "test"
    ) {
      return crypto
        .createHash(
          "sha256"
        )
        .update(
          "aira-integration-test-key"
        )
        .digest();
    }

    throw Object.assign(
      new Error(
        "INTEGRATION_SECRET_KEY is required"
      ),
      {
        code:
          "INTEGRATION_SECRET_KEY_MISSING",
      }
    );
  }

  return crypto
    .createHash(
      "sha256"
    )
    .update(
      String(raw)
    )
    .digest();
}

function encryptSecret(
  plaintext
) {
  if (
    plaintext === null ||
    plaintext === undefined
  ) {
    return null;
  }

  const value =
    typeof plaintext ===
    "string"
      ? plaintext
      : JSON.stringify(
          plaintext
        );

  if (!value.length) {
    return null;
  }

  const key =
    getMasterKey();

  const iv =
    crypto.randomBytes(
      IV_BYTES
    );

  const cipher =
    crypto.createCipheriv(
      ALGORITHM,
      key,
      iv
    );

  cipher.setAAD(
    Buffer.from(
      PREFIX,
      "utf8"
    )
  );

  const ciphertext =
    Buffer.concat([
      cipher.update(
        value,
        "utf8"
      ),

      cipher.final(),
    ]);

  const authTag =
    cipher.getAuthTag();

  const payload = {
    version:
      SECRET_VERSION,

    algorithm:
      ALGORITHM,

    iv:
      iv.toString(
        "base64"
      ),

    authTag:
      authTag.toString(
        "base64"
      ),

    ciphertext:
      ciphertext.toString(
        "base64"
      ),
  };

  return (
    PREFIX +
    Buffer.from(
      JSON.stringify(
        payload
      ),
      "utf8"
    ).toString(
      "base64"
    )
  );
}

function decryptSecret(
  storedValue
) {
  if (!storedValue) {
    return null;
  }

  const value =
    String(
      storedValue
    );

  if (
    value.startsWith(
      PREFIX
    )
  ) {
    return decryptCurrentFormat(
      value
    );
  }

  return decryptLegacyFormat(
    value
  );
}

function decryptCurrentFormat(
  value
) {
  try {
    const payload =
      JSON.parse(
        Buffer.from(
          value.slice(
            PREFIX.length
          ),
          "base64"
        ).toString(
          "utf8"
        )
      );

    if (
      payload.version !==
        SECRET_VERSION ||
      payload.algorithm !==
        ALGORITHM
    ) {
      throw new Error(
        "Unsupported secret format"
      );
    }

    const iv =
      Buffer.from(
        payload.iv,
        "base64"
      );

    const authTag =
      Buffer.from(
        payload.authTag,
        "base64"
      );

    const ciphertext =
      Buffer.from(
        payload.ciphertext,
        "base64"
      );

    if (
      iv.length !==
        IV_BYTES ||
      authTag.length !==
        TAG_BYTES
    ) {
      throw new Error(
        "Invalid encryption parameters"
      );
    }

    const decipher =
      crypto.createDecipheriv(
        ALGORITHM,
        getMasterKey(),
        iv
      );

    decipher.setAAD(
      Buffer.from(
        PREFIX,
        "utf8"
      )
    );

    decipher.setAuthTag(
      authTag
    );

    return Buffer.concat([
      decipher.update(
        ciphertext
      ),

      decipher.final(),
    ]).toString(
      "utf8"
    );
  } catch (error) {
    throw Object.assign(
      new Error(
        "Unable to decrypt integration secret"
      ),
      {
        code:
          "INTEGRATION_SECRET_DECRYPTION_FAILED",

        cause:
          error,
      }
    );
  }
}

function decryptLegacyFormat(
  blob
) {
  try {
    const buffer =
      Buffer.from(
        blob,
        "base64"
      );

    if (
      buffer.length <=
      IV_BYTES +
        TAG_BYTES
    ) {
      throw new Error(
        "Invalid legacy secret"
      );
    }

    const iv =
      buffer.subarray(
        0,
        IV_BYTES
      );

    const authTag =
      buffer.subarray(
        IV_BYTES,
        IV_BYTES +
          TAG_BYTES
      );

    const ciphertext =
      buffer.subarray(
        IV_BYTES +
          TAG_BYTES
      );

    const decipher =
      crypto.createDecipheriv(
        ALGORITHM,
        getMasterKey(),
        iv
      );

    decipher.setAuthTag(
      authTag
    );

    return Buffer.concat([
      decipher.update(
        ciphertext
      ),

      decipher.final(),
    ]).toString(
      "utf8"
    );
  } catch (error) {
    throw Object.assign(
      new Error(
        "Unable to decrypt integration secret"
      ),
      {
        code:
          "INTEGRATION_SECRET_DECRYPTION_FAILED",

        cause:
          error,
      }
    );
  }
}

function maskSecret(
  plaintext
) {
  if (!plaintext) {
    return "****";
  }

  const value =
    String(
      plaintext
    );

  if (
    value.length <=
    4
  ) {
    return "****";
  }

  return (
    value.slice(
      0,
      4
    ) +
    "*".repeat(
      Math.min(
        value.length - 4,
        20
      )
    )
  );
}

function isEncryptedSecret(
  value
) {
  return Boolean(
    value &&
    String(
      value
    ).startsWith(
      PREFIX
    )
  );
}

class SecretStorage {
  async storeSecret(
    plaintext
  ) {
    return encryptSecret(
      plaintext
    );
  }

  async getSecret(
    connection
  ) {
    if (!connection) {
      throw Object.assign(
        new Error(
          "Integration connection is required"
        ),
        {
          code:
            "INTEGRATION_CONNECTION_REQUIRED",
        }
      );
    }

    if (
      !connection
        .encryptedSecretReference
    ) {
      return null;
    }

    return decryptSecret(
      connection
        .encryptedSecretReference
    );
  }

  async rotateSecret(
    connection,
    plaintext
  ) {
    if (!connection) {
      throw Object.assign(
        new Error(
          "Integration connection is required"
        ),
        {
          code:
            "INTEGRATION_CONNECTION_REQUIRED",
        }
      );
    }

    if (
      !plaintext ||
      typeof plaintext !==
        "string"
    ) {
      throw Object.assign(
        new Error(
          "Integration secret is required"
        ),
        {
          code:
            "INTEGRATION_SECRET_REQUIRED",
        }
      );
    }

    connection
      .encryptedSecretReference =
      encryptSecret(
        plaintext
      );

    connection.secretVersion =
      SECRET_VERSION;

    connection.secretUpdatedAt =
      new Date();

    return connection;
  }

  async clearSecret(
    connection
  ) {
    if (!connection) {
      return;
    }

    connection
      .encryptedSecretReference =
      null;

    connection.secretVersion =
      null;

    connection.secretUpdatedAt =
      null;
  }
}

let secretStorageInstance =
  null;

function getSecretStorage() {
  if (
    !secretStorageInstance
  ) {
    secretStorageInstance =
      new SecretStorage();
  }

  return secretStorageInstance;
}

module.exports = {
  encryptSecret,
  decryptSecret,
  maskSecret,
  isEncryptedSecret,

  SecretStorage,
  getSecretStorage,

  SECRET_VERSION,
};