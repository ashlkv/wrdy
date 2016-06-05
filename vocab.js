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
    let dots = this.term.replace(/[a-z]/gi, '⋅').split('');
    dots[randomIndex] = randomLetter;
    return dots.join('');
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
 * Stores last term for given chat
 * @param {Word} word
 * @param {Number} chatId
 * @returns {Promise}
 */
const saveCurrentWord = function(word, chatId) {
    return Storage
        .remove(Storage.collectionName.currentWord, {chatId: chatId})
        .then(function() {
            return Storage.insert(Storage.collectionName.currentWord, {
                term: word.getTerm(),
                date: moment().toDate(),
                chatId: chatId
            });
        });
};

/**
 * Returns current word for given chat
 * @param {Number} chatId
 * @returns {Promise}
 */
const getCurrentWord = function(chatId) {
    return Storage
            .find(Storage.collectionName.currentWord, {chatId: chatId})
            .then(function(entries) {
                let word = entries.length ? new Word(entries[0].term) : null;
                // TODO There may be no translation for the term
                // If there is a word with translation, return the word. Otherwise, nothing.
                return word && word.getTranslation() ? word : null;
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

module.exports = {
    Word: Word,
    getRandomTerm: getRandomTerm,
    saveCurrentWord: saveCurrentWord,
    getCurrentWord: getCurrentWord,
    NoTermsException: NoTermsException
};