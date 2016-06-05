"use strict";

require('dotenv').config({silent: true});
let debug = require('debug')('app');

let moment = require('moment');
moment.locale('ru');

let Bot = require('./bot');
Bot.main();
