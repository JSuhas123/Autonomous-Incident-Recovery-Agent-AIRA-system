import {
  authApi,
} from '@/api/client'

import {
  authLifecycleApi,
} from '@/api/authLifecycleApi'

import {
  productOrganizationProfileApi,
} from '@/api/productOrganizationProfileApi'

import {
  AuthProductShell,
} from '@/components/auth/AuthProductShell'

import {
  Button,
} from '@/components/ui/button'

import {
  Input,
} from '@/components/ui/input'

import {
  Label,
} from '@/components/ui/label'

import {
  useAuthStore,
} from '@/store/authStore'

import type {
  SafeMembership,
  SafeOrganization,
  SafeUser,
} from '@/types'

import {
  Building2,
  Check,
  Eye,
  EyeOff,
  Globe2,
  LoaderCircle,
  LockKeyhole,
  Mail,
  Server,
  ShieldCheck,
  UserRound,
} from 'lucide-react'

import {
  useState,
} from 'react'

import {
  Link,
  Navigate,
  useNavigate,
} from 'react-router-dom'


type CompanySize =
  | 'solo'
  | 'micro'
  | 'small'
  | 'medium'
  | 'large'
  | 'enterprise'


type TechnicalMaturity =
  | 'emerging'
  | 'developing'
  | 'established'
  | 'advanced'


interface FormState {
  fullName:
    string

  email:
    string

  password:
    string

  organizationName:
    string

  websiteUrl:
    string

  primaryDomain:
    string

  industry:
    string

  companySize:
    CompanySize

  employeeCount:
    string

  headquartersCountryCode:
    string

  technicalMaturity:
    TechnicalMaturity

  terms:
    boolean
}


type ErrorState =
  Partial<
    Record<
      keyof FormState,
      string
    >
  >


const INITIAL_FORM:
  FormState = {
    fullName:
      '',

    email:
      '',

    password:
      '',

    organizationName:
      '',

    websiteUrl:
      '',

    primaryDomain:
      '',

    industry:
      '',

    companySize:
      'small',

    employeeCount:
      '',

    headquartersCountryCode:
      '',

    technicalMaturity:
      'developing',

    terms:
      false,
  }


const PASSWORD_REQUIREMENTS = [
  'At least 12 characters',
  'Use a unique organization password',
  'Stored using AIRA Argon2id password security',
]


function normalizeDomain(
  value:
    string,
) {
  return value
    .trim()
    .toLowerCase()
    .replace(
      /^https?:\/\//,
      '',
    )
    .replace(
      /^www\./,
      '',
    )
    .split(
      '/',
    )[0]
    .split(
      ':',
    )[0]
}


