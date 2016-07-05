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
 * @returns {Promise}
 */
const populate = function() {
    let data = fs.readFileSync(filePath, {encoding: 'utf-8'});
    let words = [];
    let lines = _.shuffle(data.split("\n"));
    lines.forEach(function(line) {
        let term = _.trim(line.split(' ')[0]);
        // Include all words except those starting with capital letter and short words
        if (!/^[A-Z]/.test(term) && term.length >= 3) {
            words.push({term: term});
        }
    });
    debug('word count', words.length);
    return Storage.insert(collectionName, words);
};

module.exports = {
    populate: populate,
    fetchTerms: fetchTerms
};
