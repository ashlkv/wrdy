// Every week, fetch 100 new english words and store them in a database with a "current" or "next" flag.
// From wordnik
//
// Simultaneously save those words in a database to check for duplicates later
// TODO Pitfall: Those choosing to learn 20/50/70 words a week instead of 100 will always miss on the rest 80/50/30 words.
// TODO Solution: Assing a global/passthrough order number to each word (1, 2, and then 101, 102) and store word range for each user.
// Translate words into Russian with either google translate or yandex translate (choose which yields better results)
// Google is better, although not good. Google is paid ($20 per million characters, which is approx $0.1 a month for wrdy)
// Yandex is free (if less than 10 million characters).
// TODO Use yandex translate for development, switch to google for production
// Show the words for bot admin to review
// TODO Which is the best interface for words review?

// http://api.wordnik.com:80/v4/words.json/randomWords?hasDictionaryDef=false&minCorpusCount=0&maxCorpusCount=-1&minDictionaryCount=1&maxDictionaryCount=-1&minLength=5&maxLength=-1&limit=10&api_key=a2a73e7b926c924fad7001ca3111acd55af2ffabf50eb4ae5

'use strict';

const Storage = require('./storage');
const Wordnik = require('./wordnik');

const Promise = require('bluebird');
const request = require('request-promise');
const debug = require('debug')('dictionary');
const _ = require('lodash');

const yandexTranslateUrl = 'https://translate.yandex.net/api/v1.5/tr.json/translate';

const wordStatus = {
    current: 'current',
    next: 'next',
    previous: 'previous'
};

let nextWords;
let currentWords;

/**
 * @typedef {Object} WordnikWord
 * @property {Number} id Wordnik id
 * @property {string} word The word
 */

/**
 * @typedef {Object} Word
 * @property {string} term English term
 * @property {string} translation Russian translation
 */

/**
 * @returns {Promise.<Array.<Word>>}
 */
const fetchTerms = function() {
    // TODO Wordnik returning words like wrist-drop, declawing and Pyhrric is a lot of fun, but better replace it with a different service.
    if (process.env.TERMS_PROVIDER === 'wordnik') {
        return Wordnik.fetchTerms();
    } else {
        return fetchVocabularyTerms();
    }
};

/**
 * @returns {Promise.<Array.<Word>>}
 */
const fetchVocabularyTerms = function() {
    // TODO Implement
    return [];
};


/**
 * Translates terms with Google Translate service
 * @param {Array.<Word>} words A list of words to translate
 * @returns {Promise.<Array.<String>>} translations
 */
const googleTranslate = function(words) {
    // TODO Implement
    return [];
};

/**
 * Translates terms with Yandex Translate service
 * @param {Array.<Word>} words A list of words to translate
 * @param {Array.<Word>} words A list of words to translate
 * @returns {Promise.<Array.<String>>} translations
 */
const yandexTranslate = function(words) {
    let terms = _.map(words, 'term');
    return request({
        method: 'GET',
        url: yandexTranslateUrl,
        qs: {
            key: process.env.YANDEX_TRANSLATE_API_KEY,
            text: terms.join("\n"),
            lang: 'en-ru'
        },
        json: true
    })
    .then(function(response) {
        debug('yandexTranslate response', response);
        if (response && response.text && response.text.length) {
            return response.text[0].split("\n");
        } else {
            throw new Error('Failed to translate words: translation is empty.');
        }
    })
    .catch(function() {
        throw new Error('Failed to translate words: unexpected response.');
    });
};

/**
 * Translates terms
 * @param {Array.<Word>} words A list of words to translate
 * @returns {Promise.<Array.<String>>} translations
 */
const translate = function(words) {
    // Google is a better translate service, although not perfect. Google is paid ($20 per million characters,
    // which is approx $0.1 a month for wrdy in production mode)
    // Yandex is free (if less than 10 million characters).
    // Using Yandex Translate for development, switching to Google Translate for production.
    if (process.env.TRANSLATE_PROVIDER === 'google') {
        return googleTranslate(words);
    } else {
        return yandexTranslate(words);
    }
};

/**
 * Fetches words and translations from remote service.
 * @returns {Promise.<Array.<Word>>}
 */
const fetchWords = function() {
    return fetchTerms()
        .then(function(words) {
            return Promise.all([words, translate(words)]);
        })
        .then(function(result) {
            let words = result[0];
            let translations = result[1];
            debug('fetchWords words', words);
            debug('fetchWords translations', translations);
            let translatedWords = [];
            // TODO Keep external word id (?)
            _.forEach(words, function(word, i) {
                translatedWords.push({
                    term: word.term,
                    translation: translations[i]
                });
            });
            return translatedWords;
        });
};

/**
 * Stores words in local storage with a status, if given.
 * @param {Array.<Word>} words
 * @param {String} status
 * @returns {Promise.<Array.<Word>>}
 */
const storeWords = function(words, status) {
    if (status) {
        _.forEach(words, function(word) {
            word.status = status;
        });
    }
    // TODO Add order number
    return Storage.insert(Storage.collectionName.dictionary, words);
};

/**
 * Returns words and translations. Fetches if necessary.
 * @returns {Promise.<Array.<Word>>}
 */
const getNextWords = function() {
    // Check next words cache
    if (!nextWords) {
        return Storage.find(Storage.collectionName.dictionary, {status: wordStatus.next}, 'order')
            .then(function(words) {
                if (!words.length) {
                    return fetchWords()
                        .then(function(words) {
                            return Promise.all([words, storeWords(words, wordStatus.next)]);
                        })
                        .then(function(result) {
                            return result[0];
                        });
                } else {
                    return words;
                }
            })
            .then(function(words) {
                nextWords = words;
                return words;
            });
    } else {
        return Promise.resolve(nextWords);
    }
};

/**
 * Returns current words and translations.
 * @returns {Promise.<Array.<Word>>}
 */
const getCurrentWords = function() {
    // Check current words cache
    if (!currentWords) {
        return Storage.find(Storage.collectionName.dictionary, {status: wordStatus.current}, 'order')
            .then(function(words) {
                if (!words.length) {
                    throw new Error('No words in dictionary for current timespan.');
                }
                currentWords = words;
                return words;
            });
    } else {
        return Promise.resolve(currentWords);
    }
};

module.exports = {
    getNextWords: getNextWords,
    getCurrentWords: getCurrentWords
};