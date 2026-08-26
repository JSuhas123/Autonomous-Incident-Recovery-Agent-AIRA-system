"use strict";

const redis =
  require(
    "redis"
  );


const DEFAULT_ENTITLEMENT_TTL_SECONDS =
  60;


const DEFAULT_QUOTA_TTL_SECONDS =
  300;


class BillingRuntimeCacheService {

  constructor(
    options = {}
  ) {
    this.client =
      options.client ||
      null;

    this.connected =
      Boolean(
        options.connected &&
        this.client
      );

    this.connecting =
      null;

    this.entitlementTtlSeconds =
      Number(
        options
          .entitlementTtlSeconds ||
        process.env
          .BILLING_ENTITLEMENT_CACHE_TTL_SECONDS ||
        DEFAULT_ENTITLEMENT_TTL_SECONDS
      );

    this.quotaTtlSeconds =
      Number(
        options
          .quotaTtlSeconds ||
        process.env
          .BILLING_QUOTA_CACHE_TTL_SECONDS ||
        DEFAULT_QUOTA_TTL_SECONDS
      );

    this.lastError =
      null;
  }


  async ensureConnected() {
    if (
      this.connected &&
      this.client
    ) {
      return true;
    }


    if (
      this.connecting
    ) {
      return this.connecting;
    }


    this.connecting =
      this._connect();


    try {
      return await this
        .connecting;
    } finally {
      this.connecting =
        null;
    }
  }


  async _connect() {
    try {
      if (
        !this.client
      ) {
        this.client =
          redis.createClient({
            url:
              process.env
                .REDIS_URL ||
              "redis://127.0.0.1:6379",

            socket: {
              reconnectStrategy:
                false,
            },
          });


        this.client.on(
          "error",
          (
            error
          ) => {
            this.connected =
              false;

            this.lastError =
              error
                ?.message ||
              "Redis error";
          }
        );


        this.client.on(
          "ready",
          () => {
            this.connected =
              true;

            this.lastError =
              null;
          }
        );


        this.client.on(
          "end",
          () => {
            this.connected =
              false;
          }
        );
      }


      if (
        !this.client
          .isOpen
      ) {
        await this.client
          .connect();
      }


      this.connected =
        true;

      this.lastError =
        null;

      return true;

    } catch (
      error
    ) {
      this.connected =
        false;

      this.lastError =
        error.message;

      return false;
    }
  }


  entitlementKey(
    organizationId
  ) {
    return (
      "aira:billing:entitlements:v1:" +
      String(
        organizationId
      )
    );
  }


  quotaKey({
    organizationId,
    meterCode,
    periodStart,
  }) {
    return [
      "aira",
      "billing",
      "quota",
      "v1",

      String(
        organizationId
      ),

      String(
        meterCode
      ),

      new Date(
        periodStart
      )
        .toISOString(),
    ].join(
      ":"
    );
  }


  async getEntitlements(
    organizationId
  ) {
    if (
      !await this
        .ensureConnected()
    ) {
      return null;
    }


    try {
      const raw =
        await this.client
          .get(
            this
              .entitlementKey(
                organizationId
              )
          );


      return raw
        ? JSON.parse(
            raw
          )
        : null;

    } catch (
      error
    ) {
      this.lastError =
        error.message;

      return null;
    }
  }


  async setEntitlements(
    organizationId,
    snapshot
  ) {
    if (
      !await this
        .ensureConnected()
    ) {
      return false;
    }


    try {
      await this.client
        .set(
          this
            .entitlementKey(
              organizationId
            ),

          JSON.stringify(
            snapshot
          ),

          {
            EX:
              this
                .entitlementTtlSeconds,
          }
        );


      return true;

    } catch (
      error
    ) {
      this.lastError =
        error.message;

      return false;
    }
  }


  async invalidateEntitlements(
    organizationId
  ) {
    if (
      !await this
        .ensureConnected()
    ) {
      return false;
    }


    try {
      await this.client
        .del(
          this
            .entitlementKey(
              organizationId
            )
        );


      return true;

    } catch (
      error
    ) {
      this.lastError =
        error.message;

      return false;
    }
  }


  async getQuotaUsage(
    options
  ) {
    if (
      !await this
        .ensureConnected()
    ) {
      return null;
    }


    try {
      const raw =
        await this.client
          .get(
            this
              .quotaKey(
                options
              )
          );


      if (
        raw ===
          null
      ) {
        return null;
      }


      const value =
        Number(
          raw
        );


      return Number.isFinite(
        value
      )
        ? value
        : null;

    } catch (
      error
    ) {
      this.lastError =
        error.message;

      return null;
    }
  }


  async setQuotaUsage(
    options,
    quantity
  ) {
    if (
      !await this
        .ensureConnected()
    ) {
      return false;
    }


    try {
      await this.client
        .set(
          this
            .quotaKey(
              options
            ),

          String(
            quantity
          ),

          {
            EX:
              this
                .quotaTtlSeconds,
          }
        );


      return true;

    } catch (
      error
    ) {
      this.lastError =
        error.message;

      return false;
    }
  }


  async incrementQuotaUsage(
    options,
    quantity
  ) {
    if (
      !await this
        .ensureConnected()
    ) {
      return false;
    }


    try {
      const key =
        this
          .quotaKey(
            options
          );


      const script = `
        local current =
          tonumber(
            redis.call(
              "GET",
              KEYS[1]
            ) or "0"
          )

        local increment =
          tonumber(
            ARGV[1]
          )

        local ttl =
          tonumber(
            ARGV[2]
          )

        local nextValue =
          current +
          increment

        redis.call(
          "SET",
          KEYS[1],
          tostring(
            nextValue
          ),
          "EX",
          ttl
        )

        return tostring(
          nextValue
        )
      `;


      await this.client
        .eval(
          script,
          {
            keys: [
              key,
            ],

            arguments: [
              String(
                quantity
              ),

              String(
                this
                  .quotaTtlSeconds
              ),
            ],
          }
        );


      return true;

    } catch (
      error
    ) {
      this.lastError =
        error.message;

      return false;
    }
  }


  async close() {
    if (
      this.client &&
      this.client
        .isOpen
    ) {
      await this.client
        .quit();
    }


    this.connected =
      false;
  }
}


const billingRuntimeCacheService =
  new BillingRuntimeCacheService();


module.exports = {
  BillingRuntimeCacheService,

  billingRuntimeCacheService,
};