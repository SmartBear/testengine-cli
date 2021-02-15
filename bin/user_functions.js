'use strict';

const request = require('superagent');
const config = require('./config').config;
const sprintf = require('sprintf-js').sprintf;
const csv = require('csvtojson');
const fs = require('fs');
const util = require('./shared_utils');
const process = require('process');

module.exports.dispatcher = function (args) {
    if (args.length === 0) {
        printModuleHelp();
        process.exit(1);
    }

    switch (args[0].toLowerCase()) {
        case 'add':
            if (args.length < 3) {
                util.printErrorAndExit("Usage: testengine user add <username> <password>");
            } else {
                addUser(args[1], args[2])
            }
            break;

        case 'import':
            if (args.length < 2) {
                util.printErrorAndExit("Usage: testengine user import <file/url>");
            } else {
                importUsers(args[1])
            }
            break;

        case 'edit':
            if (args.length < 3) {
                util.printErrorAndExit("Usage: testengine user edit <username> [password=newpassword] [admin=true/false]");
            } else {
                let options = util.optionsFromArgs(args.splice(2), [
                    'password', 'admin']);
                updateUser(args[1], options)
            }
            break;

        case 'list':
            if (args.length === 2) {
                let options = util.optionsFromArgs(args.splice(1), [
                    'format']);
                listUsers(options);
            } else {
                listUsers();
            }
            break;
        case 'del':
        case 'delete':
            if (args.length < 2) {
                util.printErrorAndExit("Usage: testengine user delete <username>");
            } else {
                deleteUser(args[1]);
            }
            break;
        case 'help':
            printModuleHelp();
            break;
        default:
            util.printErrorAndExit("Unknown operation");
    }
};

function printModuleHelp() {
    util.error("Usage: testengine user <command>");
    util.error("Commands: ");
    util.error("   add <username> <password>");
    util.error("   edit <username> [password=newpassword] [admin=true/false]");
    util.error("   delete <username>");
    util.error("   import <file/url>");
    util.error("   list [format=text/csv]");
    util.error("   help");
}

function addUser(username, password, isAdmin = false, silent = false, callback = null) {
    let payload = {
        userName: username,
        password: password,
        admin: isAdmin

    };
    request.post(config.server + '/api/v1/users')
        .auth(config.username, config.password)
        .accept('application/json')
        .type('application/json')
        .send(payload)
        .end((err) => {
            if (!silent) {
                if (err !== null) {
                    util.error('Failed to create ' + (isAdmin ? 'admin ' : '') + 'user "' + username + '"');
                    if ('code' in err) {
                        if (err.code === 'ECONNREFUSED') {
                            util.printErrorAndExit(sprintf("Connection refused: %s:%d", err.address, err.port));
                        } else {
                            util.printErrorAndExit(sprintf("Error: %s:%s", err.code, err.message));
                        }
                    } else {
                        switch (err.status) {
                            case 422:
                                util.printErrorAndExit(err.response.body.message);
                                break;
                            case 409:
                                util.printErrorAndExit('User "' + username + '" already exists.');
                                break;
                            default:
                                util.printErrorAndExit(err.status + ': ' + err.message);
                        }
                    }
                } else {
                    util.output('Created ' + (isAdmin ? 'admin ' : '') + 'user "' + username + '"');
                }
            }
            if (callback) {
                callback(err)
            }
        });
}

function importUsers(fileOrURL) {
    let urlRegExp = /^[a-z]{1,5}[:][/]{2}/;
    let failedImport = false;

    let stream = null;
    if (fileOrURL.match(urlRegExp) !== null) {
        // We got a URL and not a file name
        stream = request.get(fileOrURL);
    } else
        stream = fs.createReadStream(fileOrURL);
    util.output(sprintf("%s,%s,%s", "username", "password", "admin"));
    csv({
        colParser: {
            admin: (item) => {
                switch (typeof item) {
                    case 'string':
                        return (item === '1') || (item.toLowerCase() === 'true');
                    case 'integer':
                        return item === 1;
                }
            }
        }
    }).fromStream(stream).then((jsonObj) => {
        for (let i = 0; i < jsonObj.length; ++i) {
            let user = jsonObj[i];
            let isAdmin = false;
            if ('admin' in user) {
                isAdmin = user['admin'];
            }
            if (!('password' in user)) {
                user['password'] = createRandomPassword();
            }
            addUser(user['username'], user['password'], isAdmin, true, (err) => {
                if (err == null) {
                    util.output(sprintf("%s,%s,%d",
                        util.csvQuoteQuotes(user['username']),
                        util.csvQuoteQuotes(user['password']),
                        user['admin'] ? 1 : 0));
                } else {
                    util.error('User ' + user['username'] + ' could not be imported');
                    if (err.response) {
                        util.error(err.status + ': ' + err.response.body.message);
                    } else {
                        util.error(err);
                    }
                    failedImport = true;
                }
                if (failedImport && i === jsonObj.length - 1) {
                    process.exit(1);
                }
            });
        }
    });
}

function updateUser(username, options) {
    let payload = {};
    if ('password' in options)
        payload['password'] = options['password'];
    if ('admin' in options) {
        if (typeof options['admin'] === 'boolean')
            payload['admin'] = options['admin'];
        else
            payload['admin'] = (options['admin'].toString().toLowerCase() === 'true');
    }

    request.put(config.server + '/api/v1/users/' + username)
        .auth(config.username, config.password)
        .accept('application/json')
        .type('application/json')
        .send(payload)
        .end((err) => {
            util.handleError(err);
            util.output('User "' + username + '" successfully updated');
        });
}

function deleteUser(username) {
    request.delete(config.server + '/api/v1/users/' + username)
        .auth(config.username, config.password)
        .accept('application/json')
        .send()
        .end((err) => {
            if (err !== null) {
                util.printErrorAndExit(err.status + ': ' + err.message);
            }
            util.output('User "' + username + '" successfully deleted');
        });
}

function listUsers(options) {
    let format = (options && 'format' in options) ? options['format'] : 'text';
    request.get(config.server + '/api/v1/users')
        .auth(config.username, config.password)
        .accept('application/json')
        .send()
        .end((err, res) => {
            util.handleError(err);
            switch (format) {
                case 'csv':
                    dumpArrayAsCSV(res.body);
                    break;
                case 'text':
                    dumpArrayAsText(res.body);
                    break;
                default:
                    util.error('Unrecognized format');
                    process.exit(1)
            }
        });
}

function dumpArrayAsText(array) {
    util.output(sprintf('%-30s    %s', 'User', 'Admin'));
    util.output("----------------------------------------");
    for (let user of array) {
        util.output(sprintf('%-30s    %s', user.userName, user.admin ? 'Yes' : 'No'));
    }
}

function dumpArrayAsCSV(array) {
    util.output(sprintf('"%s","%s"', 'username', 'admin'));
    for (let user of array) {
        util.output(sprintf('"%s",%d', util.csvQuoteQuotes(user.userName), user.admin ? 1 : 0));
    }
}

function createRandomPassword(length = 8) {
    return Math.random().toString(36).slice(-1 * length);

}
