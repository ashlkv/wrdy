"use strict";

let Storage = require('./storage');
let Score = require('./score');

let debug = require('debug')('vocab');
let _ = require('lodash');
let moment = require('moment');

/**
 * Path to vocabulary file
 * @type {string}
 */
const listFilePath = './data/vocabulary.json';

let pairs;

/**
 *
 * @param {String} [term] Vocabulary term. If not specified, creates a word with a random term
 * @constructor
 */
let Word = function(term) {
    this.term = term;
};

/**
 * Returns a new random word for given chat Id
 * @param {Number} chatId Requred so not repeat words correctly answered
 * @returns {Promise}
 */
Word.createRandom = function(chatId) {
    return getRandomTerm(chatId).then(function(term) {
        return new Word(term);
    });
};

/**
 * Translates the term
 * @returns {String}
 */
Word.prototype.getTranslation = function() {
    if (!this.translation) {
        this.translation = translate(this.term);
    }
    return this.translation;
};

/**
 * Returns the term
 * @returns {String}
 */
Word.prototype.getTerm = function() {
    return this.term;
};

/**
 * Replaces all letters with dots except for one random letter
 * @returns {String}
 */
Word.prototype.getClue = function() {
    let randomIndex = _.random(0, this.term.length - 1);
    let randomLetter = this.term[randomIndex];
    let dots = this.term.replace(/[a-z]/gi, '–').split('');
    dots[randomIndex] = randomLetter;
    return dots.join(' ');
};

const NoTermsException = function() {};

// TODO Store all word pairs in a database
/**
 * Reads all words from file into a list
 * @returns {Object}
 */
const getPairs = function() {
    if (!pairs) {
        pairs = require(listFilePath);
    }
    return pairs;
};

/**
 * Returns a random word from list
 * @param {Number} chatId Requred so not repeat words correctly answered
 * @returns {String}
 */
const getRandomTerm = function(chatId) {
    let pairs = getPairs();
    let allTerms = _.keys(pairs);

    // Do not include words answered correctly
    return Score.getAll(chatId)
        .then(function(allScores) {
            let touchedTerms = _.map(allScores, 'term');
            // First try excluding all touched (correct, incorrect and skipped) words and see if there is anything left.
            let availableTerms = _.difference(allTerms, touchedTerms);

            // If there are no untouched terms, try excluding only correct terms.
            if (!availableTerms.length) {
                let correctTerms = _.map(_.filter(allScores, {status: Score.status.correct}), 'term');
                availableTerms = _.difference(allTerms, correctTerms);
            }

            // If no terms left anyway, no skipped or incorrect ones, throw exception
            if (!availableTerms.length) {
                throw new NoTermsException();
            }

            let index = _.random(0, availableTerms.length - 1);
            return availableTerms[index];
        });
};

/**
 * Translates term
 * @param {String} term
 * @returns {String}
 */
const translate = function(term) {
    return getPairs()[term];
};

/**
 * Stores last state, word, message and whatever for each chat
 * @param {Object} data
 * @param {Number} chatId
 * @returns {Promise}
 */
const saveHistory = function(data, chatId) {
    return Storage
        .remove(Storage.collectionName.history, {chatId: chatId})
        .then(function() {
            return Storage.insert(Storage.collectionName.history, {
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
const getHistory = function(chatId) {
    return Storage
        .find(Storage.collectionName.history, {chatId: chatId})
        .then(function(entries) {
            let data = entries.length ? entries[0].data : {};
            // Hydrating the word object
            if (data.word && data.word.term) {
                data.word = new Word(data.word.term);
            }
            return data;
        });
};

module.exports = {
    Word: Word,
    getRandomTerm: getRandomTerm,
    saveHistory: saveHistory,
    getHistory: getHistory,
    NoTermsException: NoTermsException
};