"use strict";

/**
 * ============================================================================
 * AIRA PHASE 25.1A
 * ORGANIZATION PROFILE CONTRACT CERTIFICATION
 * ============================================================================
 */

const {
  COMPANY_SIZES,
  TECHNICAL_MATURITY_LEVELS,

  normalizeProfileInput,
  calculateProfileStatus,
} =
  require(
    "../../services/product/organizationProfileService"
  );


describe(
  "AIRA Phase 25.1A — Organization Profile",
  () => {
    test(
      "defines canonical company size classifications",
      () => {
        expect(
          COMPANY_SIZES
        ).toEqual([
          "solo",
          "micro",
          "small",
          "medium",
          "large",
          "enterprise",
        ]);
      }
    );


    test(
      "defines canonical technical maturity classifications",
      () => {
        expect(
          TECHNICAL_MATURITY_LEVELS
        ).toEqual([
          "emerging",
          "developing",
          "established",
          "advanced",
        ]);
      }
    );


    test(
      "normalizes a complete enterprise profile",
      () => {
        const result =
          normalizeProfileInput({
            legalName:
              "AIRA Systems Private Limited",

            websiteUrl:
              "https://aira.example.com",

            industry:
              "Cloud Software",

            companySize:
              "medium",

            employeeCount:
              250,

            headquartersCountryCode:
              "in",

            operatingRegion:
              "Asia Pacific",

            dataRegion:
              "India",

            primaryDomain:
              "https://www.aira.example.com/",

            technicalMaturity:
              "advanced",

            metadata: {
              source:
                "onboarding",
            },
          });

        expect(
          result.legalName
        ).toBe(
          "AIRA Systems Private Limited"
        );

        expect(
          result.companySize
        ).toBe(
          "medium"
        );

        expect(
          result.employeeCount
        ).toBe(
          250
        );

        expect(
          result
            .headquartersCountryCode
        ).toBe(
          "IN"
        );

        expect(
          result.primaryDomain
        ).toBe(
          "aira.example.com"
        );

        expect(
          result.technicalMaturity
        ).toBe(
          "advanced"
        );
      }
    );


    test(
      "rejects invalid company size",
      () => {
        expect(
          () =>
            normalizeProfileInput({
              companySize:
                "massive",
            })
        ).toThrow(
          "Invalid company size"
        );
      }
    );


    test(
      "rejects invalid employee count",
      () => {
        expect(
          () =>
            normalizeProfileInput({
              employeeCount:
                -100,
            })
        ).toThrow(
          "Employee count must be a positive integer"
        );
      }
    );


    test(
      "rejects malformed country code",
      () => {
        expect(
          () =>
            normalizeProfileInput({
              headquartersCountryCode:
                "IND",
            })
        ).toThrow();
      }
    );


    test(
      "rejects malformed company domain",
      () => {
        expect(
          () =>
            normalizeProfileInput({
              primaryDomain:
                "not a domain",
            })
        ).toThrow(
          "Primary company domain is invalid"
        );
      }
    );


    test(
      "accepts HTTP and HTTPS company website",
      () => {
        expect(
          normalizeProfileInput({
            websiteUrl:
              "https://example.com",
          }).websiteUrl
        ).toMatch(
          /^https:\/\//
        );

        expect(
          normalizeProfileInput({
            websiteUrl:
              "http://example.com",
          }).websiteUrl
        ).toMatch(
          /^http:\/\//
        );
      }
    );


    test(
      "rejects dangerous website protocols",
      () => {
        expect(
          () =>
            normalizeProfileInput({
              websiteUrl:
                "javascript:alert(1)",
            })
        ).toThrow(
          "Website URL must use HTTP or HTTPS"
        );
      }
    );


    test(
      "marks incomplete profile correctly",
      () => {
        expect(
          calculateProfileStatus({
            legal_name:
              "Test Ltd",

            industry:
              null,

            company_size:
              "small",

            headquarters_country_code:
              "IN",
          })
        ).toBe(
          "incomplete"
        );
      }
    );


    test(
      "marks complete profile correctly",
      () => {
        expect(
          calculateProfileStatus({
            legal_name:
              "Test Ltd",

            industry:
              "Software",

            company_size:
              "small",

            headquarters_country_code:
              "IN",
          })
        ).toBe(
          "complete"
        );
      }
    );


    test(
      "does not accept metadata arrays",
      () => {
        expect(
          () =>
            normalizeProfileInput({
              metadata: [],
            })
        ).toThrow(
          "Organization profile metadata must be an object"
        );
      }
    );
  }
);