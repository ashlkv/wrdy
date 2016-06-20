"use strict";

const _ = require('lodash');
const debug = require('debug')('language');

const Vocab = require('./vocab');

module.exports = {
    /**
     * Parses string with digits or words into a number
     * @param {String} numberString
     * @param {Number} defaultValue
     * @returns {Number}
     */
    parseNumberString: function(numberString, defaultValue) {
        numberString = _.trim(numberString);
        let map = {
            'десять': 10,
            'ltcznm': 10,
            'двадцать': 20,
            'ldflwfnm': 20,
            'пятьдесят': 50,
            'gznmltczn': 50,
            'сто': 100,
            'cnj': 100
        };
        let number = _.find(map, (value, key) => {
            return numberString.indexOf(key) !== -1;
        });
        if (!number) {
            number = parseInt(numberString, 10);
        }
        return number || defaultValue;
    },

    numberCaption: function(number, one, two, five) {
        let digits = number ? number.toString() : '';
        let lastDigit = parseInt(digits.substr(digits.length - 1, 1), 10);
        let lastTwoDigits = parseInt(digits.substr(digits.length - 2, 2), 10);
        if (lastTwoDigits > 10 && lastTwoDigits < 20) {
            return five;
        }
        else if (lastDigit === 1) {
            return one;
        }
        else if (lastDigit === 2 || lastDigit === 3 || lastDigit === 4) {
            return two;
        }
        else {
            return five;
        }
    }
};