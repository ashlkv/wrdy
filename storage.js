"use strict";

const Promise = require('bluebird');
const mongoClient = require('mongodb').MongoClient;
const _ = require('lodash');
let debug = require('debug')('storage');

let connection;

const collectionName = {
    score: 'score',
    history: 'history',
    settings: 'settings'
};

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
        let collection = db.collection(collectionName);
        return collection.insert(items);
    });
};

/**
 *
 * @param {String} collectionName
 * @param {Object} query
 * @param {Object} [sorter] Example: date: true}
 * @returns {*}
 */
const find = function(collectionName, query, sorter) {
    query = query || {};
    return connect().then(function(db) {
        let collection = db.collection(collectionName);
        return collection.find(query).toArray();
    }).then(function(result) {
        if (sorter) {
            result = _.sortBy(result, sorter);
        }
        return result;
    });
};

const remove = function(collectionName, query) {
    query = query || {};
    return connect().then(function(db) {
        let collection = db.collection(collectionName);
        return collection.remove(query);
    });
};

const count = function(collectionName, query) {
    query = query || {};
    return connect().then(function(db) {
        let collection = db.collection(collectionName);
        return collection.count(query);
    });
};

const drop = function(collectionName) {
    return connect()
        .then(function(db) {
            let collection = db.collection(collectionName);
            return collection.drop();
        })
        // Collection.drop will throw exception if collection does not exist. Catch the exception and resolve promise anyway.
        .catch(function() {
            return true;
        });
};

module.exports = {
    collectionName: collectionName,
    connect: connect,
    insert: insert,
    find: find,
    remove: remove,
    count: count,
    drop: drop
};
