'use strict';

const util = require('./shared_utils');
const parser = require('fast-xml-parser');
const fs = require('fs');
const path = require('path');

const xmlParserOptions = {
    attributeNamePrefix: "@_",
    attrNodeName: "attr", //default is 'false'
    textNodeName: "#text",
    ignoreAttributes: false,
    ignoreNameSpace: false,
    allowBooleanAttributes: false,
    parseNodeValue: true,
    parseAttributeValue: false,
    trimValues: true,
    cdataTagName: "__cdata", //default is 'false'
    cdataPositionChar: "\\c",
    localeRange: "", //To support non english character in tag/attribute values.
    parseTrueNumberOnly: false
};

module.exports.parse = function (filename) {
    let result = null;

    let jsonProject = parser.parse(fs.readFileSync(filename, {encoding: 'utf8'}), xmlParserOptions);
    if (!('con:soapui-project' in jsonProject)) {
        throw "'" + filename + "' does not seem to be a soapUI project file";
    }
    if ('con:encryptedContent' in jsonProject['con:soapui-project']) {
        throw "'" + filename + "' is encrypted and may have to be sent to the server as a zip file";
    }
    if ("con:soapui-project" in jsonProject) {
        result = postProcessStructure(jsonProject);

        result['name'] = jsonProject['con:soapui-project']['attr']['@_name'];
        let resourceRoot = path.dirname(filename);
        if ( ('@_resourceRoot' in jsonProject['con:soapui-project']['attr']) && (jsonProject['con:soapui-project']['attr']['@_resourceRoot'].length > 0))
            resourceRoot = jsonProject['con:soapui-project']['attr']['@_resourceRoot'];
        result['resourceRoot'] = resourceRoot;
        result['projectFiles'] = [filename];
    } else {
        util.error("File doesn't seem to be a SoapUI project");
        return null;
    }
    return result;
};

module.exports.parseComposite = function (pathname) {

    let result;

    let jsonProject;

    if (!fs.lstatSync(pathname).isDirectory()) {
        throw pathname + ' doesn\'t point to a directory';
    }
    if (!fs.existsSync(pathname + path.sep + 'settings.xml')) {
        throw pathname + ' doesn\'t point to a composite project (settings.xml missing)';
    }
    if (!fs.existsSync(pathname + path.sep + 'element.order')) {
        throw pathname + ' doesn\'t point to a composite project (element.order missing)';
    }
    if (!fs.existsSync(pathname + path.sep + 'project.content')) {
        throw pathname + ' doesn\'t point to a composite project (project.content missing)';
    }
    let filename = pathname + path.sep + 'settings.xml';
    jsonProject = parser.parse(fs.readFileSync(filename, {encoding: 'utf8'}), xmlParserOptions);
    jsonProject['projectFiles'] = [pathname + path.sep + 'settings.xml',
        pathname + path.sep + 'element.order',
        pathname + path.sep + 'project.content'
    ];
    jsonProject['con:soapui-project']['con:testSuite'] = getCompositeTestSuites(pathname, jsonProject);
    result = postProcessStructure(jsonProject);
    result['name'] = jsonProject['con:soapui-project']['attr']['@_name'];
    result['projectFiles'] = jsonProject['projectFiles'];
    return result
};

function postProcessStructure(jsonProject) {
    let result = {
        testSuites: [],
        cryptos: []
    };

    let testsuites = jsonProject['con:soapui-project']['con:testSuite'];
    if (!testsuites) {
        return result;
    }

    if (!Array.isArray(testsuites)) {
        testsuites = [testsuites];
    }
    for (let testSuite of testsuites) {
        let testSuiteData = processTestSuite(testSuite);
        result.testSuites.push(testSuiteData);
    }
    if ('con:wssContainer' in jsonProject['con:soapui-project']) {
        if (typeof jsonProject['con:soapui-project']["con:wssContainer"] == 'object') {
            if ('con:crypto' in jsonProject['con:soapui-project']["con:wssContainer"]) {
                let cryptos = jsonProject['con:soapui-project']["con:wssContainer"]['con:crypto'];
                if (!Array.isArray(cryptos))
                    cryptos = [cryptos];
                for (let crypto of cryptos) {
                    let cryptoData = processCrypto(crypto);
                    result.cryptos.push(cryptoData);
                }
            }
        }
    }
    return result;
}

