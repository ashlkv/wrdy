'use strict';

const Promise = require('bluebird');
const request = require('request-promise');
const debug = require('debug')('translate');
const _ = require('lodash');

const yandexTranslateUrl = 'https://translate.yandex.net/api/v1.5/tr.json/translate';

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
const fetch = function(words) {
    // Google is a better translate service, although not perfect. Google is paid ($20 per million characters,
    // which is approx $0.1 a month for wrdy in production mode)
    // Yandex is free (if less than 10 million characters).
    // Using Yandex Translate for development, switching to Google Translate for production.
    if (process.env.TRANSLATE_PROVIDER === 'google') {
        debug('requesting google translate');
        return googleTranslate(words);
    } else {
        debug('requesting yandex translate');
        return yandexTranslate(words);
    }
};

module.exports = {
    fetch: fetch
};