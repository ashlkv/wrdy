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
    let term = word && word.getTerm();
    // Remove all previous score entries for this user / term. Store only one score record per user / term.
    return Storage
        .remove(Storage.collectionName.score, {chatId: chatId, term: term})
        .then(function() {
            Storage.insert(Storage.collectionName.score, {
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
    return Storage.find(Storage.collectionName.score, {chatId: chatId}, 'date');
};

/**
 * Returns score count for given chatId
 * @param {Number} chatId
 * @returns {Promise}
 */
const count = function(chatId) {
    return Storage.count(Storage.collectionName.score, {
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
    all: all,
    count: count,
    reset: reset,
    status: status
};