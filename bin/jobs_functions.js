'use strict';
const util = require('./shared_utils');
const utility = require('util');
const request = require('superagent');
const config = require('./config').config;
const sprintf = require('sprintf-js').sprintf;
const fs = require('fs');
const process = require('process');

module.exports = {
    dispatcher: function (args) {
        if (args.length === 0) {
            printModuleHelp();
            process.exit(1);
        }

        switch (args[0].toLowerCase()) {
            case 'list': {
                let options = util.optionsFromArgs(args.splice(1), [
                    'format', 'user', 'status', 'limit']);
                listJobs(options);
                break;
            }
            case 'cancel': {
                if (args.length < 2) {
                    printModuleHelp();
                    process.exit(1);
                } else {
                    terminateTestJob(args[1]);
                }
                break;
            }
            case 'delete': {
                if (args.length < 2) {
                    printModuleHelp();
                    process.exit(1);
                } else {
                    deleteTestJob(args[1]);
                }
                break;
            }
            case 'status': {
                if (args.length < 2) {
                    printModuleHelp();
                    process.exit(1);
                } else {
                    reportForTestJob(args[1]);
                }
                break;
            }
            case 'report': {
                if (args.length < 4) {
                    printModuleHelp();
                    process.exit(1);
                } else {
                    let jobId = args[args.length - 1];
                    let options = util.optionsFromArgs(args.splice(1), [
                        'format', 'output', 'reportFileName']);
                    reportForTestJob(jobId, options['output'], options['reportFileName'], ('format' in options) ? options['format'] : 'junit');
                }
                break;
            }
            case 'printreport': {
                if (args.length < 2) {
                    printModuleHelp();
                    process.exit(1);
                } else {
                    const testJobId = args[args.length - 1];
                    printReport(testJobId);
                }
                break;
            }
            case 'prune': {
                let argumentCount = args.length;
                let options = util.optionsFromArgs(args.splice(1), [
                    'before']);
                if ((argumentCount > 1) && (!('before' in options))) {
                    util.output('Unknown argument to testengine jobs prune.');
                }
                pruneJobs(options);
                break;
            }
            case 'help':
                printModuleHelp();
                break;
            default:
                util.printErrorAndExit("Unknown operation");
        }
    },
    reportForTestJob: reportForTestJob
};

function printModuleHelp() {
    util.error("Usage: testengine jobs <command>");
    util.error("Commands: ");
    util.error("   list [format=text/csv/json] [user=username|list of usernames] [status=status|(list of statuses)]");
    util.error("   report output=<directory> [reportFileName=<filename>] [format=junit/excel/json/pdf] <testjobId>");
    util.error("   printReport <testjobId>");
    util.error("   status <testjobId>");
    util.error("   cancel <testjobId>");
    util.error("   delete <testjobId>");
    util.error("   prune [before=YYYY-MM-DD]");
    util.error("   help");
}

function terminateTestJob(testjobId) {
    let url = config.server + '/api/v1/testjobs' + '/' + testjobId;
    util.output('Canceling job: ' + testjobId);
    request.delete(url)
        .auth(config.username, config.password)
        .accept('application/junit+xml')
        .send()
        .end((err, result) => {
            if (err !== null) {
                if (('status' in err) && ('message' in result.body)) {
                    util.printErrorAndExit(err['status'] + ': ' + result.body['message']);
                } else {
                    util.printErrorAndExit(err);
                }
            } else {
                util.output('Successfully canceled job');
            }
        })
}

function deleteTestJob(testjobId) {
    let url = config.server + '/api/v1/testjobs' + '/' + testjobId + '/delete';
    util.output('Deleting job: ' + testjobId);
    request.delete(url)
        .auth(config.username, config.password)
        .accept('application/junit+xml')
        .send()
        .end((err, result) => {
            if (err !== null) {
                if (('status' in err) && ('message' in result.body)) {
                    switch (err['status']) {
                        case 404:
                            util.printErrorAndExit(`${err['status']}: Testjob not found`);
                            break;
                        default:
                            util.printErrorAndExit(err['status'] + ': ' + result.body['message']);
                    }
                } else {
                    util.printErrorAndExit(err);
                }
            } else {
                util.output('Successfully deleted job');
            }
        })
}

function printReport(testjobId) {
    const endPoint = config.server + '/api/v1/testjobs';
    const url = endPoint + '/' + testjobId + '/report';
    util.output(`Printing report for ${testjobId} ...`);
    request.get(url)
        .auth(config.username, config.password)
        .accept('application/json')
        .send()
        .end((err, res) => {
            if (err !== null) {
                if (err.status === 404) {
                    util.printErrorAndExit(`Testjob with id ${testjobId} not found`);
                } else {
                    util.printErrorAndExit(err.status + ': ' + err.message);
                }
            }
            if (res) {
                const jsonReport = res.body;
                util.output(utility.inspect(jsonReport, {showHidden: false, depth: null}));
            }
        });
}

