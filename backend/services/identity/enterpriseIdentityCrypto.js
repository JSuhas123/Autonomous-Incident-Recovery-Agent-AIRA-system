"use strict";

const crypto =
  require(
    "crypto"
  );


function getMasterKey() {
  const raw =
    process.env
      .ENTERPRISE_IDENTITY_SECRET_KEY ||
    process.env
      .INTEGRATION_SECRET_KEY;

  if (
    !raw
  ) {
    const error =
      new Error(
        "Enterprise identity encryption key is not configured"
      );

    error.code =
      "ENTERPRISE_IDENTITY_SECRET_KEY_MISSING";

    error.status =
      500;

    throw error;
  }

  return crypto
    .createHash(
      "sha256"
    )
    .update(
      raw,
      "utf8"
    )
    .digest();
}


function encryptSecret(
  plaintext
) {
  if (
    plaintext == null ||
    plaintext ===
      ""
  ) {
    return null;
  }

  const iv =
    crypto.randomBytes(
      12
    );

  const cipher =
    crypto.createCipheriv(
      "aes-256-gcm",
      getMasterKey(),
      iv
    );

  const encrypted =
    Buffer.concat([
      cipher.update(
        String(
          plaintext
        ),
        "utf8"
      ),

      cipher.final(),
    ]);

  const tag =
    cipher.getAuthTag();

  return [
    "v1",
    iv.toString(
      "base64url"
    ),
    tag.toString(
      "base64url"
    ),
    encrypted.toString(
      "base64url"
    ),
  ].join(
    "."
  );
}


function decryptSecret(
  value
) {
  if (
    !value
  ) {
    return null;
  }

  const [
    version,
    ivEncoded,
    tagEncoded,
    ciphertextEncoded,
  ] =
    String(
      value
    ).split(
      "."
    );

  if (
    version !==
      "v1" ||
    !ivEncoded ||
    !tagEncoded ||
    !ciphertextEncoded
  ) {
    throw new Error(
      "Invalid encrypted enterprise identity secret"
    );
  }

  const decipher =
    crypto.createDecipheriv(
      "aes-256-gcm",
      getMasterKey(),
      Buffer.from(
        ivEncoded,
        "base64url"
      )
    );

  decipher.setAuthTag(
    Buffer.from(
      tagEncoded,
      "base64url"
    )
  );

  return Buffer.concat([
    decipher.update(
      Buffer.from(
        ciphertextEncoded,
        "base64url"
      )
    ),

    decipher.final(),
  ]).toString(
    "utf8"
  );
}


module.exports = {
  encryptSecret,
  decryptSecret,
};