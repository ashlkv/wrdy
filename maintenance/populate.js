"use strict";

require('dotenv').config({silent: true});

let moment = require('moment');
moment.locale('ru');

let Top15000 = require('./../top15000');
let Vocab = require('./../vocab');

// Populate database with words from top15000 in case terms provider is set to top15000 and reset vocabulary completely.
// Also set a legit cycle start date, which is the beginning of the current week regardless of todays date.
Top15000.populate()
    .then(function() {
        return Vocab.clear();
    })
    .then(function() {
        return Vocab.resetCycleStartedAt();
    })
    .then(function() {
        return Vocab.cycle();
    })
    .then(function() {
        let cycleStartMoment = Vocab.getCycleStartMoment();
        return Vocab.setCycleStartedAt(cycleStartMoment.toDate());
    })
    .then(function() {
        console.log('Done');
    })
    .catch(function(error) {
        console.log(error && error.stack);
    });