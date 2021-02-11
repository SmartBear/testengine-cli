'use strict';

const process = require('process');
const request = require('superagent');
const config = require('./config').config;
const util = require('./shared_utils');
const readyapi = require('./readyapi_project');
const fs = require('fs');
const async = require('async');
const tmp = require('tmp');
const path = require('path');
const JSZip = require("jszip");
const sprintf = require('sprintf-js').sprintf;
const jobs = require('./jobs_functions');
const WebSocket = require('ws');
const utility = require('util');

module.exports.dispatcher = function (args) {
    if (args.length === 0) {
        return printModuleHelp();
    }
    let argsWithoutFilename = args.splice(1, args.length - 2);
    let options = util.optionsFromArgs(argsWithoutFilename, [
        'testcase',
        'async',
        '=skipdeps',
        'priorityJob',
        'testsuite',
        'securitytest',
        'tags',
        'environment',
        '=printReport',
        'output',
        'reportFileName',
        'format',
        'timeout',
        'proxyHost',
        'proxyPort',
        'proxyUser',
        'proxyPassword',
        'projectPassword']);

    conflictingOptionsCheck(options);
    switch (args[0].toLowerCase()) {
        case 'project':
            runProject(args[args.length - 1], options);
            break;
        case 'help':
            printModuleHelp();
            break;
        default:
            util.printErrorAndExit("Unknown operation");
    }
};

function printModuleHelp() {
    util.error("Usage: testengine run <command>");
    util.error("Commands: ");
    util.error("   project [testsuite=<name>] [async] [skipdeps] [priorityJob] [testcase=<name>] [securitytest=<name>] [timeout=<seconds>] [tags=(tag1,tag2)] [output=<directory>] [printReport] [reportFileName=<filename>] [format=junit/excel/json/pdf] [environment=<environment name>]");
    util.error("           [projectPassword=<password>] [proxyHost=<hostname>] [proxyPort=<port>] [proxyUser=<username>]");
    util.error("           [proxyPassword=<password>] <filename>");
    util.error("   help");
}

function conflictingOptionsCheck(options) {
    if (('securitytest' in options) && (('testcase' in options) || ('testsuite' in options))) {
        util.printErrorAndExit('Error: Parameters testsuite and testcase are not allowed when securitytest is used');
    }
    if ('tags' in options) {
        if (('testsuite' in options) || ('testcase' in options)) {
            util.printErrorAndExit('Error: tags cannot be used together with testcase/testsuite ');
        }
    }
    if (('testcase' in options)
        && !('testsuite' in options)) {
        util.error('Warning: Specifying testscase without testsuite can cause unpredictable results');
    }
}

function extractFilesFromJsonRepresentation(data, options) {
    let result = [];
    if (data === null)
        return result;
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

    if ( (!('disabled' in target)) || (!target['disabled'])) {
        for (const [key, value] of Object.entries(target)) {
            if (key === 'files')
                result = result.concat(value);
            else if (Array.isArray(value) || (value.constructor === {}.constructor)) {
                result = result.concat(extractFilesFromJsonRepresentation(value));
            }
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
                    project = readyapi.parse(filename);
                } else {
                    project = readyapi.parseComposite(filename);
                }
            }
            executeProject(filename, project, options);
        } catch (err) {
            util.error(err);
            if (typeof err === 'string') {
                if (err.match(/is encrypted/)) {
                    if (!('projectPassword' in options))
                        util.printErrorAndExit('Error: Submitting encrypted projects without projectPassword will not work');
                    else
                        executeProject(filename, null, options);
                }
            }
        }
    } else {
        util.error("Cannot open file: " + filename);
        process.exit(1)
    }
}

