'use strict';

const request = require('superagent');
const config = require('./config').config;
const util = require('./shared_utils');
const fs = require('fs');
const path = require('path');
const process = require('process');

module.exports.dispatcher = function (args) {
    if (args.length === 0) {
        printModuleHelp();
        process.exit(1);
    }

    switch (args[0].toLowerCase()) {
        case 'install': {
            let argsWithoutFilename = args.splice(1, args.length - 2);
            let options = util.optionsFromArgs(argsWithoutFilename, [
                'type',
                'lastName',
                'firstName',
                'email']);
            if (args.length < 2) {
                printModuleHelp();
                process.exit(1);
            } else {
                installLicense(options, args[args.length - 1]);
            }
            break;
        }
        case 'uninstall':
            if (args.length < 1) {
                printModuleHelp();
                process.exit(1);
            } else {
                uninstallLicense()
            }
            break;
        case 'info':
            // Show license info
            showLicenseInfo();
            break;
        case 'help':
            printModuleHelp();
            break;
        default:
            util.printErrorAndExit("Unknown operation");
    }
};

function printModuleHelp() {
    util.error("Usage: testengine license <command>");
    util.error("Commands: ");
    util.error("   info");
    util.error("   install type=<fixed|floating> [lastName=<name>] [firstName=<firstName>] ");
    util.error("              [email=<email-address>] <licensefile|host:port>");
    util.error("   uninstall");
    util.error("   help");
}

function installLicense(options, licenseOrLicenseServer) {
    switch (options['type']) {
        case 'floating': {
            let mr = /([^:]*):([0-9]+)/g.exec(licenseOrLicenseServer);
            if (mr) {
                installFloatingLicense(mr[1], parseInt(mr[2]));
            }
            break;
        }
        case 'fixed':
            installFixedLicense(options, licenseOrLicenseServer);
            break;
        default:
            util.printErrorAndExit("Error: Specifying fixed or floating license is mandatory");
    }
}

function uninstallLicense() {
    let endPoint = config.server + '/api/v1/license';
    request.delete(endPoint)
        .auth(config.username, config.password)
        .accept('application/json')
        .type('application/json')
        .send()
        .end((err, result) => {
            if (err === null) {
                util.output("License successfully uninstalled");
            } else {
                if ('status' in err) {
                    switch (err['status']) {
                        case 403:
                            util.printErrorAndExit("User doesn't have permission to uninstall a license");
                            break;
                        default:
                            util.printErrorAndExit(err['status'] + ': ' + result.body['message']);
                    }
                }
            }
        });
}

function installFixedLicense(options, licenseFile) {
    let endPoint = config.server + '/api/v1/license';
    let activationInfo = {};
    for (let key of ['firstName', 'lastName', 'email']) {
        if (key in options) {
            activationInfo[key] = options[key];
        }
    }
    let readStream = fs.createReadStream(licenseFile);
    readStream.on('open', function () {
        let buffer = Buffer.from(JSON.stringify(activationInfo), 'utf8');
        request.post(endPoint)
            .auth(config.username, config.password)
            .accept('application/json')
            .type('multipart/form-data')
            .attach('file', licenseFile)
            .attach('activationInfo', buffer, "data.json")
            .end((err, result) => {
                if (err === null) {
                    util.output("The following license was installed:");
                    util.output(licenseInfoToString(result.body))
                } else {
                    if ('status' in err) {
                        switch (err['status']) {
                            case 403:
                                util.printErrorAndExit("User doesn't have permission to install a license");
                                break;
                            case 400:
                                util.printErrorAndExit("Failed to install license, error: " + result.body['message']);
                                break;
                            default:
                                if ('message' in result.body) {
                                    util.printErrorAndExit(err['status'] + ': ' + result.body['message']);
                                } else {
                                    util.printErrorAndExit(err['status'] + ': ' + err['message']);
                                }
                                return;
                        }
                    } else {
                        util.printErrorAndExit(err);
                    }
                }
            });
    });
    readStream.on('error', function (err) {
        util.error("Error: " + err.message);
        let ext = path.extname(licenseFile).toLowerCase();
        if ((ext !== '.key') && (ext !== '.zip')) {
            util.error('"' + licenseFile + '" does not seem to be a .zip or .key file');
        }
        process.exit(1);
    });

}

function installFloatingLicense(licenseServerHost, licenseServerPort) {
    let endPoint = config.server + '/api/v1/license';
    let payload = {
        'host': licenseServerHost,
        'port': licenseServerPort
    };
    request.post(endPoint)
        .auth(config.username, config.password)
        .accept('application/json')
        .type('application/json')
        .send(payload)
        .end((err, result) => {
            if (err === null) {
                util.output("The following license was installed:");
                util.output(licenseInfoToString(result.body))
            } else {
                if ('status' in err) {
                    switch (err['status']) {
                        case 403:
                            util.printErrorAndExit("User doesn't have enough credentials to install a license");
                            break;
                        case 400:
                            util.printErrorAndExit("Failed to install license, error: " + result.body['message']);
                            break;
                        default:
                            util.printErrorAndExit(err['status'] + ': ' + err['message']);
                    }
                } else {
                    util.printErrorAndExit(err);
                }
            }
        });
}

function showLicenseInfo() {
    let endPoint = config.server + '/api/v1/license';
    request.get(endPoint)
        .auth(config.username, config.password)
        .accept('application/json')
        .type('application/json')
        .send()
        .end((err, result) => {
            if (err === null) {
                util.output("Current license:");
                util.output(licenseInfoToString(result.body))
            } else {
                if ('status' in err) {
                    switch (err['status']) {
                        case 401:
                        case 403:
                            util.printErrorAndExit("User doesn't have credentials to show license");
                            break;
                        case 404:
                            util.printErrorAndExit("No license installed");
                            break;
                        default:
                            util.printErrorAndExit(err['status'] + ': ' + err['message']);
                    }
                } else {
                    util.printErrorAndExit(err);
                }
            }
        });

}

function licenseInfoToString(licenseInfo) {
    return "License ID:              " + licenseInfo['licenseId'] + "\n" +
        "Licensed to user:        " + licenseInfo['userName'] + "\n" +
        "Organization:            " + licenseInfo['organization'] + "\n" +
        "Expires:                 " + licenseInfo['expireDate'] + "\n" +
        "Max Concurrent TestJobs: " + licenseInfo['maxConcurrentJobs'];
}
