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


const requireMarker =
`const productContextRoutes =
  createProductContextRouter();`;


const requireBlock =
`const productReadModelRoutes =
  require(
    "./routes/productReadModelRoutes"
  );

const productContextRoutes =
  createProductContextRouter();`;


if (
  !source.includes(
    'require(\n    "./routes/productReadModelRoutes"\n  )'
  )
) {
  if (
    !source.includes(
      requireMarker
    )
  ) {
    throw new Error(
      "Unable to locate Phase-25 product router construction marker in server.js"
    );
  }


  source =
    source.replace(
      requireMarker,
      requireBlock
    );
}


const mountMarker =
`app.use(
  "/api/v1/product/organization-profile",

  browserEnvironmentContext,

  productOrganizationProfileRoutes
);`;


const mountBlock =
`app.use(
  "/api/v1/product/organization-profile",

  browserEnvironmentContext,

  productOrganizationProfileRoutes
);

app.use(
  "/api/v1/product",

  browserEnvironmentContext,

  productReadModelRoutes
);`;


if (
  !source.includes(
    '"/api/v1/product",\n\n  browserEnvironmentContext,\n\n  productReadModelRoutes'
  )
) {
  if (
    !source.includes(
      mountMarker
    )
  ) {
    throw new Error(
      "Unable to locate product organization-profile mount in server.js"
    );
  }


  source =
    source.replace(
      mountMarker,
      mountBlock
    );
}


fs.writeFileSync(
  serverPath,
  source,
  "utf8"
);


console.log(
  "PASS — Phase 25 Product BFF routes wired into server.js"
);