"use strict";

const Storage = require('./storage');
const Score = require('./score');
const UserSettings = require('./user-settings');

const Promise = require('bluebird');
const debug = require('debug')('vocab');
const _ = require('lodash');
const moment = require('moment');

/**
 * Path to vocabulary file
 * @type {string}
 */
const listFilePath = './data/vocabulary.json';

/**
 * Maximum number of words per iteration
 * @type {number}
 */
const maxWordCount = 100;

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
 * Returns a custom portion of word pairs (e.g., first 50)
 * @param {Number} chatId
 * @returns {Promise}
 */
const getPairsPortion = function(chatId) {
    // Return a portion of word pairs depending on custom word count
    return UserSettings.getValue('wordCount', chatId)
        .then(function(wordCount) {
            let pairs = getAllPairs();
            wordCount = wordCount || maxWordCount;
            let keys = _.keys(pairs).slice(0, wordCount);
            return _.pick(pairs, keys);
        });
};

/**
 * Reads all words from file into an object where key is the English term and value is a corresponding term in another language
 */
const getAllPairs = function() {
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
    return getPairsPortion(chatId)
        .then(function(pairs) {
            let allTerms = _.keys(pairs);
            return Promise.all([allTerms, Score.all(chatId)]);
        }).then(function(result) {
            let allTerms = result[0];
            let allScores = result[1];
            // List of touched terms ordered by date, earlies first.
            let touchedTerms = _.map(allScores, 'term');
            // First try excluding all touched (correct, incorrect and skipped) words and see if there is anything left.
            let availableTerms = _.difference(allTerms, touchedTerms);
            // A flag indicating that all terms were touched
            let allTermsTouched = false;

            // If there are no untouched terms, try excluding only correct terms.
            if (!availableTerms.length) {
                allTermsTouched = true;
                let correctTerms = _.map(_.filter(allScores, {status: Score.status.correct}), 'term');
                availableTerms = _.difference(allTerms, correctTerms);
                // Order available terms by score / touch date, starting from an earliest date.
                availableTerms = _.intersection(touchedTerms, availableTerms);
            }

            // If no terms left anyway, no skipped or incorrect ones, throw exception
            if (!availableTerms.length) {
                throw new NoTermsException();
            }

            // If selecting among touched term (the case when all terms are touched), select the first word in the list ordered by touch date.
            // If selecting from untouched terms, choose randomly.
            let index = allTermsTouched ? 0 : _.random(0, availableTerms.length - 1);
            return availableTerms[index];
        });
};

/**
 * Translates term
 * @param {String} term
 * @returns {String}
 */
const translate = function(term) {
    return getAllPairs()[term];
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
    maxWordCount: maxWordCount,
    Word: Word,
    getRandomTerm: getRandomTerm,
    saveHistory: saveHistory,
    getHistory: getHistory,
    NoTermsException: NoTermsException
};