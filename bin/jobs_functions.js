'use strict';
const util = require('./shared_utils');
const request = require('superagent');
const config = require('./config').config;
const sprintf = require('sprintf-js').sprintf;

module.exports.dispatcher = function (args) {
    if (args.length === 0)
        return printModuleHelp();

    switch (args[0].toLowerCase()) {
        case 'list': {
            let options = util.optionsFromArgs(args.splice(1), [
                'format', 'user', 'status']);
            listJobs(options);
            break;
        }
        case 'cancel': {
            if (args.length < 2) {
                printModuleHelp();
            } else {
                terminateTestJob(args[1]);
            }
            break;
        }
        case 'prune': {
            let argumentCount = args.length;
            let options = util.optionsFromArgs(args.splice(1), [
                'before']);
            if ((argumentCount > 1) && (!('before' in options)) ) {
                util.output('Unknown argument to testengine jobs prune.');
            }
            pruneJobs(options);
            break;
        }
        case 'help':
            printModuleHelp();
            break;
        default:
            util.error("Unknown operatation");
            break;
    }
};

function printModuleHelp() {
    util.error("Usage: testengine jobs <command>");
    util.error("Commands: ");
    util.error("   list [format=text/csv/json] [user=username|list of usernames] [status=status|(list of statuses)]");
    util.error("   cancel <testjobId>");
    util.error("   prune [before=YYYY-MM-DD]");
    util.error("   help");
}

function terminateTestJob(testjobId) {
    let url = config.server + '/api/v1/testjobs'+ '/' + testjobId;
    util.output('Canceling job: '+testjobId);
    request.delete(url)
        .auth(config.username, config.password)
        .accept('application/junit+xml')
        .send()
        .end((err, ) => {
            if (err !== null) {
                util.error(err);
            } else {
                util.output('Successfully canceled job');
            }
        })
}

function listJobs(options) {
    let format = (options && 'format' in options) ? options['format'] : 'text';
    request.get(config.server + '/api/v1/testjobs')
        .auth(config.username, config.password)
        .accept('application/json')
        .send()
        .end((err, res) => {
            if (err !== null) {
                util.output(err.status + ': ' + err.message);
                return 1
            }
            let dataFromServer = res.body;
            if (Array.isArray(dataFromServer) && 'status' in options) {
                dataFromServer = reduceArrayToSpecificStatuses(dataFromServer, options['status'])
            }

            if (Array.isArray(dataFromServer) && 'user' in options) {
                dataFromServer = reduceArrayToSpecificUsers(dataFromServer, options['user'])
            }
            switch (format.toLocaleLowerCase()) {
                case 'csv':
                    dumpArrayAsCSV(dataFromServer);
                    break;
                case 'text':
                    dumpArrayAsText(dataFromServer);
                    break;
                case 'json':
                    dumpArrayAsJson(dataFromServer);
                    break;
                default:
                    util.error('Unrecognized format');
                    break;
            }
        });
}

function pruneJobs(options) {
    let url = config.server + '/api/v1/testjobs';
    if ('before' in options) {
        let singleDateRE = new RegExp(/^([0-9]{4})-([0-9]{2})-([0-9]{2})$/);
        let matchResult = options['before'].match(singleDateRE);
        if (matchResult && matchResult.length === 4) {
            let date = new Date(parseInt(matchResult[1]), parseInt(matchResult[2]) - 1, parseInt(matchResult[3]));
            let tmpDate = date.toISOString();
            tmpDate = tmpDate.replace('.000Z', 'Z');
            url += '?before='+encodeURIComponent(tmpDate);
        }
    }
    request.delete(url)
        .auth(config.username, config.password)
        .accept('application/json')
        .send()
        .end((err, res) => {
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
            let jobsPruned = JSON.parse(res.request.response.body);
            util.output("Pruned " + jobsPruned + " jobs from the database.")
        })
}

function reduceArrayToSpecificStatuses(jsonData, statuses) {
    let mr = /[("[]?([^)"\]]+)[)"\]]?/.exec(statuses);
    if (mr) {
        statuses = mr[1];
    }
    statuses = statuses.toUpperCase();
    statuses = statuses.split(',');
    jsonData = jsonData.filter(
        (obj) => {
            return (statuses.indexOf(obj['status']) >= 0)
        }
    );
    return jsonData;
}

