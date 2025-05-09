#!/usr/bin/env node

'use strict';

const { Command } = require('commander');
const program = new Command();
const process = require('process');
const user = require('./user_functions');
const auditlog = require('./auditlog_functions');
const run = require('./run_functions');
const license = require('./license_functions');
const jobs = require('./jobs_functions');
const diagnostics = require('./diagnostics_functions');
const config = require('./config');
const util = require('./shared_utils');
const pjson = require('../package.json');


program
    .version(pjson.version)
    .name("testengine")
    .usage('[options] <user|auditlog|run|jobs|license|diagnostics> command parameters')
    .option('-c, --config <filename>', 'Config file for admin tool')
    .option('-q, --quiet', 'Run in quiet mode. Do not write to console')
    .option('-u, --username <username>', 'TestEngine username')
    .option('-p, --password <password>', 'TestEngine password')
    .option('-H, --host <hostname>', 'TestEngine host/url')
    .option('-v, --verbose', 'Enable Verbose output')
    .option('-P, --progress', 'Indicate progress')
    .argument('<module>', 'Main module: user, auditlog, run, jobs, license, diagnostics')
    .argument('[args...]', 'Arguments passed to selected module')
    .parse(process.argv);

const [mainCommand, ...restArgs] = program.args;

program.parse(process.argv);
const options = program.opts();

config.init(options);

if (config.config.showHelp) {
    program.outputHelp();
    return;
}

if (config.config.verbose) {
    util.output("Using TestEngine at " + config.config.server);
}

switch (mainCommand) {
    case 'user':
        user.dispatcher(restArgs);
        break;
    case 'auditlog':
        auditlog.dispatcher(restArgs);
        break;
    case 'run':
        run.dispatcher(restArgs);
        break;
    case 'jobs':
        jobs.dispatcher(restArgs);
        break;
    case 'license':
        license.dispatcher(restArgs);
        break;
    case 'diagnostics':
        diagnostics.dispatcher(restArgs);
        break;
    default:
        console.error(`Unknown module: ${mainCommand}`);
        program.outputHelp();
        process.exit(1);
}
