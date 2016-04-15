#!/usr/bin/env node

var fs = require('fs');
var yaml = require('js-yaml');
var chalk = require('chalk');
var cli = require('vorpal')();
var mLabAPI = require('mongolab-data-api');
var mLab, db;

var ERRORS = ['Error: account unauthorized, please provide a valid API key.',
              'Error: database not set',
              'Error: invalid file type'];

var dbCommands = ['getLastError', 'getPrevError', 'ping', 'profile', 'repairDatabase', 'resetError',
                'whatsmyuri', 'convertToCapped', 'distinct', 'findAndModify', 'geoNear', 'reIndex',
                'collStats', 'dbStats'];

function getUserHome () {
  return process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'];
}

var CONFIG_FILE = getUserHome() + '/.mlabrc.yml';

var getApiKey = function () {
  // make sure the configuration file exists
  fs.stat(CONFIG_FILE, function (err, stat) {
    if (err === null) {
      return;
    } else if (err.code == 'ENOENT') {
      fs.writeFile(CONFIG_FILE);
    } else {
      console.log('Unexpected error: ', err.code);
    }
  });

  try {
    var key = yaml.safeLoad(fs.readFileSync(CONFIG_FILE, 'utf8'));
    mLab = mLabAPI(key.toString());
  } catch (e) {
    console.log('Type \"authorize\" and provide your API key to authorize your mLab account.');
  }
}();

cli
  .command('authorize <key>', 'set a new mLab account key')
  .action(function (args, cb) {
    try {
      mLab = mLabAPI((args.key).toString());

      fs.writeFile(CONFIG_FILE, args.key, function(err) {
        if (err) {
          console.log(err);
        } else {
          console.log('A new Data API key has been set.');
        }
      });
    } catch (e) {
      console.log(ERRORS[0]);
    }
    cb();
  });

cli
  .command('use <database>', 'set current database')
  .action(function (args, cb) {
    try {
      mLab.listDatabases(function (err, databases) {
        var exists = false;

        databases.forEach(function (elem) {
          if (args.database === elem) {
            exists = true;
          }
        });

        if (exists) {
          db = args.database;

          mLab.runCommand({ database: db, commands: { ping: 1 } }, function (err, results) {
            console.log('switched to db ' + db + ' (Server: ' + results.serverUsed + ')');
          });
        } else if (!exists) {
          console.log('database <' + args.database + '> does not exist');
        }
      });
    } catch (e) {
      console.log(ERRORS[0]);
    }
    cb();
  });

cli
  .command('show dbs', 'show database names')
  .alias('show databases')
  .action(function (args, cb) {
    try {
      mLab.listDatabases(function (err, databases) {
        if (err) {
          console.log(err);
        } else {
          console.log(databases.join('\n'));
        }
      });
    } catch (e) {
      console.log(ERRORS[1]);
    }
    cb();
  });

cli
  .command('show collections', 'show collections in database')
  .action(function (args, cb) {
    try {
      mLab.listCollections(db, function (err, collections) {
        if (err) {
          console.log(err);
        } else {
          var SYS_INDEX = collections.indexOf('system.indexes'); // removes system.indexes from the list
          if (SYS_INDEX > -1) {
            collections.splice(SYS_INDEX, 1);
          }

          console.log(collections.join('\n'));
        }
      });
    } catch (e) {
      console.log(ERRORS[1]);
    }
    cb();
  });