function getCompositeTestSuites(pathname, jsonProject) {
    let content = fs.readFileSync(pathname + path.sep + 'project.content', {encoding: 'utf8'}).toString().match(/^.+$/gm);
    let testSuites = [];
    let parsedDirectories = {};

    for (let line of content) {
        jsonProject['projectFiles'].push(pathname + path.sep + line.replace(/[\\]/, path.sep));
        let parts = line.split(/[\\]/);
        if (!(parts[0] in parsedDirectories)) {
            parsedDirectories[parts[0]] = parts[0];
            let settingsFile = pathname + path.sep + parts[0] + path.sep + 'settings.xml';
            let elementOrderFile = pathname + path.sep + parts[0] + path.sep + 'element.order';
            if (fs.existsSync(elementOrderFile)) {
                jsonProject['projectFiles'].push(elementOrderFile);
            }
            if (fs.existsSync(settingsFile)) {
                jsonProject['projectFiles'].push(settingsFile);
                let jsonTestSuite = parser.parse(fs.readFileSync(settingsFile, {encoding: 'utf8'}), xmlParserOptions);
                if ('con:testSuite' in jsonTestSuite) {
                    testSuites[parts[0]] = jsonTestSuite['con:testSuite'];
                }
            }
        }
        // Add TestCases
        let jsonTestCase = parser.parse(fs.readFileSync(pathname + path.sep + parts[0] + path.sep + parts[1], {encoding: 'utf8'}), xmlParserOptions);
        if ('con:testCase' in jsonTestCase) {
            if (!('con:testCase' in testSuites[parts[0]])) {
                testSuites[parts[0]]['con:testCase'] = [];
            }
            testSuites[parts[0]]['con:testCase'].push(jsonTestCase['con:testCase']);
        }

    }
    return Object.values(testSuites);
}

function processCrypto(jsonCrypto) {
    let result = {
        password: null,
        type: null,
        file: null
    };
    if ('con:source' in jsonCrypto) {
        result['file'] = jsonCrypto['con:source']
    }
    if ('con:type' in jsonCrypto) {
        result['type'] = jsonCrypto['con:type']
    }
    if ('con:password' in jsonCrypto) {
        result['password'] = jsonCrypto['con:password']
    }
    return result
}

function processTestSuite(jsonTestSuite) {
    let result = {
        name: jsonTestSuite['attr']['@_name'],
        testCases: []
    };

    if ('@_disabled' in jsonTestSuite['attr'])
        result['disabled'] = jsonTestSuite['attr']['@_disabled'];
    else
        result['disabled'] = false;

    if (Array.isArray(jsonTestSuite['con:testCase'])) {
        for (let testCase of jsonTestSuite['con:testCase']) {
            result['testCases'].push(processTestCase(testCase));
        }
    } else {
        let testCase = jsonTestSuite['con:testCase'];
        result['testCases'].push(processTestCase(testCase));
    }
    return result
}

function processTestCase(jsonTestCase) {
    let result = {
        name: jsonTestCase['attr']['@_name'],
        testSteps: []
    };
    if ('@_disabled' in jsonTestCase['attr'])
        result['disabled'] = jsonTestCase['attr']['@_disabled'];
    else
        result['disabled'] = false;
    let testSteps = jsonTestCase['con:testStep'];
    if (testSteps !== undefined) {
        if (!Array.isArray(testSteps)) {
            testSteps = [testSteps];
        }
        for (let testStep of testSteps) {
            result['testSteps'].push(processTestStep(testStep));
        }
    }
    if (!result['disabled']) {
        let deepDataSources = getObjectsOfKeyInObject(jsonTestCase, 'con:dataSource');
        for (let dataSources of deepDataSources) {
            if (!Array.isArray(dataSources))
                dataSources = [dataSources];

            for (let dataSource of dataSources) {
                if ('file' in dataSource['con:configuration']) {
                    if (!('files' in result))
                        result['files'] = [];
                    result['files'].push(dataSource['con:configuration']['file']);
                }
            }
        }
    }
    return result;
}

function processTestStep(jsonTestStep) {
    let result = {
        name: jsonTestStep['attr']['@_name']
    };

    let deepFiles = getObjectsOfKeyInObject(jsonTestStep, 'con:attachment');
    for (let attachments of deepFiles) {
        if (!Array.isArray(attachments)) {
            attachments = [attachments];
        }
        for (let attachment of attachments) {
            if (!('con:data' in attachment)) {
                if (!('files' in result))
                    result['files'] = [];
                result['files'].push(attachment['con:url']);
            }
        }
    }

    return result;
}

function getObjectsOfKeyInObject(
    obj,
    searchValue,
    maxDepth = 20
) {
    if (!maxDepth) return [];

    const result = [];

    for (const [curr, currElem] of Object.entries(obj)) {

        if (curr === searchValue) {
            // To search for property name too...
            result.push(currElem)
        } else if (typeof currElem == "object") {
            // object is "object" and "array" is also in the eyes of `typeof`
            // search again :D
            const deeperObjects = getObjectsOfKeyInObject(
                currElem,
                searchValue,
                maxDepth - 1
            );
            for (const deeperObject of deeperObjects) {
                result.push(deeperObject)
            }

        }
    }
    return result
}
