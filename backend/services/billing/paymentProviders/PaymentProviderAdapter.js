"use strict";


class PaymentProviderAdapter {

  getProviderCode() {
    throw new Error(
      "getProviderCode() must be implemented"
    );
  }


  async createCheckoutSession(
    _options
  ) {
    throw new Error(
      "createCheckoutSession() must be implemented"
    );
  }


  async retrieveCheckoutSession(
    _providerSessionId
  ) {
    throw new Error(
      "retrieveCheckoutSession() must be implemented"
    );
  }


  async retrievePaymentState(
    providerSessionId
  ) {
    return this
      .retrieveCheckoutSession(
        providerSessionId
      );
  }


  async retrieveSubscriptionState(
    _providerSubscriptionId
  ) {
    const error =
      new Error(
        "Provider subscription reconciliation is not implemented"
      );

    error.code =
      "PAYMENT_PROVIDER_SUBSCRIPTION_UNSUPPORTED";

    error.status =
      422;

    throw error;
  }


  async cancelCheckoutSession(
    _providerSessionId
  ) {
    const error =
      new Error(
        "Provider does not support checkout-session cancellation"
      );

    error.code =
      "PAYMENT_PROVIDER_CANCEL_UNSUPPORTED";

    error.status =
      422;

    throw error;
  }
}


module.exports =
  PaymentProviderAdapter;