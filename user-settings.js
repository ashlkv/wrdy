"use strict";

const _ = require('lodash');
const debug = require('debug')('user-settings');

const Storage = require('./storage');

/**
 * Get settings value
 * @param {String} key
 * @param {Number} chatId
 * @returns {Promise}
 */
let getValue = function(key, chatId) {
    return Storage
        // Get previous collector launch time
        .find(Storage.collectionName.settings, {chatId: chatId})
        .then(function(result) {
            let settings = result && result.length ? result[0] : {};
            return settings[key];
        });
};

/**
 * Set settings value
 * @param {String} key
 * @param {*} value
 * @param {Number} chatId
 * @returns {Promise}
 */
let setValue = function(key, value, chatId) {
    return Storage
        // Get previous collector launch time
        .find(Storage.collectionName.settings, {chatId: chatId})
        .then(function(result) {
            let settings = result && result.length ? result[0] : {chatId: chatId};
            if (_.isObject(key)) {
                settings = _.extend(settings, key);
            } else {
                settings[key] = value;
            }
            return Storage
                .remove(Storage.collectionName.settings, {chatId: chatId})
                .then(function() {
                    Storage.insert(Storage.collectionName.settings, settings);
                });
        });
};

module.exports = {
    getValue: getValue,
    setValue: setValue
};
