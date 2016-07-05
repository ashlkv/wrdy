"use strict";

const _ = require('lodash');
const debug = require('debug')('user');

const Storage = require('./storage');

const collectionName = 'settings';

let adminIds;

/**
 * Get settings value
 * @param {String} key
 * @param {Number} chatId
 * @returns {Promise}
 */
let getValue = function(key, chatId) {
    return Storage
        // Get previous collector launch time
        .find(collectionName, {chatId: chatId})
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
        .find(collectionName, {chatId: chatId})
        .then(function(result) {
            let settings = result && result.length ? result[0] : {chatId: chatId};
            if (_.isObject(key)) {
                settings = _.extend(settings, key);
            } else {
                settings[key] = value;
            }
            return Storage
                .remove(collectionName, {chatId: chatId})
                .then(function() {
                    Storage.insert(collectionName, settings);
                });
        });
};

/**
 * Determines if user with gived id is an admin
 * @param {Number} chatId Chat / user id
 * @returns {Boolean}
 */
const isAdmin = function(chatId) {
    if (_.isUndefined(adminIds)) {
        adminIds = _.map((process.env.ADMIN_IDS || '').split(','), number => parseInt(number));
    }
    return adminIds.indexOf(chatId) !== -1;
};

module.exports = {
    getValue: getValue,
    setValue: setValue,
    isAdmin: isAdmin
};
