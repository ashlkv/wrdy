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
const skipPattern = /перевод|не знаю|дальше|не помню|^ещ(е|ё)$^\?/i;
const yesPattern = /^да$|^ага$|^ок$|^ладно$|^хорошо$|^давай$/i;
const noPattern = /^нет$/i;

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
        let currentWord;
        getBotMessage(userMessage)
            .then(function(data) {
                currentWord = data.word;
                return bot.sendMessage(chatId, data.message);
            })
            .then(function(botMessage) {
                Vocab.saveCurrentWord(currentWord, chatId);
                var botMessageTextLog = botMessage.text.replace(/\n/g, ' ');
                debug(`Chat ${chatId} ${userName}, tickets: ${botMessageTextLog}.`);
            })
            .catch(function(error) {
                // No more words for a timebeing
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

    let promise;

    // Answer requested: get current word, if any.
    if (noPattern.test(userMessageText)) {
        // TODO Show stats?
    // Word requested: show random word.
    } else if (anotherWordPattern.test(userMessageText) || yesPattern.test(userMessageText)) {
        promise = Vocab.Word.createRandom(chatId)
            .then(function(word) {
                return {word: word, message: formatWord(word)};
            });
    // User answer to be checked or hint request
    } else {
        promise = Vocab.getCurrentWord(chatId)
            .then(function(currentWord) {
                let term = currentWord && currentWord.getTerm();
                let translation = currentWord && currentWord.getTranslation();
                let promise;
                // Skipping the word
                if (skipPattern.test(userMessageText)) {
                    // Wait for the score to save before proceeding
                    promise = Score.add(currentWord, Score.status.skipped, chatId)
                        .then(function() {
                            // TODO Handle the case when there is no current word / term
                            // `Не могу вспомнить слово, которое я спрашивал.\nВот следующее:\n\n${formatted}`;
                            let message = `${translation} → ${term}\n\nПродолжим?`;
                            return {word: currentWord, message: message};
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
                            let message = formatWord(nextWord);
                            return {word: nextWord, message: message};
                        });
                // Answer is wrong
                } else {
                    // Wait for the score to save before proceeding
                    promise = Score.add(currentWord, Score.status.wrong, chatId)
                        .then(function() {
                            // TODO Handle the case when there is no current word / term
                            let message = `${translation} → ${term}\n\nПродолжим?`;
                            return {word: currentWord, message: message};
                        });
                }
                return promise;
            });
    }

    return promise;
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
    return term && term === userMessageText;
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