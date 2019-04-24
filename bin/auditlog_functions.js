'use strict';

const program = require('commander');
const request = require('superagent');
const config = require('./config').config;
const sprintf = require('sprintf-js').sprintf;
const util = require('./shared_utils');

module.exports.dispatcher = function (args) {
    if (args.length === 0)
        return printModuleHelp();

    switch (args[0].toLowerCase()) {
        case 'dump':
            if (args.length < 1) {
                util.error("Usage: " + program.name() + " auditlog dump [format=text/csv/json>] [date=[YYYY-MM-DD[:YYYY-MM-DD]] ] [user=username]");
            } else {
                let options = util.optionsFromArgs(args.splice(1), [
                    'format', 'date', 'user']);
                dumpAuditLog(options)
            }

            break;
        case 'help':
            printModuleHelp();
            break;
        default:
            util.error("Unknown operatation");
            break;
    }
};

function printModuleHelp() {
    util.error("Usage: " + program.name() + " auditlog <command>");
    util.error("Commands: ");
    util.error("   dump [format=text/csv/json>] [date=[YYYY-MM-DD[:YYYY-MM-DD]] ] [user=username]");
    util.error("   help");
}

function dumpAuditLog(options) {
    let format = (options && 'format' in options) ? options['format'] : 'text';
    let username = (options && 'user' in options) ? options['user'] : null;
    let range = (options && 'date' in options) ? extractDateRange(options['date']) : null;

    let url = config.server + '/api/v1/auditlog?';
    if (username !== null)
        url += 'userName=' + encodeURIComponent(username);
    if (range !== null) {
        if (username !== null)
            url += '&';
        let tmpDate = range[0].toISOString();
        tmpDate = tmpDate.replace('.000Z', 'Z');
        url += 'from=' + encodeURIComponent(tmpDate);
        tmpDate = range[1].toISOString();
        tmpDate = tmpDate.replace('.000Z', 'Z');
        url += '&to=' + encodeURIComponent(tmpDate)
    }

    request.get(url)
        .auth(config.username, config.password)
        .accept('application/json')
        .type('application/json')
        .send()
        .end((err, result) => {
            if (err !== null) {
                if ('code' in err) {
                    if (err.code === 'ECONNREFUSED') {
                        util.error(sprintf("Connection refused: %s:%d", err.address, err.port));
                    } else {
                        util.error(sprintf("Error: %s:%s", err.code, err.message));
                    }
                } else {
                    util.output(err.status + ': ' + err.message);
                }
                return 1
            }
            if (format === 'json') {
                util.output(JSON.stringify(result.body));
            } else {
                printAuditLogHeader(format);
                for (let line of result.body) {
                    printAuditLogLine(line, format);
                }
            }
        });
}

function printAuditLogHeader(format) {
    switch (format) {
        case 'text':
            util.output(sprintf("%-25s %-20s %-20s %s",
                'Timestamp',
                'User',
                'EventType',
                'Event')
            );
            util.output('--------------------------------------------------------------------------------------------------');
            break;
        case 'csv':
            util.output(sprintf("%s,%s,%s,%s,%s,%s",
                'Timestamp',
                'Milliseconds',
                'User',
                'EventType',
                'Event',
                'EventData')
            );
            break;
    }
}

function printAuditLogLine(line, format) {
    switch (format) {
        case 'text':
            util.output(sprintf("%-25s %-20s %-20s %s",
                new Date(line['eventTime']).toLocaleString(),
                ('userName' in line && line['userName']) ? line['userName'] : '',
                line['eventType'],
                humanReadableAuditlogString(line))
            );
            break;
        case 'csv': {
            let date = new Date(line['eventTime']);
            util.output(sprintf('"%s",%d,"%s","%s","%s","%s"',
                date.toLocaleString(),
                date.getTime(),
                ('userName' in line && line['userName']) ? line['userName'] : '',
                line['eventType'],
                util.csvQuoteQuotes(humanReadableAuditlogString(line)),
                util.csvQuoteQuotes(JSON.stringify(line['eventData'])))
            );
            break;
        }
    }
}

function humanReadableAuditlogString(data) {
    switch (data['eventType']) {
        case 'SERVER_STARTED':
            return "Server started";

        case 'USER_DELETED':
            return (util.booleanValue(data['eventData']['isAdmin']) ? 'Admin u' : 'U') + 'ser "'
                + data['eventData']['targetUser'] + '" deleted.';

        case 'USER_CREATED':
            return (util.booleanValue(data['eventData']['isAdmin']) ? 'Admin u' : 'U') + 'ser "'
                + data['eventData']['targetUser'] + '" created.';

        case 'USER_UPDATED': {
            let passwordChanged = util.booleanValue(data['eventData']['passwordChanged']);
            let roleChanged = util.booleanValue(data['eventData']['roleChanged']);
            let result = 'User "' + data['eventData']['targetUser'] + '" was updated. ';
            result += roleChanged
                ? 'admin=' + util.booleanValue(data['eventData']['isAdmin'])
                : '';
            if (roleChanged && passwordChanged) {
                result += ', p';
            } else if (passwordChanged) {
                result += 'P';
            }
            if (passwordChanged)
                result += 'assword changed';
            return result;
        }

        case 'EXECUTION_CANCELED':
        case 'TESTJOB_CANCELED':
            return sprintf("Job %s was canceled ", data['eventData']['executionId']);

        case 'PASSWORD_CHANGED':
            return "Changed their password";

        case 'DATABASE_PURGE':
            return sprintf("Purged job history before %s. %d jobs purged", data['eventData']['purgedBefore'], data['eventData']['purgedJobsCount']);

        default:
            return data['eventType'] + ' with params: ' + JSON.stringify(data);
    }
}

function extractDateRange(possibleDateString) {

    let singleDateRE = new RegExp(/^([0-9]{4})-([0-9]{2})-([0-9]{2})$/);
    let dateRangeRE = new RegExp(/^([0-9]{4})-([0-9]{2})-([0-9]{2}):([0-9]{4})-([0-9]{2})-([0-9]{2})/);
    let result = null;

    let matchResult = possibleDateString.match(singleDateRE);
    if (matchResult && matchResult.length === 4) {
        let date1 = new Date(parseInt(matchResult[1]), parseInt(matchResult[2]) - 1, parseInt(matchResult[3]));
        let date2 = new Date(parseInt(matchResult[1]), parseInt(matchResult[2]) - 1, parseInt(matchResult[3]), 23, 59, 59, 0);
        result = [date1, date2];
    } else {
        matchResult = possibleDateString.match(dateRangeRE);
        if (matchResult && matchResult.length === 7) {
            let date1 = new Date(parseInt(matchResult[1]), parseInt(matchResult[2]) - 1, parseInt(matchResult[3]));
            let date2 = new Date(parseInt(matchResult[4]), parseInt(matchResult[5]) - 1, parseInt(matchResult[6]), 23, 59, 59, 0);
            result = [date1, date2];
        }
    }
    return result
}
