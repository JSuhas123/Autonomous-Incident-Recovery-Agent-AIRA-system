"use strict";

const crypto = require("crypto");
const PostgresIdentityRepositorySupport = require("./PostgresIdentityRepositorySupport");

function camelize(value) {
  return value.replace(/_([a-z])/g, (_match, letter) => letter.toUpperCase());
}

function parseValue(column, value, jsonColumns) {
  if (jsonColumns.includes(column)) {
    if (typeof value === "string") {
      try { return JSON.parse(value); } catch (_error) { return value; }
    }
  }
  return value;
}

class PostgresIdentityRepositoryBase {
  constructor(options, config) {
    this.support = options.support || new PostgresIdentityRepositorySupport(options);
    this.table = config.table;
    this.columns = config.columns;
    this.jsonColumns = config.jsonColumns || [];
    this.hiddenColumns = config.hiddenColumns || [];
    this.secretOptions = config.secretOptions || {};
    this.foreignKeyColumns = config.foreignKeyColumns || {};
    this.identifierColumns = config.identifierColumns;
  }

  async resolveForeignKey(transaction, column, value) {
    if (value === null || value === undefined || !this.foreignKeyColumns[column]) return value;
    const table = this.foreignKeyColumns[column];
    const result = await this.support.query(
      transaction,
      `SELECT id, public_id, legacy_mongo_id FROM ${table} WHERE public_id = $1 OR legacy_mongo_id = $1 OR id::text = $1 LIMIT 1`,
      [PostgresIdentityRepositorySupport.identifier(value)]
    );
    if (!result.rows[0]) {
      throw Object.assign(new Error(`PostgreSQL foreign key not found: ${value}`), { code: "POSTGRES_IDENTITY_REFERENCE_NOT_FOUND" });
    }
    return result.rows[0].id;
  }

  async mapForeignKey(transaction, column, value) {
    if (value === null || value === undefined || !this.foreignKeyColumns[column]) return value;
    const table = this.foreignKeyColumns[column];
    const result = await this.support.query(
      transaction,
      `SELECT id, public_id, legacy_mongo_id FROM ${table} WHERE id = $1 OR public_id = $1 OR legacy_mongo_id = $1 LIMIT 1`,
      [value]
    );
    const row = result.rows[0];
    return row ? row.public_id || row.legacy_mongo_id || String(row.id) : value;
  }

  async mapRow(row, options = {}, transaction = null) {
    if (!row) return null;
    const result = { _id: row.public_id || row.legacy_mongo_id || String(row.id) };
    for (const column of this.columns) {
      const secretOption = this.secretOptions[column];
      if (this.hiddenColumns?.includes(column) && options.includeSecrets !== true && (!secretOption || options[secretOption] !== true)) continue;
      if (row[column] !== undefined) {
        const value = await this.mapForeignKey(transaction, column, row[column]);
        result[camelize(column)] = parseValue(column, value, this.jsonColumns);
      }
    }
    if (row.legacy_mongo_id) result.legacyMongoId = row.legacy_mongo_id;
    return result;
  }

