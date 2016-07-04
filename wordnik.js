'use strict';

const Promise = require('bluebird');
const request = require('request-promise');
const debug = require('debug')('wordnik');
const _ = require('lodash');

const hasDictionaryDef = true;
const randomWordsUrl = 'http://api.wordnik.com:80/v4/words.json/randomWords';
// Larger numbers yield simpler words. Min corpus count of 15000 gives decent results.
const minCorpusCount = 18000;
const maxCorpusCount = -1;
const minLength = 5;

/*
CONVERSATION
Adverbs 50 14%
Adjectives 25 7%
Verbs 125 36%
Nouns 150 43%

ACADEMIC PROSE
Adverbs 30 6%
Adjectives 100 19%
Verbs 100 19%
Nouns 300 57%
*/
/**
 * Objects where keys are parts of speech and values are frequency (in percent). Frequencies sum should equal 100 percent.
 */
const partsOfSpeechFrequency = {
    adverb: 7,
    adjective: 15,
    verb: 30,
    noun: 48
};

if (_.sum(_.values(partsOfSpeechFrequency)) !== 100) {
    throw new Error(`Parts of speech frequency sum should equal 100 percent`);
}

/**
 * @typedef {Object} WordnikWord
 * @property {Number} id Wordnik id
 * @property {string} word The word
 */

/**
 * Calculate part of speech word limits
 * @param {Number} count Total word count
 * @returns {Array.<Number>}
 */
const calculateLimits = function(count) {
    return _.map(_.values(partsOfSpeechFrequency), function(value) {
        return Math.round(count / 100 * value);
    });
};

/**
 * @param {Number} count Total random words count
 * @returns {Promise.<Array.<Word>>}
 */
const fetchTerms = function(count) {
    let partsOfSpeech = _.keys(partsOfSpeechFrequency);
    let limits = calculateLimits(count);
    let promises = [];

    _.forEach(partsOfSpeech, function(partOfSpeech, i) {
        promises.push(fetchPartOfSpeech(partOfSpeech, limits[i]));
    });

    return Promise.all(promises)
        .then(function(words) {
            words = _.flatten(words);
            // Shuffle words so that parts of speech are not grouped together and make sure the returned array is of required length
            return _.shuffle(words).slice(0, count);
        });
};

/**
 * @param {String} partOfSpeech
 * @param {Number} limit
 * @returns {Promise.<Array.<Word>>}
 */
const fetchPartOfSpeech = function(partOfSpeech, limit) {
    return request({
            method: 'GET',
            url: randomWordsUrl,
            qs: {
                hasDictionaryDef: hasDictionaryDef,
                minCorpusCount: minCorpusCount,
                maxCorpusCount: maxCorpusCount,
                minLength: minLength,
                includePartOfSpeech: partOfSpeech,
                limit: limit || 25,
                api_key: process.env.WORDNIK_API_KEY
            },
            json: true
        })
        .then(function(response) {
            if (!response.length) {
                throw new Error('Failed to fetch words: response empty.');
            } else {
                debug('fetchTerms response', response);
                return _.map(response, function(element) {
                    return {term: element.word};
                });
            }
        })
        .catch(function() {
            throw new Error('Failed to fetch words: unexpected response.');
        });
};

module.exports = {
    calculateLimits: calculateLimits,
    fetchTerms: fetchTerms
};