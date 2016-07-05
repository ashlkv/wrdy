'use strict';

const Storage = require('./storage');
const Wordnik = require('./wordnik');
const Top15000 = require('./top15000');
// TODO Perhaps maxWordCount constant should be moved from vocab module
const Vocab = require('./vocab');

const Promise = require('bluebird');
const request = require('request-promise');
const debug = require('debug')('dictionary');
const _ = require('lodash');

const yandexTranslateUrl = 'https://translate.yandex.net/api/v1.5/tr.json/translate';

const collectionName = 'dictionary';

const wordStatus = {
    current: 'current',
    next: 'next',
    previous: 'previous'
};

let nextWords;
let currentWords;

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
        return Wordnik.fetchTerms(Vocab.maxWordCount);
    } else {
        return getNextOrderNumber()
            .then(function(number) {
                // Fetching 100 terms starting from number of words already in dictionary to avoid duplicates
                return Top15000.fetchTerms(Vocab.maxWordCount, number);
            });
    }
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
            let translatedWords = [];
            // TODO Keep external word id (?)
            _.forEach(words, function(word, i) {
                translatedWords.push({
                    term: word.term,
                    translation: translations[i],
                    number: i + 1
                });
            });
            return translatedWords;
        });
};

/**
 * Returns the next order number, zero-based
 * @returns {Promise.<Number>}
 */
const getNextOrderNumber = function() {
    return Storage.count(collectionName);
};

/**
 * Stores words in local storage with a status, if given.
 * @param {Array.<Word>} words
 * @param {String} status
 * @returns {Promise.<Array.<Word>>}
 */
const storeWords = function(words, status) {
    return getNextOrderNumber()
        // Adding order number
        .then(function(order) {
            // Cloning the collection to avoid changing the source while preparing for storage
            let wordsEntry = _.cloneDeep(words);
            _.forEach(wordsEntry, function(word) {
                if (status) {
                    word.status = status;
                }
                delete word.edited;
                word.order = order;
                order ++;
            });
            return Storage.insert(collectionName, wordsEntry);
        });
};

/**
 * Returns words and translations. Fetches if necessary.
 * @returns {Promise.<Array.<Word>>}
 */
const getNextWords = function() {
    // Check next words cache
    if (!nextWords) {
        return Storage.find(collectionName, {status: wordStatus.next}, 'order')
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
 *
 * @param {String} text User message text containing
 */
const updateNextWords = function(text) {
    return getNextWords()
        .then(function(nextWords) {
            let lines = text.split("\n");
            let editedWords = [];
            _.forEach(lines, function(line) {
                let match = line.match(/^(\d{1,3})\.?\s?([a-z]+)?([\s→]+)?([а-я]+)?/i);
                let number = match[1] ? parseInt(match[1]) : null;
                let term = match[2];
                let translation = match[4];
                if (_.isNumber(number) && number > 0) {
                    let word = nextWords[number - 1];
                    word.edited = true;
                    if (term) {
                        word.term = term;
                    }
                    if (translation) {
                        word.translation = translation;
                    }
                    editedWords.push(word);
                }
            });

            return Promise.all([nextWords, editedWords, Storage.remove(collectionName, {status: wordStatus.next})]);
        })
        .then(function(result) {
            let nextWords = result[0];
            let editedWords = result[1];
            return Promise.all([editedWords, storeWords(nextWords, wordStatus.next)]);
        })
        .then(function(result) {
            return result[0];
        });
};

/**
 * Returns current words and translations.
 * @returns {Promise.<Array.<Word>>}
 */
const getCurrentWords = function() {
    // Check current words cache
    if (!currentWords) {
        return Storage.find(collectionName, {status: wordStatus.current}, 'order')
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

const formatWords = function(words) {
    return _.map(words, function(word, i) {
        let number = !_.isUndefined(word.number) ? word.number : i + 1;
        let line = `${number}. ${word.term} → ${word.translation}`;
        return word.edited ? `<strong>${line}</strong>` : line;
    }).join("\n")
};

module.exports = {
    getNextWords: getNextWords,
    getCurrentWords: getCurrentWords,
    updateNextWords: updateNextWords,
    formatWords: formatWords
};