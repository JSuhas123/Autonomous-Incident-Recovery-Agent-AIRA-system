import type {
  ProductContextResponse,
} from '@/product/product.types'


const BASE_URL =
  import.meta.env
    .VITE_API_URL ??
  'http://localhost:5000'


export class ProductContextApiError
  extends Error {
  constructor(
    public readonly status:
      number,

    message:
      string,

    public readonly code?:
      string,

    public readonly details?:
      unknown,
  ) {
    super(
      message,
    )

    this.name =
      'ProductContextApiError'
  }
}


export async function fetchAuthoritativeProductContext(
  environmentId:
    string | null,
  signal?:
    AbortSignal,
): Promise<ProductContextResponse> {
  const headers:
    Record<
      string,
      string
    > = {
      Accept:
        'application/json',
    }


  if (
    environmentId
  ) {
    headers[
      'X-AIRA-Environment-Id'
    ] =
      environmentId
  }


  const response =
    await fetch(
      `${BASE_URL}/api/v1/product/context`,
      {
        method:
          'GET',

        credentials:
          'include',

        headers,

        signal,
      },
    )


  let data:
    unknown


  const contentType =
    response.headers.get(
      'content-type',
    ) ?? ''


  if (
    contentType.includes(
      'application/json',
    )
  ) {
    data =
      await response.json()
  } else {
    data =
      await response.text()
  }


  if (
    !response.ok
  ) {
    const errorBody =
      data as {
        error?:
          | string
          | {
              code?: string
              message?: string
            }

        code?:
          string

        message?:
          string
      }


    const nestedError =
      typeof errorBody
        ?.error ===
      'object'
        ? errorBody.error
        : null


    throw new ProductContextApiError(
      response.status,

      nestedError
        ?.message ??
        (
          typeof errorBody
            ?.error ===
          'string'
            ? errorBody.error
            : null
        ) ??
        errorBody
          ?.message ??
        `HTTP ${response.status}`,

      nestedError
        ?.code ??
        errorBody
          ?.code,

      data,
    )
  }


  return data as
    ProductContextResponse
}