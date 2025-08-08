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
            let shouldInstallSlm = args.includes("type=slm");
            if (shouldInstallSlm) {
                argsWithoutFilename = args.slice(1, args.length);
            }

            let options = util.optionsFromArgs(argsWithoutFilename, [
                'licenseServer',
                'accessKey',
                'type']);
            installLicense(options);
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
    util.error("   install type=slm [licenseServer=<slmLicenseServer] [accessKey=<slmAccessKey>]");
    util.error("   uninstall");
    util.error("   help");
}

function installLicense(options) {
    switch (options['type']) {
        case 'slm':
            if (!options.accessKey && !options.licenseServer) {
                util.error("At least one of the options accessKey or licenseServer needs to be specified when installing" +
                  "an SLM license");
            }
            installSlmLicense(options)
            break;
        default:
            util.printErrorAndExit("Error: Specifying slm license is mandatory");
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
