"use strict";

const _ = require('lodash');
const debug = require('debug')('settings');

const Storage = require('./storage');

const collectionName = 'settings';

/**
 * Get multiple settings entries
 * @param {String|Object} query
 * @returns {Promise.<Array>}
 */
let get = function(query) {
    query = _.isObject(query) ? query : {key: query};
    return Storage
        .find(collectionName, query);
};

/**
 * Get a single settings value
 * @param {String|Object} query
 * @returns {Promise.<String|Number|*>}
 */
let getOne = function(query) {
    return get(query).then(function(result) {
        let entry = result && result.length ? result[0] : {};
        return entry.value;
    });
};

/**
 * Set settings value
 * @param {String|Object} query
 * @param {String|Number|Object|*} value
 * @returns {Promise}
 */
let set = function(query, value) {
    query = _.isObject(query) ? query : {key: query};
    return Storage
        .find(collectionName, query)
        .then(function(result) {
            let isUpdate = result && result.length;
            let settings = {};
            // Checking if value is an object. Additionally make sure this is not Date object.
            if (_.isObject(value) && !(value instanceof Date)) {
                settings = _.extend(settings, value);
            } else {
                settings.value = value;
            }

            if (isUpdate) {
                return Storage.update(collectionName, query, {$set: settings})
            } else {
                settings = _.extend(settings, query);
                return Storage.insert(collectionName, settings);
            }
        });
};

module.exports = {
    get: get,
    getOne: getOne,
    set: set
};
