'use strict';

const program = require('commander');
const fs = require('fs');
const os = require('os');
const process = require('process');

let config = {
    quiet: false,
    verbose: false,
    username: null,
    password: null,
    server: null,
    showProgress: false
};

function readConfigFromFile(filename) {
    let fileConfig = JSON.parse(fs.readFileSync(filename));
    if ('host' in fileConfig) {
        if (/.*[/]$/.test(fileConfig.host))
            config.server = fileConfig.host.substr(0, fileConfig.host.length - 1);
        else
            config.server = fileConfig.host
    }
    if ('username' in fileConfig) {
        config.username = fileConfig.username
    }
    if ('password' in fileConfig) {
        config.password = fileConfig.password
    }
}

function initConfig() {

    if (program.config && fs.existsSync(program.config)) {
        if (!program.quiet && program.verbose)
            process.stdout.write('Reading config from ' + program.config + '\n');
    } else if (fs.existsSync(os.homedir() + '/.testengine.conf')) {
        if (!program.quiet && program.verbose)
            process.stdout.write('Reading config from ' + os.homedir() + '/.testengine.conf\n');
        readConfigFromFile(os.homedir() + '/.testengine.conf');
    }

    if (program.quiet) {
        config.quiet = true;
    }

    if (program.verbose) {
        config.verbose = true;
    }

    if (program.progress) {
        config.showProgress = true;
    }
    
    if (program.username) {
        config.username = program.username
    }

    if (program.password) {
        config.password = program.password
    }

    if (program.host) {
        if (/.*[/]$/.test(program.host))
            config.server = program.host.substr(0, program.host.length - 1);
        else
            config.server = program.host
    }
}

module.exports = {
    config: config,
    init: initConfig
};
