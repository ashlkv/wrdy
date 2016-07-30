"use strict";

const Vocab = require('./vocab');
const History = require('./history');
const Score = require('./score');
const User = require('./user');
const Language = require('./language');

const TelegramBot = require('node-telegram-bot-api');
const Promise = require('bluebird');
const botan = require('botanio')(process.env.TELEGRAM_BOT_ANALYTICS_TOKEN);
const debug = require('debug')('bot');
const _ = require('lodash');

const useWebhook = Boolean(process.env.USE_WEBHOOK);

// TODO Differentiate between answers and commands. Use buttons for commands.
// Sometimes first message text is "/start Start" instead of just "/start": test with regexp
const startPattern = /^\/start/i;
const helpPattern = /^\/help$/i;
const statsPattern = /^\/stats?$/i;
const wordCountValuePattern = /^(\d+|десять|двадцать|пятьдесят|сто|ltcznm|ldflwfnm|gznmltczn|cnj) ?(слов|слова|слово|ckjd|ckjdf|ckjdj)?$/i;
const wordCountCommandPattern = /^\/count$/i;
const anotherWordPattern = /^слово$/i;
const skipPattern = /перевод|не знаю|дальше|не помню|^ещ(е|ё)|^\?$/i;
const yesPattern = /^да$|^lf$|^ага$|^fuf$|^ок$|^jr$|^ладно$|^хорошо$|^давай$/i;

const helpText = '/count — количество слов\n«?» — показать перевод\n«слово» — новое слово\n/stats — статистика';
const adminHelpText = '/vocab — показать слова для следующей недели';

const cyclePattern = /^\/cycle/i;
const nextVocabPattern = /^\/vocab/i;
const editWordPattern = /^\d{1,3}\.?\s?[a-zа-я]+/i;

/**
 * Available states. State is a summary of user message recieved (e.g., a command, a wrong annswer or a next word request).
 * @type {{next: string, stats: string, skip: string, correct: string, wrongOnce: string, wrongTwice: string, command: string}}
 */
