"use strict";

const Storage = require('./storage');
const Score = require('./score');
const User = require('./user');
const Settings = require('./settings');
const Wordnik = require('./wordnik');
const Top15000 = require('./top15000');
const Translate = require('./translate');
const Word = require('./word');

const Promise = require('bluebird');
const debug = require('debug')('vocab');
const _ = require('lodash');
const moment = require('moment');

const collectionName = 'vocab';

const wordStatus = {
    current: 'current',
    next: 'next',
    previous: 'previous'
};

let currentTranslations;

/**
 * Lifetime of vocabulary cycle
 * @type {string}
 */
const lifetime = 'week';

const lifetimeInMilliseconds = moment.duration(1, lifetime).asMilliseconds();

const cycleStartedAtKey = 'cycleStartedAt';
const previousCycleStartedAtKey = 'previousCycleStartedAt';

/**
 * Maximum number of words per iteration
 * @type {number}
 */
const maxWordCount = 100;

let nextWords;
let currentWords;

const NoTermsException = function() {};

/**
 * Returns a new random word for given chat Id
 * @param {Number} chatId Requred so not repeat words correctly answered
 * @returns {Promise}
 */
const createRandomWord = function(chatId) {
    return getRandomTerm(chatId).then(function(term) {
            return Promise.all([term, translate(term)]);
        })
        .then(function(result) {
            let term = result[0];
            let translation = result[1];
            return new Word(term, translation);
        });
};

/**
 * Returns a custom portion of word translations (e.g., first 50)
 * @param {Number} chatId
 * @returns {Promise}
 */
const getWordsPortion = function(chatId) {
    // Return a portion of word translations depending on custom word count
    return Promise.all([User.getWordCount(chatId), getCurrentTranslations()])
        .then(function(result) {
            let wordCount = result[0];
            let translations = result[1];
            let keys = _.keys(translations);
            if (wordCount && wordCount < maxWordCount) {
                keys = keys.slice(0, wordCount);
            }
            return _.pick(translations, keys);
        });
};

/**
 * Reads all words from file into an object where key is the English term and value is a corresponding term in another language
 * @returns {Promise.<Object>}
 */
const getCurrentTranslations = function() {
    if (!currentTranslations) {
        return getCurrentWords()
            .then(function(currentWords) {
                currentTranslations = {};
                _.each(currentWords, function(word) {
                    currentTranslations[word.term] = word.translation;
                });
                return currentTranslations;
            });
    } else {
        return Promise.resolve(currentTranslations);
    }
};

/**
 * Returns a random word from list
 * @param {Number} chatId Requred so not repeat words correctly answered
 * @returns {String}
 */
const getRandomTerm = function(chatId) {
    return getWordsPortion(chatId)
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
 * @returns {Promise.<String>}
 */
const translate = function(term) {
    return getCurrentTranslations()
        .then(function(translations) {
            let translation = translations[term];
            if (translation) {
                return translation;
            // If translation is not found in current words, try all vocabulary
            } else {
                return Storage.find(collectionName, {term: term})
                    .then(function(result) {
                        return result.length ? result[0].translation : null;
                    })
            }
        });
};

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
        return Wordnik.fetchTerms(maxWordCount);
    } else {
        return getNextOrderNumber()
            .then(function(number) {
                // Fetching 100 terms starting from number of words already in dictionary to avoid duplicates
                return Top15000.fetchTerms(maxWordCount, number);
            });
    }
};

/**
 * Fetches words and translations from remote service.
 * @returns {Promise.<Array.<Word>>}
 */
const fetchWords = function() {
    return fetchTerms()
        .then(function(words) {
            return Promise.all([words, Translate.fetch(words)]);
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
const saveWords = function(words, status) {
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
                delete word._id;
                word.order = order;
                order ++;
            });
            debug('wordsEntry', wordsEntry);
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
                            return Promise.all([words, saveWords(words, wordStatus.next)]);
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
 * @param {String} text User message text containing next words
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
                // TODO Warn if words repeat / were used in previous cycles
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
            return Promise.all([editedWords, saveWords(nextWords, wordStatus.next)]);
        })
        .then(function(result) {
            return result[0];
        });
};

const resetNextWords = function() {
    nextWords = null;
    return Storage.remove(collectionName,  {status: wordStatus.next});
};

const resetCurrentWords = function() {
    currentWords = null;
    currentTranslations = null;
    return Storage.remove(collectionName,  {status: wordStatus.current});
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
                return currentWords;
            });
    } else {
        return Promise.resolve(currentWords);
    }
};

const replaceCurrentWords = function(nextWords) {
    return resetCurrentWords()
        .then(function() {
            return saveWords(nextWords, wordStatus.current);
        })
        .then(function() {
            currentWords = nextWords;
            return currentWords;
        });
};

const currentToPrevious = function() {
    return Storage.update(collectionName, {status: wordStatus.current}, {$set: {status: wordStatus.previous}});
};

const formatWords = function(words) {
    return _.map(words, function(word, i) {
        let number = !_.isUndefined(word.number) ? word.number : i + 1;
        let line = `${number}. ${word.term} → ${word.translation}`;
        return word.edited ? `<strong>${line}</strong>` : line;
    }).join("\n")
};

/**
 * @returns {Promise.<Boolean>}
 */
const shouldStartCycle = function() {
    // Monday, 10 am
    let shouldStartAfterMoment = moment().startOf(lifetime).add(10, 'hours');
    return Settings.getOne(cycleStartedAtKey)
        .then(function(startedAtDate) {
            let startedAtMoment = startedAtDate && moment(startedAtDate);
            // Check if the last time the cycle was started is before the beginning of current cycle
            let shouldStart = !startedAtMoment || startedAtMoment.isBefore(shouldStartAfterMoment);
            debug(shouldStart ? 'should start a new cycle' : 'should not start a new cycle');
            return shouldStart;
        });
};

/**
 *
 * @returns {Promise.<Array.<Word>>}
 */
const manageCycle = function() {
    debug('starting cycle');

    // Change status of current words to previous
    return currentToPrevious()
        .then(function() {
            return getNextWords();
        })
        .then(function(nextWords) {
            // Replace current words with next words
            return replaceCurrentWords(nextWords);
        })
        .then(function() {
            // Finally reset next words and then fetch a new portion of next words
            return resetNextWords();
        })
        .then(function() {
            return Promise.all([getNextWords(), Settings.getOne(cycleStartedAtKey)]);
        })
        .then(function(result) {
            let nextWords = result[0];
            let previousCycleStartedAt = result[1];
            let promises = [nextWords, Settings.set(cycleStartedAtKey, new Date())];
            // Save previous cycle date, if any
            if (previousCycleStartedAt) {
                promises.push(Settings.set(previousCycleStartedAtKey, previousCycleStartedAt));
            }
            // At this point everything is well: save this cycle time and previous cycle time
            return Promise.all(promises);
        })
        .then(function(result) {
            // Return next words
            return result[0];
        });
};

module.exports = {
    lifetime: lifetime,
    maxWordCount: maxWordCount,
    createRandomWord: createRandomWord,
    getWordsPortion: getWordsPortion,
    getRandomTerm: getRandomTerm,
    fetchTerms: fetchTerms,
    fetchWords: fetchWords,
    translate: translate,
    NoTermsException: NoTermsException,
    getNextWords: getNextWords,
    getCurrentWords: getCurrentWords,
    updateNextWords: updateNextWords,
    formatWords: formatWords,
    shouldStartCycle: shouldStartCycle,
    manageCycle: manageCycle
};