  async buildFilter(filter = {}, transaction = null) {
    const mapped = {};
    const identifier = filter._id ?? filter.id ?? filter.publicId ?? filter.legacyMongoId;
    if (identifier !== undefined) mapped._id = identifier;
    for (const column of this.columns) {
      const key = camelize(column);
      if (filter[key] !== undefined && (typeof filter[key] !== "object" || filter[key] === null || Array.isArray(filter[key]))) {
        mapped[key] = await this.resolveForeignKey(transaction, column, filter[key]);
      }
    }
    const where = PostgresIdentityRepositorySupport.where(mapped, Object.fromEntries(
      Object.keys(mapped).map((key) => [key, key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)])
    ), this.identifierColumns);
    for (const column of this.columns) {
      const key = camelize(column);
      const condition = filter[key];
      if (!condition || typeof condition !== "object" || Array.isArray(condition)) continue;
      if (condition.$ne !== undefined) {
        const value = await this.resolveForeignKey(transaction, column, condition.$ne);
        where.text += ` AND ${column} <> $${where.values.length + 1}`;
        where.values.push(value);
      }
      if (condition.$in !== undefined && Array.isArray(condition.$in)) {
        const placeholders = [];
        for (const value of condition.$in) {
          where.values.push(await this.resolveForeignKey(transaction, column, value));
          placeholders.push(`$${where.values.length}`);
        }
        where.text += ` AND ${column} IN (${placeholders.join(", ")})`;
      }
    }
    return where;
  }

  async findOne(filter = {}, options = {}, transaction = null) {
    if (options?.kind === "postgres" || options?.client) {
      transaction = options;
      options = {};
    }
    const where = await this.buildFilter(filter, transaction);
    const result = await this.support.query(transaction, `SELECT * FROM ${this.table} WHERE ${where.text} LIMIT 1`, where.values);
    return this.mapRow(result.rows[0], options, transaction);
  }

  async findMany(filter = {}, options = {}, transaction = null) {
    if (options?.kind === "postgres" || options?.client) {
      transaction = options;
      options = {};
    }
    const where = await this.buildFilter(filter, transaction);
    const result = await this.support.query(transaction, `SELECT * FROM ${this.table} WHERE ${where.text} ORDER BY created_at ASC`, where.values);
    return Promise.all(result.rows.map((row) => this.mapRow(row, options, transaction)));
  }

  async create(data, transaction = null) {
    data = Array.isArray(data) ? data[0] : data;
    const values = [];
    const names = [];
    const placeholders = [];
    for (const column of this.columns) {
      const key = camelize(column);
      const rawValue = column === "public_id"
        ? data._id || data.publicId || crypto.randomUUID()
        : data[key];
      const value = await this.resolveForeignKey(transaction, column, rawValue);
      if (value === undefined && column !== "legacy_mongo_id") continue;
      names.push(column);
      values.push(value === undefined ? null : this.jsonColumns.includes(column) ? JSON.stringify(value) : value);
      placeholders.push(`$${values.length}${this.jsonColumns.includes(column) ? "::jsonb" : ""}`);
    }
    const result = await this.support.query(transaction, `INSERT INTO ${this.table} (${names.join(", ")}) VALUES (${placeholders.join(", ")}) RETURNING *`, values);
    return this.mapRow(result.rows[0], {}, transaction);
  }

  async save(document, transaction = null) {
    if (!document || (!document._id && !document.id)) {
      throw Object.assign(new Error("Postgres identity save requires a persisted document"), { code: "INVALID_POSTGRES_DOCUMENT" });
    }
    const values = [];
    const assignments = [];
    for (const column of this.columns) {
      if (["public_id", "legacy_mongo_id"].includes(column)) continue;
      const key = camelize(column);
      if (document[key] === undefined) continue;
      const value = await this.resolveForeignKey(transaction, column, document[key]);
      values.push(this.jsonColumns.includes(column) ? JSON.stringify(value) : value);
      assignments.push(`${column} = $${values.length}${this.jsonColumns.includes(column) ? "::jsonb" : ""}`);
    }
    if (!assignments.length) return document;
    const identifier = PostgresIdentityRepositorySupport.identifier(document._id || document.id);
    values.push(identifier);
    const identifiers = (this.identifierColumns || ["public_id", "legacy_mongo_id", "id::text"])
      .map((column) => `${column} = $${values.length}`)
      .join(" OR ");
    const result = await this.support.query(transaction, `UPDATE ${this.table} SET ${assignments.join(", ")} WHERE ${identifiers} RETURNING *`, values);
    return this.mapRow(result.rows[0], {}, transaction) || document;
  }

  async updateOne(filter = {}, update = {}, options = {}, transaction = null) {
    if (options?.kind === "postgres" || options?.client) transaction = options;
    const where = await this.buildFilter(filter, transaction);
    const assignments = await this.buildAssignments(update, transaction);
    if (!assignments.text) return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };
    const offsetWhere = where.text.replace(/\$(\d+)/g, (_match, number) => `$${Number(number) + assignments.values.length}`);
    const result = await this.support.query(
      transaction,
      `UPDATE ${this.table} SET ${assignments.text} WHERE ${offsetWhere}`,
      assignments.values.concat(where.values)
    );
    return { acknowledged: true, matchedCount: result.rowCount, modifiedCount: result.rowCount };
  }

  async updateMany(filter = {}, update = {}, options = {}, transaction = null) {
    return this.updateOne(filter, update, options, transaction);
  }

  async buildAssignments(update = {}, transaction = null) {
    const assignments = [];
    const values = [];
    const set = update.$set || (Object.keys(update).some((key) => key.startsWith("$")) ? {} : update);
    for (const [key, value] of Object.entries(set)) {
      const column = this.columns.find((candidate) => camelize(candidate) === key);
      const dotted = key.split(".");
      const jsonColumn = this.columns.find((candidate) => camelize(candidate) === dotted[0] && this.jsonColumns.includes(candidate));
      if (!column && jsonColumn && dotted.length > 1) {
        values.push(JSON.stringify(value));
        assignments.push(`${jsonColumn} = jsonb_set(COALESCE(${jsonColumn}, '{}'::jsonb), '{${dotted.slice(1).join(",")}}', $${values.length}::jsonb, true)`);
        continue;
      }
      if (!column) continue;
      const resolved = await this.resolveForeignKey(transaction, column, value);
      values.push(this.jsonColumns.includes(column) ? JSON.stringify(resolved) : resolved);
      assignments.push(`${column} = $${values.length}${this.jsonColumns.includes(column) ? "::jsonb" : ""}`);
    }
    for (const [key, amount] of Object.entries(update.$inc || {})) {
      const column = this.columns.find((candidate) => camelize(candidate) === key);
      if (!column) continue;
      values.push(amount);
      assignments.push(`${column} = ${column} + $${values.length}`);
    }
    return { text: assignments.join(", "), values };
  }
}

module.exports = PostgresIdentityRepositoryBase;