const states = {
    next: 'next',
    stats: 'stats',
    skip: 'skip',
    correct: 'correct',
    wrongOnce: 'wrongOnce',
    wrongTwice: 'wrongTwice',
    wrongThreeTimes: 'wrongThreeTimes',
    wordCountCommand: 'wordCountCommand',
    wordCountValue: 'wordCountValue',
    helpCommand: 'helpCommand',
    nextVocabCommand: 'nextVocabCommand',
    unknown: 'unknown'
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

        // Handle cycle command (admin only). Handled separately because it does not need to reply to a sender chat id, but instead send messages to all admin users.
        if (cyclePattern.test(userMessage.text) && User.isAdmin(chatId)) {
            handleCycle()
                .catch(function(error) {
                    console.log(error && error.stack);
                });
        // Handle all other messages
        } else {
            getBotMessage(userMessage)
                .then(function(data) {
                    let options = _.extend({parse_mode: 'HTML'}, data.options);
                    let promises = [data];
                    if (data.message) {
                        promises.push(bot.sendMessage(chatId, data.message, options));
                    }
                    return Promise.all(promises);
                })
                .then(function(result) {
                    let data = result[0];
                    if (data) {
                        History.save(data, chatId);
                    }
                    let botMessage = result[1];

                    let botMessageTextLog = botMessage ? botMessage.text.replace(/\n/g, ' ') : null;
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
        }

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

    return History.get(chatId)
        .then(function(data) {
            let currentWord = data.word;
            let translation = currentWord && currentWord.getTranslation();
            return Promise.all([data, translation]);
        })
        .then(function(result) {
            let data = result[0];
            let currentWord = data.word;
            let term = currentWord && currentWord.getTerm();
            let translation = result[1];
            // A summary of user message recieved prior to current user message.
            let previousState = data.state;
            let promise;

            // Show next week vocabulary (admin only)
            if (nextVocabPattern.test(userMessageText) && User.isAdmin(chatId)) {
                promise = Vocab.getNextWords()
                    .then(function(words) {
                        let formatted = Vocab.formatWords(words);
                        let message = `Слова на следующую неделю:\n${formatted}`;
                        return {message: message, state: states.nextVocabCommand};
                    });
                analytics(userMessage, '/vocab');
            // Edit next week vocabulary (admin only)
            } else if (editWordPattern.test(userMessageText) && User.isAdmin(chatId)) {
                promise = Vocab.updateNextWords(userMessageText)
                    .then(function(editedWords) {
                        let formatted = Vocab.formatWords(editedWords);
                        return {message: editedWords.length ? `Ок, обновил:\n${formatted}` : '(Ничего не изменилось)'};
                    });
                analytics(userMessage, 'edit vocab');
            // Asking for help
            } else if (helpPattern.test(userMessageText)) {
                promise = {message: helpText + (User.isAdmin(chatId) ? `\n${adminHelpText}` : ''), state: states.helpCommand};
                analytics(userMessage, '/help');
            // Starting the conversation or explicitly setting a word count
            } else if (startPattern.test(userMessageText) || wordCountCommandPattern.test(userMessageText)) {
                let message = `Сколько слов в неделю хочешь учить? 20 / 50 / ${Vocab.maxWordCount}?`;
                let options = {
                    reply_markup: JSON.stringify({
                        keyboard: [
                            ['10', '20', '50', '100']
                        ],
                        resize_keyboard: true,
                        one_time_keyboard: true
                    })
                };
                promise = {message: message, options: options, state: states.wordCountCommand};
                analytics(userMessage, startPattern.test(userMessageText) ? '/start' : '/count');
            // Word count value
            } else if (previousState === states.wordCountCommand && wordCountValuePattern.test(userMessageText)) {
                let numberString = userMessageText.match(wordCountValuePattern)[1];
                let number = Language.parseNumberString(numberString, Vocab.maxWordCount);
                number = number > Vocab.maxWordCount ? Vocab.maxWordCount : number;
                promise = User.setWordCount(number, chatId)
                    .then(function() {
                        return Promise.all([Vocab.createRandomWord(chatId), Score.count(chatId)]);
                    })
                    .then(function(result) {
                        let nextWord = result[0];
                        let scoreCount = result[1];
                        let formatted = formatWord(nextWord);
                        let numberCaption = Language.numberCaption(number, 'слово', 'слова', 'слов');
                        let newWordSentence = scoreCount === 0 ? `Первое слово:\n${formatted}` : `Следующее слово:\n${formatted}`;
                        let message = `Ок, ${number} ${numberCaption} в неделю.\n\n${newWordSentence}`;
                        return {word: nextWord, message: message, state: states.wordCountValue};
                    });
                analytics(userMessage, 'set word count');
            // Requesting stats
            } else if (statsPattern.test(userMessageText)) {
                promise = Score.getStats(chatId, Vocab.lifetime)
                    .then(function(message) {
                        message = message ? `Статистика за неделю:\n${message}` : 'Статистики пока нет';
                        return {message: message, state: states.stats};
                    });
                analytics(userMessage, '/stats');
            // Word requested: show random word.
            } else if (anotherWordPattern.test(userMessageText) || yesPattern.test(userMessageText)) {
                promise = Vocab.createRandomWord(chatId)
                    .then(function(word) {
                        return {word: word, message: formatWord(word), state: states.next};
                    });
                analytics(userMessage, 'new word');
            // Skipping the word
            } else if (skipPattern.test(userMessageText)) {
                // Wait for the score to save before proceeding
                promise = Score.add(currentWord, Score.status.skipped, chatId)
                    .then(function() {
                        return Vocab.createRandomWord(chatId);
                    })
                    .then(function(nextWord) {
                        let message = '';
                        if (translation && term) {
                            message = `${translation} → ${term}\n\n`;
                        }
                        let formatted = formatWord(nextWord);
                        message += `Новое слово:\n${formatted}`;
                        return {word: nextWord, message: message, state: states.skip};
                    });
                analytics(userMessage, 'skip');
            // Answer is correct
            } else if (isTermCorrect(term, userMessageText)) {
                // Wait until the score is saved before choosing the next random word.
                // Otherwise current word might be randomly chosen again, because it is not yet marked as correct.
                promise = Score.add(currentWord, Score.status.correct, chatId)
                    .then(function() {
                        return Vocab.createRandomWord(chatId);
                    })
                    .then(function(nextWord) {
                        let formatted = formatWord(nextWord);
                        let message = `👍\n\nНовое слово:\n${formatted}`;
                        return {word: nextWord, message: message, state: states.correct};
                    });
                analytics(userMessage, 'correct');
            // Answer is wrong
            } else if (currentWord) {
                // Wait for the score to save before proceeding
                promise = Score.add(currentWord, Score.status.wrong, chatId)
                    .then(function() {
                        let nextWord = true;
                        // If this is the third mistake, show correct answer and a new word
                        if (previousState === states.wrongTwice) {
                            nextWord = Vocab.createRandomWord(chatId);
                        }
                        return nextWord;
                    })
                    .then(function(nextWord) {
                        // TODO Handle the case when there is no current word / term
                        let message;
                        let state;
                        let word = currentWord;
                        // User has already been wrong twice, this is the third failed attempt
                        if (previousState === states.wrongTwice) {
                            let formatted = formatWord(nextWord);
                            message = `${translation} → ${term}\n\nНовое слово:\n${formatted}`;
                            state = states.wrongThreeTimes;
                            word = nextWord;
                        // Retry
                        } else {
                            let formatted = currentWord.getClue();
                            message = `Нет, неправильно.\nСделай ещё одну попытку:\n${formatted}`;
                            state = previousState === states.wrongOnce ? states.wrongTwice : states.wrongOnce;
                        }
                        return {word: word, message: message, state: state};
                    });
                analytics(userMessage, 'wrong');
            } else {
                promise = {state: states.unknown};
                analytics(userMessage, 'unclear');
            }
            return promise;
        });
};

/**
 * Handles vocabulary cycle: replaces current words with next words and sends a new portion of vocabulary to all admins fo review
 * @returns {Promise}
 */
const handleCycle = function() {
    return Vocab.shouldStartCycle()
        .then(function(result) {
            if (result) {
                return Vocab.cycle()
                    // Send message to admins with a list of next week words to review and correct within this week.
                    .then(function(nextWords) {
                        let formatted = Vocab.formatWords(nextWords);
                        let message = `Привет. Вот слова на следующую неделю. Исправь, если нужно:\n${formatted}`;
                        let promises = [];
                        // Sending words for review to all admin users
                        _.forEach(User.getAdminIds(), function(adminId) {
                            promises.push(bot.sendMessage(adminId, message, {parse_mode: 'HTML'}));
                        });
                        // TODO Send stats message to all users
                        return Promise.all(promises);
                    });
            } else {
                return true;
            }
        });
};

/**
 * Formats a word
 * @param {Word} word
 * @returns {Promise.<String>}
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

const analytics = function(userMessage, event) {
    botan.track(userMessage, event);
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