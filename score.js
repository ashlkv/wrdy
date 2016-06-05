"use strict";

let Storage = require('./storage');

let debug = require('debug')('score');
let moment = require('moment');

const status = {
    skipped: 'skipped',
    wrong: 'wrong',
    correct: 'correct'
};

/**
 * Stores the score entry
 * @param {Word} word
 * @param {String} status
 * @param {Number} chatId
 * @returns {Promise}
 */
const add = function(word, status, chatId) {
    return Storage.insert(Storage.collectionName.score, {
        term: word.getTerm(),
        translation: word.getTranslation(),
        clue: word.getClue(),
        date: moment().toDate(),
        status: status,
        chatId: chatId
    });
};

/**
 * Returns all scores for given chatId
 * @param {Number} chatId
 * @returns {Promise}
 */
const getAll = function(chatId) {
    // TODO Limit results timespan, otherwise it will be too many records soon.
    return Storage.find(Storage.collectionName.score, {
        chatId: chatId
    });
};

/**
 * Resets all scored for given chat id
 * @param {Number} chatId
 * @returns {Promise}
 */
const reset = function(chatId) {
    return Storage.remove(Storage.collectionName.score, {
        chatId: chatId
    });
};

module.exports = {
    add: add,
    getAll: getAll,
    reset: reset,
    status: status
};