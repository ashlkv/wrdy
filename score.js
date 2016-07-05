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

const statusTranslations = {
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
 * @returns {Promise}
 */
const all = function(chatId) {
    // TODO Limit results timespan, otherwise it will be too many records soon.
    return Storage.find(collectionName, {chatId: chatId}, 'date');
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

const getStats = function(chatId) {
    return all(chatId)
        .then(function(score) {
            let lines = [];
            _.forEach(_.keys(status), function(statusKey) {
                let count = getCountByStatus(score, statusKey);
                if (count) {
                    lines.push(`${statusTranslations[statusKey]}: ${count}`);
                }
            });
            return lines.length ? lines.join('\n') : 'Статистики пока нет';
        });
};

/**
 * @param {Array} score
 * @param {String} status
 * @returns {Number} count
 */
const getCountByStatus = function(score, status) {
    return _.filter(score, {status: status}).length;
};

module.exports = {
    add: add,
    all: all,
    count: count,
    reset: reset,
    status: status,
    getStats: getStats
};