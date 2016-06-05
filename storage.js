"use strict";

var Promise = require('bluebird');
var mongoClient = require('mongodb').MongoClient;

var connection;

const collectionName = {
    score: 'score',
    currentWord: 'currentWord'
};

/**
 * @returns {Promise}
 */
var connect = function() {
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

var insert = function(collectionName, items) {
    return connect().then(function(db) {
        var collection = db.collection(collectionName);
        return collection.insert(items);
    });
};

var find = function(collectionName, query) {
    query = query || {};
    return connect().then(function(db) {
        var collection = db.collection(collectionName);
        return collection.find(query).toArray();
    });
};

var remove = function(collectionName, query) {
    query = query || {};
    return connect().then(function(db) {
        var collection = db.collection(collectionName);
        return collection.remove(query);
    });
};

var drop = function(collectionName) {
    return connect()
        .then(function(db) {
            var collection = db.collection(collectionName);
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
    drop: drop
};
