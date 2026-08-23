"use strict";

const {
  workflowOutboxRepository,
} = require(
  "../repositories"
);

class Query {
  constructor(
    executor
  ) {
    this.executor =
      executor;
  }

  sort() {
    return this;
  }

  lean() {
    return this.exec();
  }

  then(
    resolve,
    reject
  ) {
    return this
      .exec()
      .then(
        resolve,
        reject
      );
  }

  exec() {
    return this.executor();
  }
}

const WorkflowOutboxEvent = {
  find(
    filter = {}
  ) {
    const {
      organizationId,
      environmentId,
      incidentId,
    } =
      filter;

    return new Query(
      () =>
        workflowOutboxRepository
          .findForIncident(
            {
              organizationId,
              environmentId,
            },
            incidentId
          )
    );
  },
};

module.exports = {
  WorkflowOutboxEvent,
};