function getQueryStringFromOptions(options) {
    let queryString = '';
    for (let key of Object.keys(options)) {
        let queryStringPart = '';
        switch (key) {
            case 'testsuite':
                queryStringPart = 'testSuiteName=' + encodeURI(options[key]);
                break;
            case 'testcase':
                queryStringPart = 'testCaseName=' + encodeURI(options[key]);
                break;
            case 'securitytest':
                queryStringPart = 'securityTestName=' + encodeURI(options[key]);
                break;
            case 'tags': {
                let tags = options[key];
                let mr = /[("[]?([^)"\]]+)[)"\]]?/.exec(tags);
                if (mr) {
                    tags = mr[1];
                }
                queryStringPart = 'tags=' + encodeURI(tags);
                break;
            }
            case 'proxyUser':
                queryStringPart = 'proxyUsername=' + encodeURI(options[key]);
                break;
            case 'environment':
            case 'projectPassword':
            case 'timeout':
            case 'proxyPassword':
            case 'proxyHost':
            case 'proxyPort':
            case 'priorityJob':
                queryStringPart = key + '=' + encodeURI(options[key]);
                break;
            case 'async':
                queryStringPart = key + '=' + encodeURI(options[key]);
                break;
            default:
                break;
        }
        if (queryStringPart.length > 0) {
            if (queryString.length > 0) {
                queryString += '&';
            }
            queryString += queryStringPart;
        }
    }
    return queryString;
}

