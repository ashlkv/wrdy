"use strict";

const _ = require('lodash');
const debug = require('debug')('user');

const Settings = require('./settings');

let adminIds;

/**
 * Get settings value
 * @param {Number} chatId
 * @returns {Promise}
 */
let getWordCount = function(chatId) {
    return Settings.getOne({key: 'wordCount', chatId: chatId});
};

/**
 * Set settings value
 * @param {Number} wordCount
 * @param {Number} chatId
 * @returns {Promise}
 */
let setWordCount = function(wordCount, chatId) {
    return Settings.set({key: 'wordCount', chatId: chatId}, wordCount);
};

/**
 * Determines if user with gived id is an admin
 * @param {Number} chatId Chat / user id
 * @returns {Boolean}
 */
const isAdmin = function(chatId) {
    return getAdminIds().indexOf(chatId) !== -1;
};

const getAdminIds = function() {
    if (_.isUndefined(adminIds)) {
        adminIds = _.map((process.env.ADMIN_IDS || '').split(','), number => parseInt(number));
    }
    return adminIds;
};

module.exports = {
    getWordCount: getWordCount,
    setWordCount: setWordCount,
    getAdminIds: getAdminIds,
    isAdmin: isAdmin
};
