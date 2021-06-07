const process = require('process');
const util = require('./shared_utils');
const config = require('./config').config;
const request = require('superagent');
const fs = require('fs');

module.exports.dispatcher = function (args) {
    if (args.length === 0) {
        printModuleHelp();
        process.exit(1);
    }
    switch (args[0].toLowerCase()) {
        case 'run': {
            let options = util.optionsFromArgs(args.splice(1), ['output', 'reportFileName']);
            runDiagnostics(options['output'], options['reportFileName']);
            break;
        }
        case 'help':
            printModuleHelp();
            break;
        default:
            util.printErrorAndExit("Unknown operation");
    }
}

function runDiagnostics(outputFolder, fileName) {
    let endPoint = config.server + '/api/v1/diagnostics';
    let reportFileName = "diagnostics.zip";

    if (outputFolder) {
        if (!fs.existsSync(outputFolder)) {
            fs.mkdirSync(outputFolder, {recursive: true});
        }
    }

    reportFileName = (outputFolder ? outputFolder + '/' : '') + (fileName ? fileName : reportFileName);
    let stream = fs.createWriteStream(reportFileName);

    let req = request.get(endPoint)
        .auth(config.username, config.password)
        .accept("application/zip").on('response', function (response) {
            if (response.status !== 200) {
                util.printErrorAndExit(`Status code: ${response.status}`);
            } else {
                util.output('Diagnostics report created successfully');
            }
        }).send();

    req.pipe(stream);
}

function printModuleHelp() {
    util.error("Usage: testengine diagnostics <command>");
    util.error("Commands: ");
    util.error("   run [output=<directory>] [reportFileName=<filename>]");
    util.error("   help");
}