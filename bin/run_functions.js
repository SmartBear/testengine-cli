'use strict';

const program = require('commander');
const process = require('process');
const request = require('superagent');
const config = require('./config').config;
const util = require('./shared_utils');
const soapui = require('./soapui_project');
const fs = require('fs');
const async = require('async');
const tmp = require('tmp');
const path = require('path');
const JSZip = require("jszip");
const sprintf = require('sprintf-js').sprintf;
const WebSocket = require('ws');

module.exports.dispatcher = function (args) {
    if (args.length === 0) {
        return printModuleHelp();
    }
    let argsWithoutFilename = args.splice(1, args.length - 2);
    let options = util.optionsFromArgs(argsWithoutFilename, [
        'testcase',
        'testsuite',
        'tags',
        'output',
        'proxyHost',
        'proxyPort',
        'proxyUser',
        'proxyPassword',
        'projectPassword']);

    if (conflictingOptionsCheck(options) === false) {
        return;
    }
    switch (args[0].toLowerCase()) {
        case 'project':
            runProject(args[args.length - 1], options);
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
    util.error("Usage: " + program.name() + " run <command>");
    util.error("Commands: ");
    util.error("   project [testsuite=<name>] [testcase=<name>] [tags=(tag1,tag2)] [output=<directory>] ");
    util.error("           [projectPassword=<password>] [proxyHost=<hostname>] [proxyPort=<port>] [proxyUser=<username>]");
    util.error("           [proxyPassword=<password>] <filename>");
    util.error("   help");
}

function conflictingOptionsCheck(options) {
    if ('tags' in options) {
        if (('testsuite' in options) || ('testcase' in options)) {
            util.error('Error: tags are cannot be used together with testcase/testsuite ');
            return false;
        }
    }
    if (('testcase' in options)
        && !('testsuite' in options)) {
        util.error('Warning: Specifying testscase without testsuite can cause unpredictable results');
        return true;
    }

    return true;
}

function extractFilesFromJsonRepresentation(data, options) {
    let result = [];
    let target = data;
    if (options && ('testsuite' in options)) {
        let testSuiteName = options['testsuite'];
        if ('testSuites' in target) {
            for (let suite of target['testSuites']) {
                if (suite['name'] === testSuiteName) {
                    target = suite;
                    break;
                }
            }
        }
    }
    if (options && ('testcase' in options)) {
        let testCaseName = options['testcase'];
        if ('testCases' in target) {
            for (let testcase of target['testCases']) {
                if (testcase['name'] === testCaseName) {
                    target = testcase;
                    break;
                }
            }
        }
    }

    for (const [key, value] of Object.entries(target)) {
        if (key === 'files')
            result = result.concat(value);
        else if (Array.isArray(value) || (value.constructor === {}.constructor)) {
            result = result.concat(extractFilesFromJsonRepresentation(value));
        }
    }
    if ('cryptos' in data) {
        for (let crypto of data['cryptos']) {
            if (crypto['file'] !== null) {
                result.push(crypto['file']);
            }
        }
    }
    return result;
}

function runProject(filename, options) {
    if (fs.existsSync(filename)) {
        try {
            let project = null;
            if (!/.*[.][zZ][iI][pP]$/.test(filename)) {
                if (!fs.lstatSync(filename).isDirectory()) {
                    project = soapui.parse(filename);
                } else {
                    project = soapui.parseComposite(filename);
                }
            }
            executeProject(filename, project, options);
        } catch (err) {
            util.error(err);
        }
    } else {
        util.error("Cannot open file: " + filename);

    }
}

function getQueryStringFromOptions(options) {
    let queryString = '';
    for (let key of Object.keys(options)) {
        if (queryString.length > 0) {
            queryString += '&';
        }
        switch (key) {
            case 'testsuite':
                queryString += 'testSuiteName=' + encodeURI(options[key]);
                break;
            case 'testcase':
                queryString += 'testCaseName=' + encodeURI(options[key]);
                break;
            case 'tags': {
                let tags = options[key];
                let mr = /[("[]?([^)"\]]+)[)"\]]?/.exec(tags);
                if (mr) {
                    tags = mr[1];
                }
                queryString += 'tags=' + encodeURI(tags);
                break;
            }
            case 'projectPassword':
                queryString += 'projectPassword=' + encodeURI(options[key]);
                break;
            case 'proxyUser':
                queryString += 'proxyUsername=' + encodeURI(options[key]);
                break;
            case 'proxyUsername':
            case 'proxyPassword':
            case 'proxyHost':
            case 'proxyPort':
                queryString += key + '=' + encodeURI(options[key]);
                break;
            default:
                break;
        }
    }
    return queryString;
}

