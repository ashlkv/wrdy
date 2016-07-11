'use strict';

const Promise = require('bluebird');
const debug = require('debug')('history');
const moment = require('moment');
const _ = require('lodash');

const Word = require('./word');
const Storage = require('./storage');

const collectionName = 'history';

/**
 * Stores last state, word, message and whatever for each chat
 * @param {Object} data
 * @param {Number} chatId
 * @returns {Promise}
 */
const save = function(data, chatId) {
    return Storage
        .remove(collectionName, {chatId: chatId})
        .then(function() {
            return Storage.insert(collectionName, {
                data: data,
                date: moment().toDate(),
                chatId: chatId
            });
        });
};

/**
 * Retrieves last state, word and message for each chat
 * @param {Number} chatId
 * @returns {Promise}
 */
const get = function(chatId) {
    return Storage
        .find(collectionName, {chatId: chatId})
        .then(function(entries) {
            let data = entries.length ? entries[0].data : {};
            // Hydrating the word object
            if (data.word && data.word.term) {
                data.word = new Word(data.word.term, data.word.translation);
            }
            return data;
        });
};

module.exports = {
    save: save,
    get: get
};