"use strict";

let Vocab = require('./vocab');
let Score = require('./score');
let TelegramBot = require('node-telegram-bot-api');

let Promise = require('bluebird');
let botan = require('botanio')(process.env.TELEGRAM_BOT_ANALYTICS_TOKEN);
let debug = require('debug')('bot');
let _ = require('lodash');

const useWebhook = Boolean(process.env.USE_WEBHOOK);

// TODO Differentiate between answers and commands. Use buttons for commands.
const anotherWordPattern = /^слово$|^\/start/i;
const skipPattern = /перевод|не знаю|дальше|не помню|^ещ(е|ё)|^\?$/i;
const yesPattern = /^да$|^lf$|^ага$|^fuf$|^ок$|^jr$|^ладно$|^хорошо$|^давай$/i;
const noPattern = /^нет$/i;

const states = {
    next: 'next',
    stats: 'stats',
    skip: 'skip',
    correct: 'correct',
    wrongOnce: 'wrongOnce',
    wrongTwice: 'wrongTwice'
};

// Webhook for remote, polling for local
let options = useWebhook ? {
    webHook: {
        port: process.env.PORT || 5000
    }
} : {polling: true};

let bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, options);

const main = function() {
    if (useWebhook) {
        setWebhook();
    } else {
        unsetWebhook();
    }

    // Listen for user messages
    bot.on('message', function(userMessage) {
        let chatId = userMessage.chat.id;
        let userName = getUserName(userMessage);
        getBotMessage(userMessage)
            .then(function(data) {
                return Promise.all([data, bot.sendMessage(chatId, data.message)]);
            })
            .then(function(result) {
                let data = result[0];
                if (data) {
                    Vocab.saveHistory(data, chatId);
                }
                let botMessage = result[1];

                var botMessageTextLog = botMessage.text.replace(/\n/g, ' ');
                debug(`Chat ${chatId} ${userName}, tickets: ${botMessageTextLog}.`);
            })
            .catch(function(error) {
                // No more words
                if (error instanceof Vocab.NoTermsException) {
                    return bot.sendMessage(chatId, 'Слова закончились.');
                // All other errors
                } else {
                    console.log(error && error.stack);
                }
            });
    });
};

/**
 * Generates a reply
 * @param {Object} userMessage
 * @returns {Promise}
 */
const getBotMessage = function(userMessage) {
    let chatId = userMessage.chat.id;
    let userMessageText = _.trim(userMessage.text);

    // TODO Always fetch history before response
    return Vocab.getHistory(chatId)
        .then(function(data) {
            let currentWord = data.word;
            let term = currentWord && currentWord.getTerm();
            let translation = currentWord && currentWord.getTranslation();
            let previousState = data.state;
            let promise;

            // Negative answer: look at previous state to determine the question
            if (noPattern.test(userMessageText)) {
                // TODO Show stats?
                // Promise.resolve({state: states.stats});
            // Word requested: show random word.
            } else if (anotherWordPattern.test(userMessageText) || yesPattern.test(userMessageText)) {
                promise = Vocab.Word.createRandom(chatId)
                    .then(function(word) {
                        return {word: word, message: formatWord(word), state: states.next};
                    });
            // Skipping the word
            } else if (skipPattern.test(userMessageText)) {
                // Wait for the score to save before proceeding
                promise = Score.add(currentWord, Score.status.skipped, chatId)
                    .then(function() {
                        return Vocab.Word.createRandom(chatId);
                    })
                    .then(function(nextWord) {
                        // TODO Handle the case when there is no current word / term
                        // `Не могу вспомнить слово, которое я спрашивал.\nВот следующее:\n\n${formatted}`;
                        let formatted = formatWord(nextWord);
                        let message = `${translation} → ${term}\n\nНовое слово:\n${formatted}`;
                        return {word: nextWord, message: message, state: states.skip};
                    });
            // Answer is correct
            } else if (isTermCorrect(term, userMessageText)) {
                // Wait until the score is saved before choosing the next random word.
                // Otherwise current word might be randomly chosen again, because it is not yet marked as correct.
                promise = Score.add(currentWord, Score.status.correct, chatId)
                    .then(function() {
                        return Vocab.Word.createRandom(chatId);
                    })
                    .then(function(nextWord) {
                        let formatted = formatWord(nextWord);
                        let message = `Правильно.\n\nНовое слово:\n${formatted}`;
                        return {word: nextWord, message: message, state: states.correct};
                    });
            // Answer is wrong
            } else {
                // Wait for the score to save before proceeding
                promise = Score.add(currentWord, Score.status.wrong, chatId)
                    .then(function() {
                        let nextWord = true;
                        // If this is the second mistake, show correct answer and a new word
                        if (previousState === states.wrongOnce) {
                            nextWord = Vocab.Word.createRandom(chatId);
                        }
                        return nextWord;
                    })
                    .then(function(nextWord) {
                        // TODO Handle the case when there is no current word / term
                        // User has already been wrong once, this is the second failed attempt
                        let message;
                        let state;
                        let word = currentWord;
                        if (previousState === states.wrongOnce) {
                            let formatted = formatWord(nextWord);
                            message = `${translation} → ${term}\n\nНовое слово:\n${formatted}`;
                            state = states.wrongTwice;
                            word = nextWord;
                        } else {
                            message = `Нет, неправильно.\nСделай ещё одну попытку.`;
                            state = states.wrongOnce;
                        }
                        return {word: word, message: message, state: state};
                    });
            }
            return promise;
        });
};

/**
 * Formats a word
 * @param {Word} word
 * @returns {String}
 */
const formatWord = function(word) {
    let translation = word.getTranslation();
    let clue = word.getClue();

    return `${translation}\n${clue}`;
};

const isTermCorrect = function(term, userMessageText) {
    return term && term.toLowerCase() === userMessageText.toLowerCase();
};

const getUserName = function(userMessage) {
    return `${userMessage.chat.first_name || ''} ${userMessage.chat.last_name || ''}`;
};

const setWebhook = function() {
    bot.setWebHook(`https://${process.env.APP_NAME}/?token=${process.env.TELEGRAM_BOT_TOKEN}`);
};

const unsetWebhook = function() {
    bot.setWebHook();
};

module.exports = {
    main: main
};