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
            let argsWithoutFilename;
            let shouldInstallSlm = isSlm(args);
            if (shouldInstallSlm) {
                argsWithoutFilename = args.splice(1, args.length - 1);
            } else {
                if (args.length < 2) {
                    util.error("When installing a JPROD license licensefile or host:port is mandatory.")
                    printModuleHelp();
                    process.exit(1);
                }
                argsWithoutFilename = args.splice(1, args.length - 2);
            }
            let options = util.optionsFromArgs(argsWithoutFilename, [
                'licenseServer',
                'accessKey',
                'type',
                'lastName',
                'firstName',
                'email']);
            installLicense(options, shouldInstallSlm ? null : args[args.length - 1]);
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

function isSlm(args) {
    for (let i in args) {
        if (args[i] === "type=slm") {
            return true;
        }
    }
    return false;
}

function printModuleHelp() {
    util.error("Usage: testengine license <command>");
    util.error("Commands: ");
    util.error("   info");
    util.error("   install type=<fixed|floating|slm> [lastName=<name>] [firstName=<firstName>] [email=<email-address>]");
    util.error("              [licenseServer=<slmLicenseServer] [accessKey=<slmAccessKey>] [<licensefile|host:port>]");
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
        case 'slm':
            if (!options.accessKey && !options.licenseServer) {
                util.error("At least one of the options accessKey or licenseServer needs to be specified when installing" +
                  "an SLM license");
            }
            installSlmLicense(options)
            break;
        default:
            util.printErrorAndExit("Error: Specifying fixed, floating or slm license is mandatory");
    }
}

function installSlmLicense(options) {
    let endPoint = config.server + '/api/v1/license';
    let payload = {
        'issuer': 'SLM'
    };
    if (options.licenseServer) {
        payload['server'] = options.licenseServer;
    }
    if (options.accessKey) {
        payload['accessKey'] = options.accessKey;
    }
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
              handleError(err, result);
          }
      });
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
              handleError(err, result);
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
                  handleError(err, result)
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
              handleError(err, result);
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
              handleError(err, result);
          }
      });

}

function handleError(err, result) {
    if ('status' in err) {
        switch (err['status']) {
            case 400:
                util.printErrorAndExit(result.body['message']);
                break;
            case 401:
            case 403:
                util.printErrorAndExit("User doesn't have credentials to show license");
                break;
            case 404:
                util.printErrorAndExit("No license installed");
                break;
            default:
                util.printErrorAndExit(err['status'] + ': ' + result.body['message']);
        }
    } else {
        util.printErrorAndExit(err);
    }
}

function licenseInfoToString(licenseInfo) {
    if(licenseInfo.issuer === "NO_LICENSE") {
        return "No license installed"
    }
    if (licenseInfo.issuer === "SLM") {
        return "License ID:              " + licenseInfo['licenseNumber'] + "\n" +
          "Expires:                 " + licenseInfo['expirationDate'] + "\n" +
          "Max Concurrent TestJobs: " + licenseInfo['properties']['maxConcurrentJobs'];
    } else {
        return "License ID:              " + licenseInfo['licenseId'] + "\n" +
          "Licensed to user:        " + licenseInfo['userName'] + "\n" +
          "Organization:            " + licenseInfo['organization'] + "\n" +
          "Expires:                 " + licenseInfo['expireDate'] + "\n" +
          "Max Concurrent TestJobs: " + licenseInfo['maxConcurrentJobs'];
    }
}
