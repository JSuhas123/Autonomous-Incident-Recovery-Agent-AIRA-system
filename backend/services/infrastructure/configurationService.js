/**
 * Configuration Service
 * Manages application configuration and settings
 */

class ConfigurationService {
  static instance = null;
  static config = {};

  /**
   * Load configuration
   */
  static load(configObject) {
    this.config = {
      // API Configuration
      api: {
        port: configObject.api?.port || 3001,
        host: configObject.api?.host || 'localhost',
        timeout: configObject.api?.timeout || 30000,
      },

      // Database Configuration
      database: {
        host: configObject.database?.host || 'localhost',
        port: configObject.database?.port || 27017,
        name: configObject.database?.name || 'backend_tracker',
        maxConnections:
          configObject.database?.maxConnections || 10,
      },

      // Redis Configuration
      redis: {
        host: configObject.redis?.host || 'localhost',
        port: configObject.redis?.port || 6379,
        db: configObject.redis?.db || 0,
        ttl: configObject.redis?.ttl || 3600,
      },

      // Logging Configuration
      logging: {
        level: configObject.logging?.level || 'info',
        format: configObject.logging?.format || 'json',
        maxFileSize:
          configObject.logging?.maxFileSize || 10485760, // 10MB
      },

      // Security Configuration
      security: {
        jwtSecret: configObject.security?.jwtSecret || 'default-secret',
        bcryptRounds:
          configObject.security?.bcryptRounds || 10,
        corsOrigins:
          configObject.security?.corsOrigins || [
            'http://localhost:3000',
          ],
      },

      // Feature Flags
      features: {
        chaosTestingEnabled:
          configObject.features?.chaosTestingEnabled ?? false,
        observabilityEnabled:
          configObject.features?.observabilityEnabled ?? true,
        rateLimitingEnabled:
          configObject.features?.rateLimitingEnabled ?? true,
      },

      // Rate Limiting
      rateLimit: {
        windowMs: configObject.rateLimit?.windowMs || 60000,
        maxRequests: configObject.rateLimit?.maxRequests || 100,
      },

      // Monitoring
      monitoring: {
        metricsEnabled:
          configObject.monitoring?.metricsEnabled ?? true,
        tracingEnabled:
          configObject.monitoring?.tracingEnabled ?? true,
        healthCheckInterval:
          configObject.monitoring?.healthCheckInterval ||
          30000,
      },
    };

    return this.config;
  }

  /**
   * Get entire configuration
   */
  static getConfig() {
    return this.config;
  }

  /**
   * Get specific configuration value
   */
  static get(path) {
    const keys = path.split('.');
    let value = this.config;

    for (const key of keys) {
      if (value === undefined || value === null) {
        return undefined;
      }
      value = value[key];
    }

    return value;
  }

  /**
   * Set configuration value
   */
  static set(path, value) {
    const keys = path.split('.');
    let current = this.config;

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!current[key]) {
        current[key] = {};
      }
      current = current[key];
    }

    current[keys[keys.length - 1]] = value;
  }

  /**
   * Validate configuration
   */
  static validate() {
    const required = [
      'api.port',
      'database.host',
      'redis.host',
      'security.jwtSecret',
    ];

    const missing = [];
    for (const path of required) {
      if (this.get(path) === undefined) {
        missing.push(path);
      }
    }

    if (missing.length > 0) {
      throw new Error(
        `Missing required configuration: ${missing.join(', ')}`
      );
    }

    return true;
  }

  /**
   * Get environment-specific configuration
   */
  static getEnvironmentConfig(env = process.env.NODE_ENV || 'development') {
    const envConfigs = {
      development: {
        logging: { level: 'debug' },
        security: { corsOrigins: ['*'] },
      },
      production: {
        logging: { level: 'warn' },
        security: {
          corsOrigins: [
            'https://yourdomain.com',
          ],
        },
      },
      testing: {
        logging: { level: 'error' },
        features: { chaosTestingEnabled: true },
      },
    };

    return envConfigs[env] || envConfigs.development;
  }
}

module.exports = ConfigurationService;
