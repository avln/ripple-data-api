var env      = process.env.NODE_ENV || "staging";
var DBconfig = require(process.env.DB_CONFIG || '../../db.config.json')[env];
var config   = require(process.env.DEPLOYMENT_ENVS_CONFIG || '../../deployment.environments.json')[env];
var _        = require('lodash');
var winston  = require('winston');
var moment   = require('moment');
var schedule = require('node-schedule');

function saveHistory (metric, interval, update, done) {
  var start = moment.utc("2013-01-01");
  var end   = moment.utc().startOf(interval); //now
  var time  = moment.utc(end).subtract(1, interval);
  var check;
  var load;
  var params;

  if (metric === 'tradeVolume') {
    check = require("../routes/totalTradeVolume");
    load  = require("./metrics/tradeVolume");

  } else if (metric === 'transactionVolume') {
    check = require("../routes/totalValueSent");
    load  = require("./metrics/transactionVolume");

  } else if (metric === 'networkValue') {
    check = require("../routes/totalNetworkValue");
    load  = require("./metrics/networkValue");

  } else return winston.error("invalid metric");

  if (interval != 'month' &&
      interval != 'week' &&
      interval != 'day') return winston.error('invalid interval');

  next(); //start

  function getStat(callback) {
    if (metric == 'networkValue') params = {
      time    : time,
    }

    else params = {
      startTime : time,
      interval  : interval
    }

    if (DEBUG) winston.info("cacheing metric: ", metric, interval, time.format());

    //check for existing data if this is an update
    if (update) {
      check(params, function(err, resp) {
        if (err) return callback(err);
        else if (!resp) load(params, callback);
        else callback(null, null);
      });

    } else {
      load(params, callback);
    }
  }

  function next() {
    getStat(function(err, res){
      end.subtract(1, interval);
      time.subtract(1, interval);

      if (err) {
        console.log(err);
      } else if (update && !res) {
        winston.info('finished update ' + metric + " - " + interval);
      } else if (start.diff(time)>0) {
        winston.info("finished cacheing " + metric + " - " + interval);
      } else {
        return next();
      }

      done();
    });
  }
}

module.exports.init = function (reload) {
  var offset      = Math.ceil(new Date().getTimezoneOffset()/60);
  var dailyRule   = new schedule.RecurrenceRule(null, null, null, null, offset, 15, 0);
  var weeklyRule  = new schedule.RecurrenceRule(null, null, null, 1, offset, 10, 0);
  var monthlyRule = new schedule.RecurrenceRule(null, null, 1, null, offset, 5, 0);


  schedule.scheduleJob(dailyRule, function(){
    saveDailyHistory(false);
  });

  schedule.scheduleJob(weeklyRule, function(){
    saveWeeklyHistory(true);
  });

  schedule.scheduleJob(monthlyRule, function(){
    saveDailyHistory(true);
  });

  var saveMonthlyHistory = function (update, done) {
    saveHistory('tradeVolume', "month", update, function() {
      saveHistory('transactionVolume', "month", update, function() {
        saveHistory('networkValue', "month", update, function() {
          winston.info("finished cacheing monthly historical metrics");
          if(done) done();
        });
      });
    });
  };

  var saveWeeklyHistory = function (udapte, done) {
    saveHistory('tradeVolume', "week", update, function() {
      saveHistory('transactionVolume', "week", update, function() {
        saveHistory('networkValue', "week", update, function() {
          winston.info("finished cacheing daily historical metrics");
          if (done) done();
        });
      });
    });
  }

  var saveDailyHistory = function (update, done) {
    saveHistory('tradeVolume', "day", update, function() {
      saveHistory('transactionVolume', "day", update, function() {
        saveHistory('networkValue', "day", update, function() {
          winston.info("finished cacheing daily historical metrics");
          if (done) done();
        });
      });
    });
  }

  if (reload) {
    saveMonthlyHistory(false, function(){
      saveWeeklyHistory(false, function(){
        saveDailyHistory(false, function(){
          winston.info("finished cacheing historical metrics");
        });
      });
    });
  }
};