function reduceArrayToSpecificUsers(jsonData, users) {
    let mr = /[("[]?([^)"\]]+)[)"\]]?/.exec(users);
    if (mr) {
        users = mr[1];
    }
    users = users.toLocaleLowerCase();
    users = users.split(',');
    jsonData = jsonData.filter(
        (obj) => {
            let lowerUser = obj['userName'].toLowerCase();
            return (users.indexOf(lowerUser) >= 0)
        }
    );
    return jsonData;
}

function dumpArrayAsCSV(data) {
    if (Array.isArray(data)) {
        util.output(csvLine(null, true));
        data = data.sort((a, b) => {
            return ((a.startTime < b.startTime) ? -1 : (a.startTime > b.startTime ? 1 : 0))
        });
        for (let job of data) {
            util.output(csvLine(job));
        }
    }
}

function dumpArrayAsText(data) {
    if (Array.isArray(data)) {
        util.output(textLine(null, true));
        data = data.sort((a, b) => {
            return ((a.startTime < b.startTime) ? -1 : (a.startTime > b.startTime ? 1 : 0))
        });
        for (let job of data) {
            util.output(textLine(job));
        }
    }
}

function dumpArrayAsJson(jsonData) {
    if (Array.isArray(jsonData)) {
        util.output(JSON.stringify(jsonData));
    }
}

function csvLine(data, header = false) {
    if (header) {
        return '"Status", "Project", "User", "Submitted", "Submitted Millis", "Time in Queue (ms)", "Run time (ms)", "Test Suite", "Test Case", "Tags", "Job Id"';
    } else {
        return sprintf('"%s", "%s", "%s", "%s", %d, %d, %d, "%s", "%s", "%s", "%s"',
            util.csvQuoteQuotes(data.status),
            util.csvQuoteQuotes(data.projectName),
            util.csvQuoteQuotes(data.userName),
            util.csvQuoteQuotes(new Date(data.submitTime).toLocaleString()),
            new Date(data.submitTime).getTime(),
            data.queueTime,
            data.totalTime - data.queueTime,
            'testSuiteName' in data.executionParameters ?
                util.csvQuoteQuotes(data.executionParameters['testSuiteName']) : '',
            'testCaseName' in data.executionParameters ?
                util.csvQuoteQuotes(data.executionParameters['testCaseName']) : '',
            'tags' in data.executionParameters ?
                util.csvQuoteQuotes(data.executionParameters['tags'].join(', ')) : '',
            util.csvQuoteQuotes(data.testjobId),
        );
    }
}

function textLine(data, header = false) {
    if (header) {
        return sprintf('%-10s %-20s %-10s %-25s %-13s %-11s %-13s %-30s %-20s %-20s %-20s' +
            '\n==========================================================================================================================================================================================================================',
            "Status", "Project", "User", "Submitted", "Submitted ms", "Queued (ms)", "Run time (ms)", "Test Suite", "Test Case", "Tags", "Job Id");
    } else {
        return sprintf('%-10s %-20s %-10s %-25s %13d %11d %13d %-30s %-20s %-20s %-20s',
            util.csvQuoteQuotes(data.status),
            util.csvQuoteQuotes(data.projectName),
            util.csvQuoteQuotes(data.userName),
            util.csvQuoteQuotes(new Date(data.submitTime).toLocaleString()),
            new Date(data.submitTime).getTime(),
            data.queueTime,
            data.totalTime - data.queueTime,
            'testSuiteName' in data.executionParameters ?
                util.csvQuoteQuotes(data.executionParameters['testSuiteName']) : '',
            'testCaseName' in data.executionParameters ?
                util.csvQuoteQuotes(data.executionParameters['testCaseName']) : '',
            'tags' in data.executionParameters ?
                util.csvQuoteQuotes(data.executionParameters['tags'].join(', ')) : '',
            util.csvQuoteQuotes(data.testjobId),
        );
    }
}
