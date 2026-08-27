"use strict";


function stableJson(
  value
) {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }


  if (
    Array.isArray(
      value
    )
  ) {
    return (
      "[" +
      value
        .map(
          stableJson
        )
        .join(
          ","
        ) +
      "]"
    );
  }


  if (
    typeof value ===
      "object"
  ) {
    const keys =
      Object.keys(
        value
      )
        .sort();


    return (
      "{" +
      keys
        .map(
          (
            key
          ) =>
            JSON.stringify(
              key
            ) +
            ":" +
            stableJson(
              value[
                key
              ]
            )
        )
        .join(
          ","
        ) +
      "}"
    );
  }


  return JSON.stringify(
    value
  );
}


function clean(
  value
) {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }


  return String(
    value
  )
    .replace(
      /\s+/g,
      " "
    )
    .trim();
}


function buildMemoryRetrievalText(
  memory
) {
  const parts = [
    `memory_type: ${clean(
      memory.memoryType
    )}`,

    `scope_type: ${clean(
      memory.scopeType
    )}`,

    memory.title
      ? `title: ${clean(memory.title)}`
      : "",

    `summary: ${clean(
      memory.summary
    )}`,

    memory.serviceId
      ? `service: ${clean(memory.serviceId)}`
      : "",

    memory.content
      ? `content: ${stableJson(memory.content)}`
      : "",
  ]
    .filter(
      Boolean
    );


  return parts
    .join(
      "\n"
    );
}


module.exports = {
  stableJson,

  buildMemoryRetrievalText,
};