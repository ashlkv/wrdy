'use strict';

const Promise = require('bluebird');
const debug = require('debug')('top15000');
const _ = require('lodash');
const fs = require('fs');

const Storage = require('./storage');
const collectionName = 'top15000';

/**
 * Path to vocabulary file
 * @type {string}
 */
const filePath = './data/top15000.txt';

const fetchTerms = function(count, offset) {
    return Storage.find(collectionName, null, null, count, offset);
};

/**
 * Writes words from file into database
 * @returns {Promise}
 */
const populate = function() {
    let data = fs.readFileSync(filePath, {encoding: 'utf-8'});
    let words = [];
    let lines = data.split("\n");
    lines.forEach(function(line) {
        // Hadling lines like: domain сфера (интересов),
        // where "domain" should go in term, and "сфера (интересов)" should hgo in translation
        let match = _.trim(line).split(' ');
        let term = match.shift();
        let translation = match.join(' ');
        // Include all words except short words
        if (term.length >= 3) {
            let word = {term: term};
            if (translation) {
                word.translation = translation;
            }
            words.push(word);
        }
    });
    // Shuffle words but make sure that words with translation bubble to the top.
    words = _.shuffle(words);
    words = _.sortBy(words, 'translation');

    return Storage.remove(collectionName)
        .then(function() {
            return Storage.insert(collectionName, words);
        });
};

module.exports = {
    populate: populate,
    fetchTerms: fetchTerms
};
