# TestEngine-CLI
SmartBear has a product called ReadyAPI TestEngine. It is a server which primary purpose
is to run SoapUI projects (functional API tests for primarily REST and SOAP services), typically in a CI/CD pipeline.

The TestEngine-CLI is a command line interface for the API of the product. The tool can handle most administration of the 
server as well as submitting test jobs and requesting reports.

## Usage
All communication with the ReadyAPI TestEngine requires three settings.
* URL to TestEngine
* user name
* password

They are specified using the command line arguments -u -p and -H before the rest of the command line arguments.
To specify the above on the command line, do:

`testengine -u <admin user name> -p <admin user password> -H http://<url to TestEngine> command...`

`testengine -h` will print full list of command line arguments.

It is also possible to specify the settings above either in a named config file (using the -c/--config argument) or in the user's home
directory (in a file named .testengine.conf)

A sample .testengine.conf fully filled in will look like this:
```
{
   "username" : "administrator",
   "password" : "secretPassword",
   "host"   : "https://172.10.1.192:8443"
}
```

When a config file is present, it is possible to override the values using the command line arguments.

There is currently no support for encrypting the config file but normal file system security should make it possible to
restrict reading it to the user running the tool.

## Test Jobs
The tool can submit test jobs, list jobs which has been submitted (only admins can see other users' jobs) and purge old
jobs from the server.

### Running Test Jobs
A SoapUI project is typically an XML file which may depend on other files for data driven testing, attachments etc.
Because TestEngine is remote, the command line interface must parse the project and extract the files relevant to the 
testjob and send them together with the project file to the server.

To submit a project to be run, the basic command is as follows:

`testengine run project [options] <project-file>`

In the command line above, the `<project file>` can be either a project file (.xml), a directory with a composite 
project or a zip file (either exported from ReadyAPI or created manually with all the needed dependencies inside). When
pointing to a project file or a folder of a composite project, the CLI will try to find all files the project is depending
on to run the job. When `<project-file>` points to a zip file, the zip file is expected to include all the files needed,
just like if it was an exported project from ReadyAPI.
When sending encrypted projects to TestEngine (specifying projectPassword) the command line interface will do its best
to find files the project is depending on. However, if the entire project is encrypted it will not succeed and the best
alternative, if the project depends on external files, is to create a zip file with the dependencies and the project and 
send it to TestEngine.

**options** is a set of options which can be specified to tell TestEngine what to run in the project, the following
table includes the currently implemented options.


| Option  | Sample Value  | Description|
|---|---|---|
| async  | N/A  | Run the project without waiting for results. The TestJobID will be printed on the console to make it possible to query status, get reports or cancel the job|
| timeout| 30 | Specify a timeout for the running job. When the job has been running for the specified number of seconds, the job will fail and the report will include information that it timed out. If not specified, the job will always run until completed|
| skipdeps | N/A | Do not scan project for dependencies. This will improve performance for large projects without dependences to external files |
| testsuite  | TestSuite1  | Name of a test suite to run|
| testcase  | JRA-11224  | Name of a specific test case to run. Typically used together with **testsuite** because a project can have several test cases with the same name in different test suites.|
| tags | smoketest  | Comma separated list of tags. For a test case to be run, it should have all the listed tags. When specifying many tags, or using tags with space in the name, it is possible to surround them with either (), [] or "" but be aware that different operating systems can have special meanings for brackets which requires quoting. Tags cannot be used together with testsuite/testcase specification.|
| tags | "smoketest,regression"  | See description above|
| output | c:\\temp\\reports  | Directory to store reports in.|
| reportFileName | File name for the report. If omitted, the report will get a name based on the test job ID|
| format | excel | Specify the file type of the report. Currently supported formats are json, junit and excel. The default format is junit|
| proxyHost | 172.0.1.10  | Hostname or IP of the server to use as a proxy for outgoing requests (from TestEngine)|
| proxyPort | 8888  | Port of the proxyHost to contact for outgoing requests (from TestEngine)|
| proxyUser | John  | Optional username to authenticate with the proxy|
| proxyPassword | Secret!| Optional password to authenticate with the proxy|
| projectPassword | abc123 | Password to unlock the project file (or password protected properties). Password protected projects which are depending on external files (data sources, attachments, certificates etc.) needs to be sent to TestEngine in a manually created zip file with all dependencies in the zip file root. Projects configured to only have specific properties encrypted will work as normal projects but require this parameter.|

If the user exits the CLI while the job is being run, it will output the command to use to cancel the job.
e.g.
```
^C
To cancel the job started, please use:
     testengine jobs cancel 61b0baef-b661-469e-9a96-d546ef20e889
```

### List jobs on the server
To get a list of jobs from the server, execute the following command:

`testengine jobs list`

following the list command, it is also possible to specify options to select format of the output and to filter the list. The filters available are:

| Option  | Sample Value  | Description|
|---|---|---|
| format| csv  | Get the list as CSV data which can be imported in a spreadsheet. Other formats are text and json|
| user  | joe  | Get all jobs submitted by joe|
| user  | "joe, adam"  | Get all jobs submitted by joe or adam|
| limit | 1000  | Limit the number of jobs returned, the default value is 100|
| status| FAILED | Get all jobs with a status "FAILED"|
| status| "FAILED,CANCELED"  | Get all jobs which was either canceled or failed|

### Cancel a running job
Each job has a job ID, with the command "jobs cancel" a running (or queued) job can be canceled.

`testengine jobs cancel <job ID>`

### Get the status of a job, using job ID without generating a report
Each job has a job ID, with the command "jobs cancel" a running (or queued) job can be canceled.

`testengine jobs status <job ID>`

### Request an execution report from the server'
Each job has a job ID, with the command "jobs report" you can request the execution report for a completed job.
The "output" argument is mandatory, "format" is optional.

`testengine jobs report output=/tmp/reports foramat=excel <job ID>`

| Option  | Sample Value  | Description|
|---|---|---|
| output | c:\\temp\\reports  | Directory to store reports in.|
| reportFileName | File name for the report. If omitted, the report will get a name based on the test job ID|
| format | excel | Specify the file type of the report. Currently supported formats are json, junit and excel. The default format is junit|

### Clean up old jobs from the server database
To remove old jobs from the server (to preserve disk space or limit the risk of data leakage), you can use the prune command:

`testengine jobs prune`

If no arguments are specified, TestEngine will remove all events in the database which are older than the
`numberOfDaysToKeep` specification in the readyapi-testengine.yaml file. It is also possible to specify a date using the
before argument. To remove all job history data for events older than May 1st, 2019, specify `before=2019-05-01` on the command line.

## User Management

### Add a user
To add a user, call testengine-cli like this:

`testengine user add <username> <password>`

This will create a new user account named what you put instead of <username> and with the password set to <password>

### Delete a user
To delete a user, similar to the above, just call:

`testengine user delete <username>`

### Modify a user
Users can also be altered if an admin wants to set their password or add/revoke admin privileges. This is done using the `user edit` command:

`testengine user edit <username> [password=newpassword] [admin=true/false]`

both password and admin can be set at once but they can also be set one at a time. 

## Operations related to many users
### List all users
It is possible to get a list of users by using the "user list" command. If there are no other arguments to the command, the tool will dump a list of 
users and if they are administrators. The command looks like this:

`testengine user list [format=text/csv]`

`text` is the default, with the `csv` argument the output will instead be a csv file which can be imported into other systems.

### Adding multiple users
To add multiple users (i.e. when setting up the system), the tool supports importing CSV files
The CSV file should could have the headers "username", "password" and "admin". The "username" field is mandatory, if they are missing TestEngine will report an error.

`testengine user import <filename or URL>`

Import will output a CSV file with the users created and their passwords (including generated password when a password 
was missing). The output can be redirected to a file and imported into excel or some other desired format.

## Audit log
The server keeps an audit log of actions which affects the server and/or users. In there you can find out 
who terminated a job, when users are added, deleted or modified, etc. The tool lets you dump the audit log in full or
for a specific date range. You can also get an audit trail for a specific user (by adding a username to the command 
line). To make it easier to process the log, it can be printed not just as text but also as csv or json. 

`testengine auditlog dump [format=text/csv/json] [limit=n] [iso] [user=username] [date=YYYY-MM-DD[:YYYY-MM-DD]] ]`

The date can be either a date on the format YYYY-MM-DD or a range on the format YYYY-MM-DD:YYYY-MM-DD. If the date is
omitted all data in the auditlog is returned. By specifying `limit` it is possible to limit the amount of lines to a
set number.
When using the text format, the audit log will be printed with dates in the user locale date format if the version of 
nodejs supports other locales than US English. To print the audit log in a more standardized ISO 8601 format, it is 
possible to add `iso` as a command line argument. 

## License Management
An administrator can install or uninstall licenses using the TestEngine CLI. 

### Display the current license info
To check the current license expiry and size, use the license info command.
`testengine license info`

### Install a fixed license
To install a fixed license, specify `type=fixed`, the user information and the path to either a .key file or a .zip
file with licenses in it (as received from SmartBear).

`testengine license install type=fixed fistName=Joe lastName=Tester email=joe.tester@example.com /home/joe/Downloads/licenses.zip`

**Note:** When you install a new license, any existing old license is overwritten without deactivation. It is generally 
a good idea to first uninstall it.
   
### Install a floating license
To install a fixed license, specify `type=floating`, and the location of the floating license server (typically an IP 
and port 1099)

`testengine license install type=floating <ip-address|hostname>:1099`

### Uninstall a license (floating or fixed)
To uninstall, you use the uninstall command.

`testengine license install type=floating <ip-address|hostname>:1099`

A fixed license will be deactivated and a floating license will be checked back in to the floating license server. 