export default function SignupPage() {
  const status =
    useAuthStore(
      (
        state,
      ) =>
        state.status,
    )


  const setAuthenticated =
    useAuthStore(
      (
        state,
      ) =>
        state
          .setAuthenticated,
    )


  const navigate =
    useNavigate()


  const [
    form,
    setForm,
  ] =
    useState<FormState>(
      INITIAL_FORM,
    )


  const [
    showPassword,
    setShowPassword,
  ] =
    useState(
      false,
    )


  const [
    loading,
    setLoading,
  ] =
    useState(
      false,
    )


  const [
    errors,
    setErrors,
  ] =
    useState<ErrorState>(
      {},
    )


  const [
    globalError,
    setGlobalError,
  ] =
    useState<
      string |
      null
    >(
      null,
    )


  if (
    status ===
      'authenticated'
  ) {
    return (
      <Navigate
        to="/dashboard"
        replace
      />
    )
  }


  function updateField<
    K extends
      keyof FormState,
  >(
    key:
      K,

    value:
      FormState[K],
  ) {
    setForm(
      (
        current,
      ) => ({
        ...current,

        [key]:
          value,
      }),
    )


    if (
      errors[
        key
      ]
    ) {
      setErrors(
        (
          current,
        ) => ({
          ...current,

          [key]:
            undefined,
        }),
      )
    }
  }


  function validate():
    ErrorState {
    const next:
      ErrorState = {}


    const fullName =
      form
        .fullName
        .trim()


    const email =
      form
        .email
        .trim()


    const organizationName =
      form
        .organizationName
        .trim()


    const industry =
      form
        .industry
        .trim()


    const country =
      form
        .headquartersCountryCode
        .trim()
        .toUpperCase()


    const domain =
      normalizeDomain(
        form
          .primaryDomain,
      )


    if (
      !fullName
    ) {
      next.fullName =
        'Full name is required.'
    } else if (
      fullName.length >
      100
    ) {
      next.fullName =
        'Full name must be 100 characters or fewer.'
    }


    if (
      !email
    ) {
      next.email =
        'Work email is required.'
    } else if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/
        .test(
          email,
        )
    ) {
      next.email =
        'Enter a valid email address.'
    }


    if (
      !form.password
    ) {
      next.password =
        'Password is required.'
    } else if (
      form
        .password
        .length <
      12
    ) {
      next.password =
        'Password must contain at least 12 characters.'
    } else if (
      form
        .password
        .length >
      1024
    ) {
      next.password =
        'Password is too long.'
    }


    if (
      !organizationName
    ) {
      next.organizationName =
        'Organization name is required.'
    }


    if (
      !industry
    ) {
      next.industry =
        'Industry is required.'
    }


    if (
      !domain
    ) {
      next.primaryDomain =
        'Company domain is required.'
    } else if (
      !domain.includes(
        '.',
      )
    ) {
      next.primaryDomain =
        'Enter a valid company domain.'
    }


    if (
      !country
    ) {
      next.headquartersCountryCode =
        'Country code is required.'
    } else if (
      !/^[A-Z]{2}$/
        .test(
          country,
        )
    ) {
      next.headquartersCountryCode =
        'Use a two-letter country code such as IN or US.'
    }


    if (
      form
        .employeeCount
        .trim()
    ) {
      const count =
        Number(
          form
            .employeeCount,
        )


      if (
        !Number.isInteger(
          count,
        ) ||
        count <
          1
      ) {
        next.employeeCount =
          'Employee count must be a positive whole number.'
      }
    }


    if (
      !form.terms
    ) {
      next.terms =
        'Accept the terms to create the organization.'
    }


    return next
  }


  async function handleSubmit(
    event:
      React.FormEvent,
  ) {
    event
      .preventDefault()


    const nextErrors =
      validate()


    if (
      Object.keys(
        nextErrors,
      ).length
    ) {
      setErrors(
        nextErrors,
      )

      return
    }


    setErrors(
      {},
    )

    setGlobalError(
      null,
    )

    setLoading(
      true,
    )


    const normalizedEmail =
      form
        .email
        .trim()
        .toLowerCase()


    try {
      /*
       * ==============================================================
       * 1. CANONICAL IDENTITY + ORGANIZATION REGISTRATION
       * ==============================================================
       *
       * Certified Phase-25 authentication path remains unchanged.
       */

      const data =
        await authApi
          .register({
            fullName:
              form
                .fullName
                .trim(),

            email:
              normalizedEmail,

            password:
              form.password,

            organizationName:
              form
                .organizationName
                .trim(),
          })


      setAuthenticated({
        user:
          data
            .user as
            SafeUser,

        organization:
          data
            .organization as
            SafeOrganization |
            null,

        membership:
          data
            .membership as
            SafeMembership |
            null,

        session:
          null,

        csrfToken:
          data
            .csrfToken,
      })


      /*
       * ==============================================================
       * 2. ENTERPRISE ORGANIZATION PROFILE
       * ==============================================================
       */

      await productOrganizationProfileApi
        .update({
          legalName:
            form
              .organizationName
              .trim(),

          websiteUrl:
            form
              .websiteUrl
              .trim() ||
            null,

          primaryDomain:
            normalizeDomain(
              form
                .primaryDomain,
            ),

          industry:
            form
              .industry
              .trim(),

          companySize:
            form
              .companySize,

          employeeCount:
            form
              .employeeCount
              .trim()
              ? Number(
                  form
                    .employeeCount,
                )
              : null,

          headquartersCountryCode:
            form
              .headquartersCountryCode
              .trim()
              .toUpperCase(),

          technicalMaturity:
            form
              .technicalMaturity,

          metadata: {
            source:
              'phase25_signup',

            onboardingMode:
              'shadow',

            companyDomainVerification:
              'pending',

            executionAuthorized:
              false,
          },
        })


      /*
       * ==============================================================
       * 3. EMAIL VERIFICATION
       * ==============================================================
       *
       * Verification does not grant organization permissions or execution.
       */

      await authLifecycleApi
        .requestEmailVerification(
          normalizedEmail,
        )


      /*
       * ==============================================================
       * 4. DO NOT ENTER WORKSPACE YET
       * ==============================================================
       */

      navigate(
        `/email-verification-pending?email=${encodeURIComponent(
          normalizedEmail,
        )}`,
        {
          replace:
            true,
        },
      )
    } catch (
      error:
        any
    ) {
      if (
        error
          ?.status ===
        409
      ) {
        setErrors({
          email:
            'An account with this email already exists.',
        })
      } else {
        setGlobalError(
          error instanceof Error
            ? error.message
            : 'Unable to create the AIRA organization.',
        )
      }
    } finally {
      setLoading(
        false,
      )
    }
  }


  return (
    <AuthProductShell
      eyebrow="Enterprise onboarding"
      title="Create your AIRA workspace"
      description="Create the account and organization identity first. Email verification and organization onboarding are required before normal workspace entry."
    >
      <form
        className="space-y-7"
        onSubmit={
          handleSubmit
        }
      >
        {globalError && (
          <div
            role="alert"
            className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
          >
            {
              globalError
            }
          </div>
        )}


        <section className="space-y-4">
          <SectionTitle
            icon={
              UserRound
            }
            title="Account"
            description="Identity used to create the organization owner."
          />


          <Field
            label="Full name"
            error={
              errors
                .fullName
            }
          >
            <Input
              value={
                form
                  .fullName
              }
              autoComplete="name"
              onChange={
                (
                  event,
                ) =>
                  updateField(
                    'fullName',
                    event
                      .target
                      .value,
                  )
              }
            />
          </Field>


          <Field
            label="Work email"
            error={
              errors
                .email
            }
          >
            <div className="relative">
              <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />

              <Input
                className="pl-9"
                type="email"
                autoComplete="email"
                value={
                  form
                    .email
                }
                onChange={
                  (
                    event,
                  ) =>
                    updateField(
                      'email',
                      event
                        .target
                        .value,
                    )
                }
              />
            </div>
          </Field>


          <Field
            label="Password"
            error={
              errors
                .password
            }
          >
            <div className="relative">
              <LockKeyhole className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />

              <Input
                className="px-9"
                type={
                  showPassword
                    ? 'text'
                    : 'password'
                }
                autoComplete="new-password"
                value={
                  form
                    .password
                }
                onChange={
                  (
                    event,
                  ) =>
                    updateField(
                      'password',
                      event
                        .target
                        .value,
                    )
                }
              />

              <button
                type="button"
                className="absolute right-3 top-2.5 text-muted-foreground"
                onClick={
                  () =>
                    setShowPassword(
                      (
                        current,
                      ) =>
                        !current,
                    )
                }
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </Field>


          <div className="space-y-2 rounded-xl border border-border bg-muted/20 p-3">
            {PASSWORD_REQUIREMENTS.map(
              (
                requirement,
              ) => (
                <div
                  key={
                    requirement
                  }
                  className="flex gap-2 text-xs text-muted-foreground"
                >
                  <Check className="h-4 w-4 text-emerald-500" />

                  {
                    requirement
                  }
                </div>
              ),
            )}
          </div>
        </section>


        <section className="space-y-4 border-t border-border pt-6">
          <SectionTitle
            icon={
              Building2
            }
            title="Company"
            description="Creates the enterprise organization profile used during onboarding."
          />


          <Field
            label="Organization name"
            error={
              errors
                .organizationName
            }
          >
            <Input
              value={
                form
                  .organizationName
              }
              onChange={
                (
                  event,
                ) =>
                  updateField(
                    'organizationName',
                    event
                      .target
                      .value,
                  )
              }
            />
          </Field>


          <div className="grid gap-4 md:grid-cols-2">
            <Field
              label="Company domain"
              error={
                errors
                  .primaryDomain
              }
            >
              <div className="relative">
                <Globe2 className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />

                <Input
                  className="pl-9"
                  placeholder="example.com"
                  value={
                    form
                      .primaryDomain
                  }
                  onChange={
                    (
                      event,
                    ) =>
                      updateField(
                        'primaryDomain',
                        event
                          .target
                          .value,
                      )
                  }
                />
              </div>
            </Field>


            <Field
              label="Company website"
            >
              <Input
                placeholder="https://example.com"
                value={
                  form
                    .websiteUrl
                }
                onChange={
                  (
                    event,
                  ) =>
                    updateField(
                      'websiteUrl',
                      event
                        .target
                        .value,
                    )
                }
              />
            </Field>


            <Field
              label="Industry"
              error={
                errors
                  .industry
              }
            >
              <Input
                placeholder="Software, FinTech, Healthcare..."
                value={
                  form
                    .industry
                }
                onChange={
                  (
                    event,
                  ) =>
                    updateField(
                      'industry',
                      event
                        .target
                        .value,
                    )
                }
              />
            </Field>


            <Field
              label="Company size"
            >
              <select
                value={
                  form
                    .companySize
                }
                onChange={
                  (
                    event,
                  ) =>
                    updateField(
                      'companySize',
                      event
                        .target
                        .value as
                        CompanySize,
                    )
                }
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="solo">
                  Solo
                </option>

                <option value="micro">
                  2–10
                </option>

                <option value="small">
                  11–50
                </option>

                <option value="medium">
                  51–250
                </option>

                <option value="large">
                  251–1000
                </option>

                <option value="enterprise">
                  1000+
                </option>
              </select>
            </Field>


            <Field
              label="Employee count"
              error={
                errors
                  .employeeCount
              }
            >
              <Input
                type="number"
                min="1"
                value={
                  form
                    .employeeCount
                }
                onChange={
                  (
                    event,
                  ) =>
                    updateField(
                      'employeeCount',
                      event
                        .target
                        .value,
                    )
                }
              />
            </Field>


            <Field
              label="Headquarters country code"
              error={
                errors
                  .headquartersCountryCode
              }
            >
              <Input
                maxLength={
                  2
                }
                placeholder="IN"
                value={
                  form
                    .headquartersCountryCode
                }
                onChange={
                  (
                    event,
                  ) =>
                    updateField(
                      'headquartersCountryCode',
                      event
                        .target
                        .value
                        .toUpperCase(),
                    )
                }
              />
            </Field>


            <Field
              label="Technical maturity"
            >
              <select
                value={
                  form
                    .technicalMaturity
                }
                onChange={
                  (
                    event,
                  ) =>
                    updateField(
                      'technicalMaturity',
                      event
                        .target
                        .value as
                        TechnicalMaturity,
                    )
                }
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="emerging">
                  Emerging
                </option>

                <option value="developing">
                  Developing
                </option>

                <option value="established">
                  Established
                </option>

                <option value="advanced">
                  Advanced
                </option>
              </select>
            </Field>
          </div>
        </section>


        <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4">
          <div className="flex gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 text-cyan-400" />

            <div>
              <p className="text-sm font-medium">
                Safe initial operating mode
              </p>

              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                New organizations begin without autonomous execution authority. Infrastructure onboarding and trust qualification happen separately.
              </p>
            </div>
          </div>
        </div>


        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={
              form
                .terms
            }
            onChange={
              (
                event,
              ) =>
                updateField(
                  'terms',
                  event
                    .target
                    .checked,
                )
            }
            className="mt-1"
          />

          <span className="text-sm text-muted-foreground">
            I agree to the AIRA terms and understand that creating an organization does not grant infrastructure execution authority.
          </span>
        </label>


        {errors
          .terms && (
          <p className="text-sm text-destructive">
            {
              errors
                .terms
            }
          </p>
        )}


        <Button
          className="w-full"
          type="submit"
          disabled={
            loading
          }
        >
          {loading ? (
            <>
              <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />

              Creating organization…
            </>
          ) : (
            <>
              <Server className="mr-2 h-4 w-4" />

              Create AIRA organization
            </>
          )}
        </Button>


        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{' '}

          <Link
            to="/login"
            className="text-primary hover:underline"
          >
            Sign in
          </Link>
        </p>
      </form>
    </AuthProductShell>
  )
}


function Field({
  label,
  error,
  children,
}: {
  label:
    string

  error?:
    string

  children:
    React.ReactNode
}) {
  return (
    <div className="space-y-2">
      <Label>
        {
          label
        }
      </Label>

      {
        children
      }

      {error && (
        <p className="text-xs text-destructive">
          {
            error
          }
        </p>
      )}
    </div>
  )
}


function SectionTitle({
  icon:
    Icon,

  title,

  description,
}: {
  icon:
    typeof UserRound

  title:
    string

  description:
    string
}) {
  return (
    <div className="flex gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/30">
        <Icon className="h-4 w-4" />
      </div>

      <div>
        <h2 className="text-sm font-medium">
          {
            title
          }
        </h2>

        <p className="mt-0.5 text-xs text-muted-foreground">
          {
            description
          }
        </p>
      </div>
    </div>
  )
}