'use strict';

const _ = require('lodash');

/**
 *
 * @param {String} term Vocabulary term. If not specified, creates a word with a random term
 * @param {String} translation
 * @constructor
 */
let Word = function(term, translation) {
    this.term = term;
    this.translation = translation;
};

/**
 * Translates the term
 * @returns {String}
 */
Word.prototype.getTranslation = function() {
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

module.exports = Word;