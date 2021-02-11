import os
from subprocess import Popen

baseCli = 'node ../bin/testengine.js'
licenseServer = "localhost:1194"

def startJob(projectPath):
	startJob = ' '.join([baseCli, 'run project', projectPath, '-c admin.config'])
	extractTestJobId = baseCli + " jobs list -c admin.config -c admin.config|sed -n 3p |sed 's/ *$//g'|rev|cut -d ' ' -f 2|rev"
	os.system(startJob)
	jobId = os.popen(extractTestJobId).read().strip()
	return jobId

def runAllCombinations(commands, flags, function):
    for command in commands:
        for flag in flags:
            function(command, flag)

def runCli(command, flag, jobId=''):
    cli = ' '.join([baseCli, command, jobId, flag])
    print('\n' + cli)
    os.system(cli+ '; echo exit status $?')

if __name__ == '__main__':
	commands = ['auditlog', 
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

        'run',
        'run help',
        'run project',
        'run project help',
        'run project noneExisting.xml',
        'run project runtimeerror.xml',
        'run project validationerror.xml',
        'run project successful.xml',

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
	    'license install type=floating firstName=oskar lastName=oskarsson email=oskar@oskarsson.com ' + licenseServer
        ]

	flags = ['-C',
	    '-c',
	    '-C admin.config',
		'-H localhost:1231',
		'-H localhost:8080',
		'-c regularUser.config',
		'-c admin.config']

	jobCommands = ['jobs status',
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
	    'jobs report output=. reportFileName=report format=noneExisting'
	]

	runAllCombinations(commands, flags, lambda command, flag : runCli(command, flag))
	testJobId = startJob('successful.xml')
	runAllCombinations(jobCommands, flags, lambda command, flag : runCli(command, flag, testJobId))
	runAllCombinations(['jobs cancel'], flags, lambda command, flag : runCli(command, flag, startJob('slow.xml')))
