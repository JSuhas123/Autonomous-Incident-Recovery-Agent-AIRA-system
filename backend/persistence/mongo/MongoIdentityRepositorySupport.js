"use strict";

function sessionFrom(transaction) {
  return transaction?.kind === "mongo" ? transaction.session : null;
}

function applySession(query, transaction) {
  const session = sessionFrom(transaction);
  return session && typeof query.session === "function"
    ? query.session(session)
    : query;
}

async function create(model, data, transaction) {
  const session = sessionFrom(transaction);
  if (!session) return model.create(data);
  const [created] = await model.create([data], { session });
  return created;
}

async function save(document, transaction, name) {
  if (!document || typeof document.save !== "function") {
    throw Object.assign(new Error(`${name}.save() requires a Mongoose document`), {
      code: "INVALID_MONGO_DOCUMENT",
    });
  }

  const session = sessionFrom(transaction);
  return document.save(session ? { session } : undefined);
}

function projection(query, options = {}) {
  if (options.select) return query.select(options.select);
  return query;
}

function mutationOptions(options = {}, transaction = null) {
  if (options?.kind === "mongo" || options?.clientSession) {
    return { options: {}, transaction: options };
  }
  return { options, transaction };
}

function normalizeUpdate(update = {}) {
  return Object.keys(update).some((key) => key.startsWith("$"))
    ? update
    : { $set: update };
}

function updateResult(result) {
  return {
    acknowledged: result.acknowledged !== false,
    matchedCount: result.matchedCount ?? result.n ?? 0,
    modifiedCount: result.modifiedCount ?? result.nModified ?? 0,
  };
}

async function updateOne(model, filter, update, options, transaction) {
  const parsed = mutationOptions(options, transaction);
  const query = applySession(
    model.updateOne(filter, normalizeUpdate(update), parsed.options),
    parsed.transaction
  );
  return updateResult(await query.exec());
}

async function updateMany(model, filter, update, options, transaction) {
  const parsed = mutationOptions(options, transaction);
  const query = applySession(
    model.updateMany(filter, normalizeUpdate(update), parsed.options),
    parsed.transaction
  );
  return updateResult(await query.exec());
}

module.exports = {
  sessionFrom,
  applySession,
  create,
  save,
  projection,
  mutationOptions,
  updateOne,
  updateMany,
};
