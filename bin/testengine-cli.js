#!/usr/bin/env node

'use strict';

const program = require('commander');
const process = require('process');
const user = require('./user_functions');
const auditlog = require('./auditlog_functions');
const run = require('./run_functions');
const jobs = require('./jobs_functions');
const config = require('./config');
const util = require('./shared_utils');

program
    .version('0.5')
    .usage('[options] <user|auditlog|run|jobs> command parameters')
    .option('-c, --config <filename>', 'Config file for admin tool')
    .option('-q, --quiet', 'Run in quiet mode. Do not write to console')
    .option('-u, --username <username>', 'TestEngine username')
    .option('-p, --password <password>', 'TestEngine password')
    .option('-H, --host <hostname>', 'TestEngine host/url')
    .option('-v, --verbose', 'Enable Verbose output')
    .parse(process.argv);

if (program.args.length === 0) {
    program.outputHelp();
    return
}

config.init();

if (config.config.verbose)
    util.output("Using TestEngine at " + config.config.server);

if (program.args.length > 0) {
    switch (program.args[0]) {
        case 'user':
            user.dispatcher(program.args.slice(1));
            break;
        case 'auditlog':
            auditlog.dispatcher(program.args.slice(1));
            break;
        case 'run':
            run.dispatcher(program.args.slice(1));
            break;
        case 'jobs':
            jobs.dispatcher(program.args.slice(1));
            break;
        default:
            program.outputHelp();
            break;
    }
}

