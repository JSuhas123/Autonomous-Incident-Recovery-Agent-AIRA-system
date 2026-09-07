"use strict";


const fs =
  require(
    "fs"
  );


const path =
  require(
    "path"
  );


const serverPath =
  path.resolve(
    __dirname,
    "..",
    "server.js"
  );


let source =
  fs.readFileSync(
    serverPath,
    "utf8"
  );


const requireAnchor =
`const notificationRoutingRoutes =
  require(
    "./routes/notificationRoutingRoutes"
  );`;


const requireReplacement =
`const notificationRoutingRoutes =
  require(
    "./routes/notificationRoutingRoutes"
  );


const productNotificationRoutes =
  require(
    "./routes/productNotificationRoutes"
  );`;


if (
  !source.includes(
    "./routes/productNotificationRoutes"
  )
) {
  if (
    !source.includes(
      requireAnchor
    )
  ) {
    throw new Error(
      "Unable to find notification route import anchor"
    );
  }


  source =
    source.replace(
      requireAnchor,
      requireReplacement
    );
}


const mountAnchor =
`app.use(
  "/api/v1/notification-routing",

  browserOrganizationContext,

  notificationRoutingRoutes
);`;


const mountReplacement =
`app.use(
  "/api/v1/notification-routing",

  browserOrganizationContext,

  notificationRoutingRoutes
);


app.use(
  "/api/v1/product/notifications",

  browserEnvironmentContext,

  productNotificationRoutes
);`;


if (
  !source.includes(
    '"/api/v1/product/notifications"'
  )
) {
  if (
    !source.includes(
      mountAnchor
    )
  ) {
    throw new Error(
      "Unable to find notification route mount anchor"
    );
  }


  source =
    source.replace(
      mountAnchor,
      mountReplacement
    );
}


fs.writeFileSync(
  serverPath,
  source,
  "utf8"
);


console.log(
  "PASS — Phase 25.9 product notification routes wired"
);