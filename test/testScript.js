/** This script is used to test all commands in testengine. It will run most operations in testengine-cli with a few flag
 * combinations and print it to screen. A tester can then read the output to see how the cli behaves. Together with the
 * script there are a few readyapi-projects and login configurations for testengine. Assumes the testengine instance is
 * running at localhost:8080 and has the logins admin/password, regularUser/asdasd.
 * To run the script you need node.js. Ensure the working directory is the test-folder and run:
 * node testScript.js
 */

const {execSync, exec} = require('child_process');

const baseCli = 'node ../bin/testengine.js';
const licenseServer = 'localhost:1194';

function startJob(projectPath) {
    let startJob = [baseCli, 'run project', projectPath, '-c admin.config'].join(' ');
    let extractTestJobId = baseCli + " jobs list -c admin.config -c admin.config|sed -n 3p |sed 's/ *$//g'|rev|cut -d ' ' -f 2|rev";
    exec(startJob);
    let jobId = execSync(extractTestJobId).toString().trim();
    return jobId;
}

function runAllCombinations(commands, flags, fn) {
    for (let i = 0; i < commands.length; ++i) {
        for (let j = 0; j < flags.length; ++j) {
            fn(commands[i], flags[j]);
        }
    }
}

function runCli(command, flag, jobId = '') {
    let cli = [baseCli, command, jobId, flag].join(' ');
    console.log('\n' + cli);
    try {
        console.log(execSync(cli).toString() + 'exit status 0');
    } catch (error) {
        console.log('' + error.stdout + 'exit status ' + error.status);
    }
}

function startSlowJobAndThenRunCli(command, flag) {
    let testJobId = startJob('slow.xml');
    runCli(command, flag, testJobId);
}

let commands = ['auditlog',
    'auditlog dump',
    'auditlog help',

    'user list',
    'user add',
    'user add hej',
    'user add hej pw',
    'user add hej password',
    'user add hej password moar',
    'user edit hej2',
    'user edit hej admin=true',
    'user edit hej admin=false',
    'user edit hej password=pw',
    'user edit hej nope=asda',
    'user edit nope',
    'user delete',
    'user delete nope',
    'user delete hej',
    'user import users.csv',

    'run',
    'run help',
    'run project',
    'run project help',
    'run project noneExisting.xml',
    'run project runtimeerror.xml',
    'run project validationerror.xml',
    'run project successful.xml',
    'run project successful.xml testsuite="TestSuite 1"',
    'run project successful.xml testsuite="TestSuite 1" securitytest="blah"',
    'run project successful.xml testsuite="TestSuite 1" testcase="TestCase 1"',
    'run project successful.xml testcase="TestCase 1"',
    'run project successful.xml testcase="TestCase 1" securitytest="blah"',
    'run project testsuite="TestSuite 1" successful.xml',
    'run project testsuite="TestSuite 1" securitytest="blah" successful.xml',
    'run project testsuite="TestSuite 1" testcase="TestCase 1" successful.xml',
    'run project testcase="TestCase 1" successful.xml',
    'run project testcase="TestCase 1" securitytest="blah" successful.xml',
    'run project successful.xml printReport',
    'run project successful.xml printReport async',

    'jobs list user=lol',
    'jobs list user=admin',
    'jobs list user=regular',
    'jobs help',
    'jobs prune before=2018-01-01',
    'jobs prune before=dasdasdas',
    'license install',
    'license install type=floating',
    'license install type=fixed',
    'license install type=noneExisting',
    'license install type=floating',
    'license install type=floating',
    'license uninstall',
    'license install type=floating ' + licenseServer,
    'license install type=floating noneExisting:1234',
    'license install type=floating file.txt',
    'license install type=floating noneExisting=text ' + licenseServer,
    'license install type=floating email=notMail ' + licenseServer,
    'license install type=floating firstName=oskar ' + licenseServer,
    'license install type=floating lastName=oskarsson ' + licenseServer,
    'license install type=floating email=oskar@oskarsson.com ' + licenseServer,
    'license install type=floating firstName=oskar lastName=oskarsson email=oskar@oskarsson.com ' + licenseServer];

let flags = ['-C',
    '-c',
    '-C admin.config',
    '-H localhost:1231',
    '-H localhost:8080',
    '-c regularUser.config',
    '-c admin.config'];

let jobCommands = ['jobs status',
    'jobs printReport',
    'jobs report',
    'jobs report output=.',
    'jobs report output=noneExisting',
    'jobs report output=. reportFileName=report',
    'jobs report output=output noneExisting=report.txt',
    'jobs report output=output reportFileName=report format=junit',
    'jobs report output=output reportFileName=report format=excel',
    'jobs report output=output reportFileName=report format=json',
    'jobs report output=output reportFileName=report format=pdf',
    'jobs report output=. reportFileName=report format=noneExisting'];

let diagnosticCommands = [
    'diagnostics version',
    'diagnostics help'
]

runAllCombinations(commands, flags, (command, flag) => runCli(command, flag));
let testJobId = startJob('successful.xml');
runAllCombinations(jobCommands, flags, (command, flag) => runCli(command, flag, testJobId));
runAllCombinations(['jobs cancel'], flags, startSlowJobAndThenRunCli);
runAllCombinations(diagnosticCommands, ['-H http://localhost:8080'], runCli);
