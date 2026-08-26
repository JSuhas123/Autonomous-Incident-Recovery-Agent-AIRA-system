"use strict";

const express =
  require(
    "express"
  );

const {
  discoverEnterpriseLogin,
} =
  require(
    "../services/identity/enterpriseIdentityService"
  );


const router =
  express.Router();


router.get(
  "/discover",

  async (
    req,
    res,
    next
  ) => {
    try {
      res.json(
        await discoverEnterpriseLogin(
          req.query
            ?.email
        )
      );
    } catch (
      error
    ) {
      next(
        error
      );
    }
  }
);


module.exports =
  router;