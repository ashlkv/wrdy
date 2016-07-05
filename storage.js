"use strict";

const Promise = require('bluebird');
const mongoClient = require('mongodb').MongoClient;
const _ = require('lodash');
let debug = require('debug')('storage');

let connection;

/**
 * @returns {Promise}
 */
const connect = function() {
    // If connection already exists, use existing connection.
    // It is recommended to only connect once and reuse that one connection: http://stackoverflow.com/questions/10656574
    let promise;

    if (connection) {
        promise = Promise.resolve(connection);
    // If connection is not yet created, connect and store resulting connection.
    } else {
        promise = mongoClient.connect(process.env.MONGODB_URI).then(function(db) {
            // Store connection
            connection = db;
            return db;
        });
    }
    return promise;
};

const insert = function(collectionName, items) {
    return connect().then(function(db) {
        return db.collection(collectionName).insert(items);
    });
};

/**
 *
 * @param {String} collectionName
 * @param {Object} query
 * @param {String|Array|Object} [sorter]
 * @param {Number} [limit]
 * @param {Number} [skip]
 * @returns {*}
 */
const find = function(collectionName, query, sorter, limit, skip) {
    return connect().then(function(db) {
        let cursor = db.collection(collectionName).find(query);
        if (sorter) {
            sorter = _.isString(sorter) ? {[sorter]: 1} : sorter;
            cursor.sort(sorter);
        }
        if (skip) {
            cursor.skip(skip);
        }
        if (limit) {
            cursor.limit(limit);
        }
        return cursor.toArray();
    });
};

const remove = function(collectionName, query) {
    return connect().then(function(db) {
        return db.collection(collectionName).remove(query);
    });
};

const count = function(collectionName, query) {
    return connect().then(function(db) {
        return db.collection(collectionName).count(query);
    });
};

const drop = function(collectionName) {
    return connect()
        .then(function(db) {
            return db.collection(collectionName).drop();
        })
        // Collection.drop will throw exception if collection does not exist. Catch the exception and resolve promise anyway.
        .catch(function() {
            return true;
        });
};

module.exports = {
    connect: connect,
    insert: insert,
    find: find,
    remove: remove,
    count: count,
    drop: drop
};