function reportForTestJob(testjobId, outputFolder, fileName, format) {
    let endPoint = config.server + '/api/v1/testjobs';
    let reportFilename;
    let contentType = 'application/json';

    if (outputFolder) {
        if (!fs.existsSync(outputFolder)) {
            fs.mkdirSync(outputFolder);
        }
        if (fs.existsSync(outputFolder) && fs.lstatSync(outputFolder).isDirectory()) {
            switch (format) {
                case 'junit':
                    contentType = 'application/junit+xml';
                    reportFilename = fileName ? fileName : ('junit-' + testjobId);
                    if (!reportFilename.endsWith(".xml")) {
                        reportFilename += '.xml';
                    }
                    break;
                case 'excel':
                    contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
                    reportFilename = fileName ? fileName : ('report-' + testjobId);
                    reportFilename += '.xlsx';
                    break;
                case 'json':
                    contentType = 'application/json';
                    reportFilename = fileName ? fileName : ('report-' + testjobId);
                    reportFilename += '.json';
                    break;
                case 'pdf':
                    contentType = 'application/pdf';
                    reportFilename = fileName ? fileName : ('report-' + testjobId);
                    reportFilename += '.pdf';
                    break;
                default:
                    util.printErrorAndExit("Invalid format: " + format);
            }
        } else {
            util.printErrorAndExit("Output folder exists but is not a directory");
        }
    }
    if (contentType !== '') {
        let url = endPoint + '/' + testjobId + '/report';
        let stream;
        let reportFileName;
        if (outputFolder) {
            reportFileName = outputFolder + '/' + reportFilename;
            stream = fs.createWriteStream(reportFileName);
        }
        let req = request.get(url)
            .auth(config.username, config.password)
            .accept(contentType)
            .on('response', function (response) {
                if (response.status !== 200) {
                    if (reportFileName) {
                        fs.unlinkSync(reportFileName)
                    }
                    util.printErrorAndExit(`Status code: ${response.status}`);
                } else {
                    util.output('Report created successfully');
                }
            }).send();
        if (stream) {
            req.pipe(stream);
        } else {
            req.end((err, result) => {
                if (err === null) {
                    util.output('Status of job ' + testjobId + ': ' + result.body.status);
                } else {
                    if (('status' in err) && ('message' in result.body)) {
                        util.printErrorAndExit(err['status'] + ': ' + result.body['message']);
                    } else {
                        util.printErrorAndExit(err);
                    }
                }
            })
        }
    }
}

function listJobs(options) {
    let format = (options && 'format' in options) ? options['format'] : 'text';
    let limit = (options && 'limit' in options) ? options['limit'] : 100;
    request.get(config.server + '/api/v1/testjobs?fetch=' + limit)
        .auth(config.username, config.password)
        .accept('application/json')
        .send()
        .end((err, res) => {
            if (err !== null) {
                util.printErrorAndExit(err.status + ': ' + err.message);
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
                    util.printErrorAndExit('Unrecognized format');
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
            url += '?before=' + encodeURIComponent(tmpDate);
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
                        util.printErrorAndExit(sprintf("Connection refused: %s:%d", err.address, err.port));
                    } else {
                        util.printErrorAndExit(sprintf("Error: %s:%s", err.code, err.message));
                    }
                } else {
                    if ('message' in res.body)
                        util.printErrorAndExit(res.body['message']);
                    else
                        util.printErrorAndExit(err.status + ': ' + err.message);
                }
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
        return '"Status", "Project", "User", "Submitted", "Submitted Millis", "Time in Queue (ms)", "Run time (ms)", "Test Suite", "Test Case", "Security Test", "Tags", "Job Id"';
    } else {
        return sprintf('"%s", "%s", "%s", "%s", %d, %d, %d, "%s", "%s", "%s", "%s", "%s"',
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
            'securityTestName' in data.executionParameters ?
                util.csvQuoteQuotes(data.executionParameters['securityTestName']) : '',
            'tags' in data.executionParameters ?
                util.csvQuoteQuotes(data.executionParameters['tags'].join(', ')) : '',
            util.csvQuoteQuotes(data.testjobId),
        );
    }
}

function textLine(data, header = false) {
    if (header) {
        return sprintf('%-10s %-20s %-10s %-25s %-13s %-11s %-13s %-30s %-20s %-20s %-20s %-20s %-20s' +
            '\n==========================================================================================================================================================================================================================',
            "Status", "Project", "User", "Submitted", "Submitted ms", "Queued (ms)", "Run time (ms)", "Test Suite", "Test Case", "Security Test", "Tags", "Job Id", "Priority");
    } else {
        return sprintf('%-10s %-20s %-10s %-25s %13d %11d %13d %-30s %-20s %-20s %-20s %-20s %-20s',
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
            'securityTestName' in data.executionParameters ?
                util.csvQuoteQuotes(data.executionParameters['securityTestName']) : '',
            'tags' in data.executionParameters ?
                util.csvQuoteQuotes(data.executionParameters['tags'].join(', ')) : '',
            util.csvQuoteQuotes(data.testjobId),
            data.priorityJob,
        );
    }
}
