"use strict";


const crypto =
  require(
    "node:crypto"
  );


const {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
} =
  require(
    "@aws-sdk/client-s3"
  );


const {
  getRealityObjectStorageConfig,
} =
  require(
    "../../config/realityObjectStorage"
  );


function sha256(
  buffer
) {
  return crypto
    .createHash(
      "sha256"
    )
    .update(
      buffer
    )
    .digest(
      "hex"
    );
}


function asBuffer(
  value
) {
  if (
    Buffer.isBuffer(
      value
    )
  ) {
    return value;
  }


  if (
    value instanceof
      Uint8Array
  ) {
    return Buffer.from(
      value
    );
  }


  if (
    typeof value ===
      "string"
  ) {
    return Buffer.from(
      value,
      "utf8"
    );
  }


  throw objectStoreError(
    "REALITY_OBJECT_BODY_INVALID",
    "Reality object body must be a Buffer, Uint8Array, or string",
    422
  );
}


function segment(
  value
) {
  return encodeURIComponent(
    String(
      value
    )
  );
}


function buildStorageKey({
  organizationId,
  environmentId,
  contentHash,
}) {
  return (
    `reality/` +
    `${segment(organizationId)}/` +
    `${segment(environmentId)}/` +
    `sha256/` +
    `${contentHash.slice(0, 2)}/` +
    `${contentHash}`
  );
}


function isNotFound(
  error
) {
  return (
    error?.name ===
      "NotFound" ||

    error?.name ===
      "NoSuchKey" ||

    error
      ?.$metadata
      ?.httpStatusCode ===
      404
  );
}


function objectStoreError(
  code,
  message,
  status =
    500,
  metadata =
    {}
) {
  return Object.assign(
    new Error(
      message
    ),
    {
      code,

      status,

      executionAuthorized:
        false,

      ...metadata,
    }
  );
}


class S3RealityObjectStore {
  constructor(
    options =
      {}
  ) {
    this.config =
      options.config ||

      getRealityObjectStorageConfig(
        options.env ||
        process.env
      );


    this.client =
      options.client ||

      new S3Client({
        region:
          this.config.region,


        endpoint:
          this.config.endpoint ||
          undefined,


        forcePathStyle:
          this.config
            .forcePathStyle,


        credentials:
          this.config
              .accessKeyId &&
          this.config
              .secretAccessKey
            ? {
                accessKeyId:
                  this.config
                    .accessKeyId,

                secretAccessKey:
                  this.config
                    .secretAccessKey,
              }
            : undefined,
      });


    this.bucketReady =
      false;
  }


  async ensureBucket() {
    if (
      this.bucketReady
    ) {
      return true;
    }


    try {
      await this.client.send(
        new HeadBucketCommand({
          Bucket:
            this.config.bucket,
        })
      );
    } catch (
      error
    ) {
      if (
        !isNotFound(
          error
        ) ||

        !this.config
          .autoCreateBucket
      ) {
        throw objectStoreError(
          "REALITY_OBJECT_STORAGE_BUCKET_UNAVAILABLE",
          "Reality object storage bucket is unavailable",
          503,
          {
            cause:
              error,
          }
        );
      }


      await this.client.send(
        new CreateBucketCommand({
          Bucket:
            this.config.bucket,
        })
      );
    }


    this.bucketReady =
      true;


    return true;
  }


  async putImmutable({
    organizationId,
    environmentId,
    body,
    contentType =
      "application/octet-stream",
    metadata =
      {},
  }) {
    await this.ensureBucket();


    const buffer =
      asBuffer(
        body
      );


    const contentHash =
      sha256(
        buffer
      );


    const key =
      buildStorageKey({
        organizationId,

        environmentId,

        contentHash,
      });


    try {
      const existing =
        await this.head({
          key,
        });


      /*
       * Content-addressed idempotency.
       *
       * If these exact bytes already exist for this tenant/environment,
       * no second object is written.
       */
      if (
        existing
      ) {
        if (
          existing.contentLength !==
            buffer.length ||

          (
            existing.sha256 &&
            existing.sha256 !==
              contentHash
          )
        ) {
          throw objectStoreError(
            "REALITY_OBJECT_HASH_COLLISION_OR_CORRUPTION",
            "Existing reality object does not match its content-addressed key",
            409
          );
        }


        return {
          created:
            false,

          bucket:
            this.config.bucket,

          key,

          contentHash,

          byteSize:
            buffer.length,

          etag:
            existing.etag ||
            null,

          contentType:
            existing.contentType ||
            contentType,
        };
      }


      const result =
        await this.client.send(
          new PutObjectCommand({
            Bucket:
              this.config.bucket,


            Key:
              key,


            Body:
              buffer,


            ContentLength:
              buffer.length,


            ContentType:
              contentType,


            Metadata: {
              ...metadata,

              sha256:
                contentHash,

              "aira-reality":
                "true",
            },
          })
        );


      return {
        created:
          true,

        bucket:
          this.config.bucket,

        key,

        contentHash,

        byteSize:
          buffer.length,

        etag:
          result.ETag ||
          null,

        contentType,
      };
    } catch (
      error
    ) {
      if (
        error?.code
      ) {
        throw error;
      }


      throw objectStoreError(
        "REALITY_OBJECT_PUT_FAILED",
        "Failed to store reality evidence object",
        503,
        {
          cause:
            error,
        }
      );
    }
  }


  async head({
    key,
  }) {
    try {
      const result =
        await this.client.send(
          new HeadObjectCommand({
            Bucket:
              this.config.bucket,

            Key:
              key,
          })
        );


      return {
        contentLength:
          Number(
            result.ContentLength ||
            0
          ),

        contentType:
          result.ContentType ||
          null,

        etag:
          result.ETag ||
          null,

        sha256:
          result
            .Metadata
            ?.sha256 ||
          null,
      };
    } catch (
      error
    ) {
      if (
        isNotFound(
          error
        )
      ) {
        return null;
      }


      throw error;
    }
  }


  async getVerified({
    key,
    expectedHash,
  }) {
    await this.ensureBucket();


    let result;


    try {
      result =
        await this.client.send(
          new GetObjectCommand({
            Bucket:
              this.config.bucket,

            Key:
              key,
          })
        );
    } catch (
      error
    ) {
      if (
        isNotFound(
          error
        )
      ) {
        throw objectStoreError(
          "REALITY_OBJECT_NOT_FOUND",
          "Reality evidence object was not found",
          404
        );
      }


      throw objectStoreError(
        "REALITY_OBJECT_GET_FAILED",
        "Failed to read reality evidence object",
        503,
        {
          cause:
            error,
        }
      );
    }


    const bytes =
      await result.Body
        .transformToByteArray();


    const body =
      Buffer.from(
        bytes
      );


    const actualHash =
      sha256(
        body
      );


    if (
      expectedHash &&

      actualHash !==
        String(
          expectedHash
        )
          .toLowerCase()
    ) {
      throw objectStoreError(
        "REALITY_OBJECT_HASH_MISMATCH",
        "Reality evidence object failed SHA-256 verification",
        409,
        {
          expectedHash:
            String(
              expectedHash
            )
              .toLowerCase(),

          actualHash,
        }
      );
    }


    return {
      body,

      contentHash:
        actualHash,

      byteSize:
        body.length,

      contentType:
        result.ContentType ||
        null,

      etag:
        result.ETag ||
        null,
    };
  }
}


module.exports = {
  S3RealityObjectStore,

  sha256,

  buildStorageKey,

  asBuffer,
};