function executeProject(filename, project, options) {
    let projectFile = null;
    let isZipFile = false;
    let postUrl = config.server + '/api/v1/testjobs';
    let statusUrl = config.server + '/api/v1/testjobs';
    let contentType = 'application/xml';
    let payload = null;
    let files = null;
    let status = 'NOT_SENT';
    let jobId = null;
    let wsAuthToken = null;
    let websocket = null;

    let queryString = getQueryStringFromOptions(options);
    if (/.*[.][zZ][iI][pP]$/.test(filename)) {
        contentType = 'application/zip';
        projectFile = filename;
        isZipFile = true;
    } else {
        files = extractFilesFromJsonRepresentation(project, options);
        projectFile = (project['projectFiles'].length === 1) ? project['projectFiles'][0] : null;
    }
    async.series([
            // First create a zip file, if needed.
            //
            function (callback) {
                if (!isZipFile && ((files.length > 0) || (project['projectFiles'].length > 1))) {
                    // We depend on files, we need to create and send a zip file
                    contentType = 'application/zip';
                    let zipFile = new JSZip();
                    // First add the project
                    if (projectFile !== null) {
                        zipFile.file(path.basename(projectFile), fs.readFileSync(projectFile, null));
                    } else {
                        let projectFilesByLength = project['projectFiles'].sort((a, b) => {
                            return a.length - b.length
                        });
                        let projectRootPath = path.dirname(projectFilesByLength[0]);
                        for (let compositeProjectFile of project['projectFiles']) {
                            let inZipPath = compositeProjectFile;
                            if (inZipPath[0] === '/') {
                                inZipPath = inZipPath.substr(projectRootPath.length + 1);
                            }
                            let buffer = fs.readFileSync(compositeProjectFile, null);
                            zipFile.file(inZipPath, buffer);
                        }
                    }
                    for (let file of files) {
                        if (!fs.existsSync(file)) {
                            util.error("File missing: " + file);
                        }
                        let buffer = fs.readFileSync(file, null);
                        zipFile.file(path.basename(file), buffer);
                    }
                    let tmpName = tmp.fileSync();
                    zipFile.generateNodeStream({type: 'nodebuffer', streamFiles: true, compression: 'DEFLATE'})
                        .pipe(fs.createWriteStream(tmpName.name))
                        .on('finish', function () {
                            payload = fs.readFileSync(tmpName.name, {encoding: null});
                            fs.unlink(tmpName.name, callback);

                        });
                } else {
                    // Just send the file itself as payload
                    if (projectFile != null) {
                        payload = fs.readFileSync(projectFile, {encoding: null});
                    } else {
                        util.error("Missing project to send to server");
                    }
                    callback();
                }

            },
            // Setup the websocket
            //
            function (callback) {
                request.get(config.server + '/api/v1/token')
                    .auth(config.username, config.password)
                    .accept('text/plain')
                    .send()
                    .end((err, result) => {
                        if (err === null) {
                            let heartbeat = function () {
                                clearTimeout(this.pingTimeout);

                                // Use `WebSocket#terminate()` and not `WebSocket#close()`. Delay should be
                                // equal to the interval at which your server sends out pings plus a
                                // conservative assumption of the latency.
                                this.pingTimeout = setTimeout(() => {
                                    this.terminate();
                                    status = 'DISCONNECTED';
                                }, 300000 + 1000);
                            };
                            wsAuthToken = result.text;
                            websocket = new WebSocket(config.server.replace(/^http/, 'ws') + '/api/ws/updates?token=' + wsAuthToken);
                            websocket.on('open', heartbeat);
                            websocket.on('ping', heartbeat);
                            websocket.on('close', function () {
                                clearTimeout(this.pingTimeout);
                            });
                            websocket.on('message', function incoming(data) {
                                let jsonData = JSON.parse(data);
                                if ((jobId !== null) && (jsonData['messageType'] === 'EXECUTION_STATUS_UPDATE') && (jobId === jsonData['testJobSummary']['testjobId'])) {
                                    status = jsonData['testJobSummary']['status'];
                                }
                            });
                        } else {
                            status = 'ERROR';
                            callback(err);
                            return;
                        }
                        callback();
                    });
            },
            // Post the payload to TestEngine
            //
            function (callback) {
                let url = postUrl + ((queryString.length > 0) ? '?' + queryString : '');
                request.post(url)
                    .auth(config.username, config.password)
                    .accept('application/json')
                    .type(contentType)
                    .send(payload)
                    .end((err, result) => {
                        if (err === null) {
                            status = result.body.status;
                            if (status === 'PENDING') {
                                util.error("Project cannot be accepted, files missing:");
                                for (let missingFile of result.body['unresolvedFiles']) {
                                    util.error('   ' + missingFile['fileName']);
                                }
                            } else {
                                jobId = result.body['testjobId'];
                            }
                        } else {
                            status = 'ERROR';
                            callback(err);
                            return;
                        }
                        callback();
                    });
            },
            function (callback) {
                async.whilst(
                    function () {
                        return ((jobId !== null)
                            && ((status !== 'CANCELED')
                                && (status !== 'PENDING')
                                && (status !== 'FAILED')
                                && (status !== 'ERROR')
                                && (status !== 'FINISHED')
                                && (status !== 'DISCONNECTED')));
                    },
                    async function () {
                        await util.sleep(200);
                    },
                    function () {
                        // callback();
                        if (websocket !== null) {
                            websocket.close();
                        }
                        if (status === 'DISCONNECTED') {
                            util.error("Disconnected from TestEngine, please visit " + config.server + " for more info.")
                        }
                        callback();
                    }
                );
            }
        ],
        function (res) {
            if (res) {
                if ('code' in res) {
                    if (res.code === 'ECONNREFUSED') {
                        util.error(sprintf("Connection refused: %s:%d", res.address, res.port));
                    } else {
                        util.error(res);
                        process.exit(1);
                    }
                } else if ('status' in res) {
                    if ('message' in res.response.body) {
                        util.error("Error: " + res.response.body['message'])
                    } else {
                        util.error(res.response.text);
                    }
                    process.exit(1);
                }
            } else {
                // If status isn't CANCELED, PENDING or DISCONNECTED and we have an output directory, store reports there
                //
                util.output("TestJob result: " + status);
                if ((jobId !== null)
                    && ((status !== 'CANCELED')
                        && (status !== 'PENDING')
                        && (status !== 'DISCONNECTED'))) {
                    if ('output' in options) {
                        if (!fs.existsSync(options['output'])) {
                            fs.mkdirSync(options['output']);
                        }
                        if (fs.existsSync(options['output']) && fs.lstatSync(options['output']).isDirectory()) {
                            let reportFilename = 'junit-' + path.basename(filename);
                            if (!reportFilename.endsWith(".xml")) {
                                reportFilename += '.xml';
                            }
                            let url = statusUrl + '/' + jobId + '/report';
                            request.get(url)
                                .auth(config.username, config.password)
                                .accept('application/junit+xml')
                                .send()
                                .end((err, result) => {
                                    if (err === null) {
                                        fs.writeFileSync(options['output'] + '/' + reportFilename, result.body);
                                    } else {
                                        util.error(err);
                                        process.exit(2);
                                    }
                                })
                        } else {
                            util.error("Output folder exists but is not a directory")
                        }
                    }
                }
            }
        }
    );
}
