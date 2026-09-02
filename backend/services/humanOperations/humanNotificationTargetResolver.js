"use strict";


const PROVIDER_BY_CHANNEL =
  Object.freeze({
    SLACK:
      "slack",

    PAGERDUTY:
      "pagerduty",

    TEAMS:
      "msteams",

    MSTEAMS:
      "msteams",

    MICROSOFT_TEAMS:
      "msteams",

    WEBHOOK:
      "webhook",
  });


function normalizeProvider(
  value
) {
  if (
    !value
  ) {
    return null;
  }


  const normalized =
    String(
      value
    )
      .trim()
      .toLowerCase();


  switch (
    normalized
  ) {
    case "slack":
      return "slack";


    case "pagerduty":
    case "pager-duty":
      return "pagerduty";


    case "teams":
    case "msteams":
    case "microsoft-teams":
    case "microsoft_teams":
      return "msteams";


    case "webhook":
      return "webhook";


    default:
      return normalized;
  }
}


function providerFromChannels(
  channels
) {
  for (
    const channel
    of (
      Array.isArray(
        channels
      )
        ? channels
        : []
    )
  ) {
    const provider =
      PROVIDER_BY_CHANNEL[
        String(
          channel
        )
          .trim()
          .toUpperCase()
      ];


    if (
      provider
    ) {
      return provider;
    }
  }


  return null;
}


function parseIntegrationRef(
  integrationRef
) {
  if (
    !integrationRef
  ) {
    return {
      provider:
        null,

      integrationId:
        null,
    };
  }


  const value =
    String(
      integrationRef
    ).trim();


  const separator =
    value.indexOf(
      ":"
    );


  if (
    separator >
    0
  ) {
    const provider =
      normalizeProvider(
        value.slice(
          0,
          separator
        )
      );


    const integrationId =
      value
        .slice(
          separator +
          1
        )
        .trim();


    if (
      provider &&
      integrationId
    ) {
      return {
        provider,

        integrationId,
      };
    }
  }


  return {
    provider:
      null,

    integrationId:
      value,
  };
}


function resolveTarget(
  target =
    {}
) {
  const parsed =
    parseIntegrationRef(
      target.integrationRef
    );


  const provider =
    normalizeProvider(
      target.provider ||
      target.providerKey ||
      target.integrationProvider
    ) ||

    parsed.provider ||

    providerFromChannels(
      target.channels
    );


  const integrationId =
    target.integrationId ||
    parsed.integrationId ||
    null;


  return {
    targetType:
      target.targetType ||
      null,

    provider,

    integrationId,

    directIntegration:
      Boolean(
        provider &&
        integrationId
      ),

    routeThroughRules:
      !(
        provider &&
        integrationId
      ),

    originalTarget:
      target,

    executionAuthorized:
      false,
  };
}


module.exports = {
  PROVIDER_BY_CHANNEL,

  normalizeProvider,

  providerFromChannels,

  parseIntegrationRef,

  resolveTarget,
};