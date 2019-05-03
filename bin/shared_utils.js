'use strict';

const config = require('./config').config;
const process = require('process');

module.exports.csvQuoteQuotes = function (stringValue) {
    return stringValue.replace(/["]/g, '""');
};

module.exports.booleanValue = function (unknownValue) {
    if (typeof unknownValue === 'string')
        return unknownValue.toLowerCase() === 'true';
    if (typeof unknownValue === 'boolean')
        return unknownValue;
    return false;
};


module.exports.output = function (message, appendNewLine=true) {
    if (!config.quiet) {
        process.stdout.write(message);
        if (appendNewLine)
            process.stdout.write('\n');
    }
};

module.exports.error = function (message) {
    process.stderr.write(message + '\n');
};

module.exports.sleep = function (ms) {
    return new Promise(resolve => {
        setTimeout(resolve, ms)
    })
};

module.exports.optionsFromArgs = function (args, validArguments = null) {
    let ret = {};
    let state = 'key';

    let currentKey = null;
    let currentValue = null;

    const bracketStartRE = /^[(["].*/;
    const bracketEndRE = /.*[^)\]"]$/;

    for (let arg of args) {
        switch (state) {
            case 'key': {
                if (arg.indexOf('=') < 0) {
                    currentKey = arg;
                    state = 'equal';
                } else {
                    let re = new RegExp('^([a-zA-Z]+)[\\s]*([=]?)[\\s]*(.*)$');
                    let mr = re.exec(arg);
                    currentKey = mr[1];
                    if (mr[3].length === 0) {
                        if (mr[2].length === 0) {
                            state = 'equal';
                        } else {
                            state = 'value';
                        }
                    } else {
                        currentValue = mr[3];
                        if (bracketStartRE.test(currentValue) && bracketEndRE.test(currentValue))
                            state = 'value';
                    }
                }
                break;
            }
            case 'equal': {
                if (arg === '=') {
                    state = 'value';
                } else {
                    let re = new RegExp('^([=]?)[\\s]*(.*)$');
                    let mr = re.exec(arg);
                    if (mr[2].length === 0) {
                        state = 'value';
                    } else {
                        currentValue = mr[2];
                        if (bracketStartRE.test(currentValue) && bracketEndRE.test(currentValue))
                            state = 'value';
                        else
                            state = 'key';
                    }
                }
                break;
            }
            case 'value':
                if (currentValue === null)
                    currentValue = '';
                currentValue += arg;

                if (!(bracketStartRE.test(currentValue) && bracketEndRE.test(currentValue)))
                    state = 'key';
                break;
        }
        if (state === 'key' && (currentKey !== null) && (currentValue !== null)) {
            if (currentValue.toLowerCase() === 'false')
                currentValue = false;
            else if (currentValue.toLowerCase() === 'true')
                currentValue = true;
            if ((validArguments !== null) && !validArguments.includes(currentKey)) {
                module.exports.error("Unkown parameter: " + currentKey);
            } else {
                ret[currentKey] = currentValue;
            }
            currentKey = null;
            currentValue = null;
        }
    }
    return ret;
};

