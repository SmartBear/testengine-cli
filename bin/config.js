'use strict';

const fs = require('fs');
const os = require('os');
const process = require('process');

let config = {
    quiet: false,
    verbose: false,
    username: null,
    password: null,
    server: null,
    showProgress: false,
    showHelp: false
};

function readConfigFromFile(filename) {
    const fileConfig = JSON.parse(fs.readFileSync(filename));
    if ('host' in fileConfig) {
        config.server = fileConfig.host.replace(/\/$/, '');
    }
    if ('username' in fileConfig) {
        config.username = fileConfig.username;
    }
    if ('password' in fileConfig) {
        config.password = fileConfig.password;
    }
}

function initConfig(cliOptions) {
    if (cliOptions.config && fs.existsSync(cliOptions.config)) {
        if (!cliOptions.quiet && cliOptions.verbose) {
            process.stdout.write('Reading configuration from ' + cliOptions.config + '\n');
        }
        readConfigFromFile(cliOptions.config);
    } else {
        const defaultPath = os.homedir() + '/.testengine.conf';
        if (fs.existsSync(defaultPath)) {
            if (!cliOptions.quiet && cliOptions.verbose) {
                process.stdout.write('Reading configuration from ' + defaultPath + '\n');
            }
            readConfigFromFile(defaultPath);
        }
    }

    config.quiet = !!cliOptions.quiet;
    config.verbose = !!cliOptions.verbose;
    config.showProgress = !!cliOptions.progress;
    config.showHelp = process.argv.includes('-h') || process.argv.includes('--help');

    if (cliOptions.username) {
        config.username = cliOptions.username;
    }

    if (cliOptions.password) {
        config.password = cliOptions.password;
    }

    if (cliOptions.host) {
        if (!cliOptions.host.toLowerCase().startsWith('http')) {
            process.stdout.write("Warning: Host should be a URL starting with http:// or https://\n");
        }
        config.server = cliOptions.host.replace(/\/$/, '');
    }

    if (!config.server) {
        process.stdout.write("Warning: No valid host specified (-H)\n");
    }
    if (!config.username) {
        process.stdout.write("Warning: No user name specified (-u) \n");
    }
    if (!config.password) {
        process.stdout.write("Warning: No password specified (-p)\n");
    }
}

module.exports = {
    config,
    init: initConfig
};