cli
  .command('find <collectionName>', 'find documents in the specified collection')
  .option('-q, --query <string>', 'restrict results by the specified JSON query')
  .option('-c, --resultCount', 'return the result count for query')
  .option('--setFields <string>', 'specify the set of fields to include or exclude in each document (1 - include; 0 - exclude)')
  .option('-o, --findOne', 'return a single document from the result set')
  .option('--sortOrder <string>', 'specify the order in which to sort each specified field (1- ascending; -1 - descending)')
  .option('-s, --skipResults <number>', 'number of documents to skip')
  .option('-l, --limit <number>', 'number of documents to return')
  .action(function (args, cb) {
    var opts = {
      database: db,
      collectionName: args.collectionName,
      query: args.options.query,
      resultCount: args.options.resultCount,
      setOfFields: args.options.setFields,
      findOne: args.options.findOne,
      sortOrder: args.options.sortOrder,
      skipResults: args.options.skipResults,
      limit: args.options.limit
    };

    try {
      mLab.listDocuments(opts, function (err, documents) {
        if (err) {
          console.log(ERRORS[1]);
        } else {
          if (documents.message) {
            console.log(documents.message + '\nMake sure to surround your payload data with quotes (\'\')');
          } else {
            console.log(JSON.stringify(documents, 2, 2));
          }
        }
      });
    } catch (e) {
      console.log(ERRORS[1]);
    }
    cb();
  });

cli
  .command('insert <collectionName> <file>',
           'create new document(s) in the specified collection (takes a .json file containing the document(s) inside an array)')
  .action(function (args, cb) {
    if (args.file.indexOf('.json') > -1) {
      fs.readFile(args.file, 'utf-8', function (err, data) {
        if (err) { throw err; }

        mLab.insertDocuments({
          database: db,
          collectionName: args.collectionName,
          documents: JSON.parse(data) }, function (err, result) {
            if (err) {
              console.log('Error: database not set');
            } else {
              console.log(result.n + ' document(s) added');
            }
          });
      });
    } else {
      console.log(ERRORS[2]);
    }
    cb();
  });

cli
  .command('update <collectionName> <newData>', 'update one or more documents in the specified collection')
  .option('-q, --query <string>', 'only update document(s) matching the specified JSON query')
  .option('-a, --all', 'update all documents collection or query (if specified). By default only one document is modified')
  .option('-u, --upsert', 'insert the document defined in the request body if none match the specified query')
  .action(function (args, cb) {
    var opts = {
      database: db,
      collectionName: args.collectionName,
      data: JSON.parse(args.newData),
      query: args.options.query,
      allDocuments: args.options.all,
      upsert: args.options.upsert
    };

    mLab.updateDocuments(opts, function (err, result) {
      if (err) {
        console.log(ERRORS[1]);
      } else {
        console.log(result.n + ' document(s) updated');
      }
    });
    cb();
  });

cli
  .command('delete <collectionName>', 'delete one or more documents in the specified collection\n')
  .option('-q, --query <string>', 'only delete the document(s) matching the specified JSON query')
  .action(function (args, cb) {
    var self = this;
    this.prompt({
      type: 'confirm',
      name: 'continue',
      default: false,
      message: 'Warning: Are you sure that you want to permanently delete this data?',
    }, function (res) {
      if (!res.continue) {
        self.log('Aborting task...');
      } else {
        var opts = {
          database: db,
          collectionName: args.collectionName,
          documents: [],
          query: args.options.query
        };

        mLab.deleteDocuments(opts, function (err, result) {
          if (err) {
            console.log(ERRORS[1]);
          } else {

            if (result.message) {
              console.log(result.message);
            } else {
              console.log(result.removed + ' document(s) deleted');
            }
          }
        });
      }
      cb();
    });
  });

cli
  .mode('db')
  .description('run MongoDB database commands')
  .delimiter('~ db:')
  .init(function(args, cb) {
    this.log('\nYou can now directly enter arbitrary MongoDB commands. To exit, type `exit`.\n' +
             'To see the full list of supported commands, type `help`.\n\n');
    cb();
  })
  .action(function (command, cb) {
    if (command === 'help') {
      this.log('\nSupported commands:\n\n' + dbCommands.join('\n') + '\n');
    } else {
      try {
        mLab.runCommand({ database: db, commands: eval('({' + command.toString() + '})') }, function (err, result) {
          if (err) {
            console.log(ERRORS[1]);
          } else {
            if (result.message) {
              console.log(result.message);
            } else {
              console.log(result);
            }
          }
        });
      } catch (e) {
        console.log('The command you are trying to run is invalid or unsupported.');
      }
    }
    cb();
  });

cli
  .log(chalk.green('mLab CLI version: ') + require('./package').version + '\n')
  .delimiter('>')
  .show();

