"use strict";

const Storage = require('./storage');

const debug = require('debug')('score');
const moment = require('moment');
const _ = require('lodash');

const collectionName = 'score';

const status = {
    correct: 'correct',
    wrong: 'wrong',
    skipped: 'skipped'
};

const statusLocale = {
    correct: 'Правильно',
    wrong: 'Неправильно',
    skipped: 'Пропущено'
};

/**
 * Stores the score entry
 * @param {Word} word
 * @param {String} status
 * @param {Number} chatId
 * @returns {Promise}
 */
const add = function(word, status, chatId) {
    let term = word && word.getTerm();
    // Remove all previous score entries for this user / term. Store only one score record per user / term.
    return Storage
        .remove(collectionName, {chatId: chatId, term: term})
        .then(function() {
            Storage.insert(collectionName, {
                term: term,
                translation: word && word.getTranslation(),
                clue: word && word.getClue(),
                date: moment().toDate(),
                status: status,
                chatId: chatId
            });
        });
};

/**
 * Returns all scores for given chatId
 * @param {Number} chatId
 * @param {String} [statsTimespan]
 * @returns {Promise}
 */
const all = function(chatId, statsTimespan) {
    let query = {chatId: chatId};
    if (statsTimespan) {
        query.date = {
            $gte: moment().startOf(statsTimespan).toDate()
        }
    }
    return Storage.find(collectionName, query, 'date');
};

/**
 * Returns score count for given chatId
 * @param {Number} chatId
 * @returns {Promise}
 */
const count = function(chatId) {
    return Storage.count(collectionName, {
        chatId: chatId
    });
};

/**
 * Resets all scored for given chat id
 * @param {Number} chatId
 * @returns {Promise}
 */
const reset = function(chatId) {
    return Storage.remove(collectionName, {
        chatId: chatId
    });
};

/**
 * Formats stats
 * @param {Object} total
 * @returns {string}
 */
const formatStats = function(total) {
    return _.map(total, function(value, key) {
        return `${statusLocale[key]}: ${value}`;
    }).join('\n');
};

/**
 * Returns stats text
 * @param {Number} chatId
 * @param {String} [statsTimespan]
 * @returns {String}
 */
const getStats = function(chatId, statsTimespan) {
    return all(chatId, statsTimespan)
        .then(function(score) {
            let total = {};
            _.forEach(_.keys(status), function(statusKey) {
                let count = getCountByStatus(score, statusKey);
                if (count) {
                    total[statusKey] = count;
                }
            });
            return {
                chatId: chatId,
                total: total
            };
        });
};

/**
 * Returns all stats in given timespan
 * @param {String} [statsTimespan]
 * @returns {Promise.<Array>}
 */
const getAllStats = function(statsTimespan) {
    return getAllChatIds()
        .then(function(chatIds) {
            let promises = [];
            _.forEach(chatIds, function(chatId) {
                promises.push(getStats(chatId, statsTimespan));
            });
            return Promise.all(promises);
        })
};

/**
 * @param {Array} score
 * @param {String} status
 * @returns {Number} count
 */
const getCountByStatus = function(score, status) {
    return _.filter(score, {status: status}).length;
};

/**
 * Returns ids of all users who have scores
 * @returns {Promise.<Array>}
 */
const getAllChatIds = function() {
    return Storage.distinct(collectionName, 'chatId');
};

module.exports = {
    status: status,
    add: add,
    all: all,
    count: count,
    reset: reset,
    formatStats: formatStats,
    getStats: getStats,
    getAllStats: getAllStats
};