function executeProject(filename, project, options) {
    let projectFile = null;
    let isZipFile = false;
    let endPoint = config.server + '/api/v1/testjobs';
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
        if (!('skipdeps' in options) && (project !== null)) {
            files = extractFilesFromJsonRepresentation(project, options);
            projectFile = (project['projectFiles'].length === 1) ? project['projectFiles'][0] : null;
        } else {
            files=[];
            projectFile = filename;
        }
    }
    process.on("exit", function () {
        //graceful shutdown
        if (jobId) {
            util.output("To cancel the job started, please use:\n  testengine jobs cancel " + jobId);
        }
    });

    let missingFiles = false;
    async.series([
            // First create a zip file, if needed.
            //
        function (callback) {
                if (!isZipFile && (project !== null) && ((files.length > 0) || (project['projectFiles'].length > 1))) {
                    // We depend on files, we need to create and send a zip file
                    let projectRootPath = '';
                    contentType = 'application/zip';
                    let zipFile = new JSZip();
                    // First add the project
                    if (projectFile !== null) {
                        zipFile.file(path.basename(projectFile), fs.readFileSync(projectFile, null));
                    } else {
                        let projectFilesByLength = project['projectFiles'].sort((a, b) => {
                            return a.length - b.length
                        });
                        util.output(path.resolve(projectFilesByLength[0]));
                        let fullPathUpToComposite = path.dirname(path.resolve(projectFilesByLength[0]));
                        projectRootPath = path.dirname(path.resolve(projectFilesByLength[0]));
                        projectRootPath = path.basename(fullPathUpToComposite);
                        fullPathUpToComposite = path.dirname(fullPathUpToComposite);

                        for (let compositeProjectFile of project['projectFiles']) {
                            let inZipPath = path.resolve(compositeProjectFile);
                            inZipPath = inZipPath.substr(fullPathUpToComposite.length);
                            let buffer = fs.readFileSync(compositeProjectFile, null);
                            zipFile.file(inZipPath, buffer);
                        }
                    }
                    for (let file of files) {
                        if (!fs.existsSync(file)) {
                            file = path.resolve(project['resourceRoot'], file);
                            if (!fs.existsSync(file)) {
                                util.error("Referenced file missing: " + file);
                                missingFiles = true;
                                continue;
                            }
                        }
                        let buffer = fs.readFileSync(file, null);
                        let inZipPath = (projectRootPath.length > 0 ? projectRootPath + '/' : '') + path.basename(file);
                        zipFile.file(inZipPath, buffer);
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
                        missingFiles = true;
                    }
                    callback();
                }

            },
            // Setup the websocket
            //
            function (callback) {
                if (missingFiles) {
                    callback();
                    return;
                }
                if ('async' in options) {
                    callback();
                    return;
                }
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
                                if ( ( (jsonData['messageType'] === 'TESTJOB_STATUS_UPDATE') || (jsonData['messageType'] === 'EXECUTION_STATUS_UPDATE')) && (jobId !== null) && (jobId === jsonData['testJobSummary']['testjobId'])  ) {
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
                let url = endPoint + ((queryString.length > 0) ? '?' + queryString : '');
                if (missingFiles) {
                    callback();
                    return;
                }

                request.post(url)
                    .auth(config.username, config.password)
                    .accept('application/json')
                    .type(contentType)
                    .send(payload)
                    .end((err, result) => {
                        if (err === null) {
                            status = result.body.status;
                            jobId = result.body['testjobId'];
                            if (config.verbose || options.async) {
                                util.output("TestJoB ID: " + jobId);
                            }
                            
                            if (('printReport' in options) && options.async) {
                                util.output("Report is printed only for synchronous job");
                            }
                            
                            if (!options.async && ('printReport' in options)) {
                                util.output(utility.inspect(result.body, { showHidden: false, depth: null}));
                            }
                                
                        } else {
                            status = 'ERROR';
                            if ('status' in err) {
                                switch (err['status']) {
                                    case 412:
                                        if (Array.isArray(result.body)) {
                                            util.error("Project cannot be accepted, files missing:");
                                            for (let missingFile of result.body) {
                                                util.printErrorAndExit('   ' + missingFile['fileName']);
                                            }
                                        }
                                        break;
                                    case 400:
                                        util.printErrorAndExit('Error: ' + result.body[ 'message' ]);
                                        break;
                                    default:
                                        callback(err);
                                }
                            } else {
                                util.error(err);
                                process.exit(100);
                            }
                        }
                        callback();
                    });
            },
        function (callback) {
                if ('async' in options) {
                    callback();
                    return;
                }
                let counter = 0;
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
                        if (config.showProgress) {
                            counter++;
                            if ((counter % 5) === 0)
                                util.output('.', false);
                        }
                        await util.sleep(200);
                    },
                    function () {
                        if ((websocket !== null) && (websocket.readyState !== 0)) {
                            websocket.close();
                        }
                        if (status === 'DISCONNECTED') {
                            util.error("Disconnected from TestEngine, please visit " + config.server + " for more info.")
                        }
                        callback();
                    }

            )
            }
        ],
        function (res) {
            if (res) {
                if ('code' in res) {
                    if (res.code === 'ECONNREFUSED') {
                        util.printErrorAndExit(sprintf("Connection refused: %s:%d", res.address, res.port));
                    } else if (res.code === 'ENOTFOUND') {
                        const { host, port } = res;
                        util.printErrorAndExit(`Host ${host}:${port} does not exist.`);
                    } else {
                        util.printErrorAndExit(res);
                    }
                } else if ('status' in res) {
                    if ('message' in res.response.body) {
                        util.printErrorAndExit("Error: " + res.response.body['message']);
                    } else {
                        util.printErrorAndExit(res.response.text);
                    }
                }
            } else {
                if (!options.async || !('async' in options)) {
                    // If status isn't CANCELED, PENDING or DISCONNECTED and we have an output directory, store reports there
                    //
                    if (!missingFiles) {
                        if (config.showProgress)
                            util.output('');
                        util.output("Result: " + status);
                        if(status === 'FAILED') {
                            process.exit(1);
                        }
                        
                        if ((jobId !== null)
                            && ((status !== 'CANCELED')
                                && (status !== 'PENDING')
                                && (status !== 'DISCONNECTED'))) {
                            if ('output' in options) {
                                jobs.reportForTestJob(jobId, options['output'], options['reportFileName'], 'format' in options ? options['format'] : "junit");
                            }
                        }
                    }
                    jobId = null;
                }
            }
        }
    );
}
