"use strict";


const RESOURCE_TYPES =
  Object.freeze({

    APPLICATION_SERVICE:
      "application.service",

    KUBERNETES_POD:
      "kubernetes.pod",

    KUBERNETES_DEPLOYMENT:
      "kubernetes.deployment",

    KUBERNETES_SERVICE:
      "kubernetes.service",

    KUBERNETES_NODE:
      "kubernetes.node",

    CONTAINER_DOCKER:
      "container.docker",

    LINUX_HOST:
      "linux.host",

    LINUX_PROCESS:
      "linux.process",

    POSTGRES_DATABASE:
      "postgres.database",

    POSTGRES_REPLICA:
      "postgres.replica",

    MYSQL_DATABASE:
      "mysql.database",

    MONGODB_DATABASE:
      "mongodb.database",

    REDIS_INSTANCE:
      "redis.instance",

    RABBITMQ_QUEUE:
      "rabbitmq.queue",

    RABBITMQ_EXCHANGE:
      "rabbitmq.exchange",

    KAFKA_BROKER:
      "kafka.broker",

    KAFKA_TOPIC:
      "kafka.topic",

    AWS_EC2:
      "aws.ec2",

    AWS_RDS:
      "aws.rds",

    AWS_LAMBDA:
      "aws.lambda",

    AZURE_VM:
      "azure.vm",

    GCP_COMPUTE_INSTANCE:
      "gcp.compute_instance",

    NETWORK_SWITCH:
      "network.switch",

    NETWORK_ROUTER:
      "network.router",

    NETWORK_FIREWALL:
      "network.firewall",

    STORAGE_VOLUME:
      "storage.volume",

    ROBOTICS_AMR:
      "robotics.amr",

    ROBOTICS_LIDAR:
      "robotics.lidar",

    ROBOTICS_CAMERA:
      "robotics.camera",

    ROBOTICS_MOTOR:
      "robotics.motor",
  });


const RESOURCE_TYPE_VALUES =
  Object.freeze(
    Object.values(
      RESOURCE_TYPES
    )
  );


const RESOURCE_TYPE_PATTERN =
  /^[a-z][a-z0-9_-]*\.[a-z][a-z0-9_-]*$/;


function isValidResourceType(
  value
) {
  return (
    typeof value ===
      "string" &&
    RESOURCE_TYPE_PATTERN
      .test(
        value
      )
  );
}


function isKnownResourceType(
  value
) {
  return (
    typeof value ===
      "string" &&
    RESOURCE_TYPE_VALUES
      .includes(
        value
      )
  );
}


module.exports = {
  RESOURCE_TYPES,

  RESOURCE_TYPE_VALUES,

  RESOURCE_TYPE_PATTERN,

  isValidResourceType,

  isKnownResourceType,
};