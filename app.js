'use strict';

const loadSchedule = require('./lib/load_schedule');
const qs = require('querystring');
const path = require('path');
const loadRedisCommand = require('./lib/loadRedisCommand');

module.exports = app => {
  // don't redirect scheduleLogger
  app.loggers.scheduleLogger.unredirect('error');
  loadRedisCommand(app);
  const schedules = loadSchedule(app);

  // get schedule
  const getScheduleByPath = schedulePath => {
    if (!path.isAbsolute(schedulePath)) {
      schedulePath = path.join(app.config.baseDir, 'app/schedule', schedulePath);
    }
    schedulePath = require.resolve(schedulePath);
    return schedules[schedulePath] || null;
  };

  // for test purpose
  app.runSchedule = schedulePath => {
    if (!path.isAbsolute(schedulePath)) {
      schedulePath = path.join(app.config.baseDir, 'app/schedule', schedulePath);
    }
    schedulePath = require.resolve(schedulePath);
    const schedule = getScheduleByPath(schedulePath);
    if (!schedule) {
      return Promise.reject(new Error(`[egg-schedule] Cannot find schedule ${schedulePath}`));
    }
    // run with anonymous context
    const ctx = app.createAnonymousContext({
      method: 'SCHEDULE',
      url: `/__schedule?path=${schedulePath}&${qs.stringify(schedule.schedule)}`,
    });

    return schedule.task(ctx);
  };

  // disable schedule
  app.disableSchedule = schedulePath => {
    const schedule = getScheduleByPath(schedulePath);
    if (!schedule) {
      return Promise.reject(new Error(`[egg-schedule] Cannot find schedule ${schedulePath}`));
    }
    schedule.disable = true;
    return Promise.resolve(true);
  };

  // enable schedule
  app.enableSchedule = schedulePath => {
    const schedule = getScheduleByPath(schedulePath);
    if (!schedule) {
      return Promise.reject(new Error(`[egg-schedule] Cannot find schedule ${schedulePath}`));
    }
    schedule.disable = false;
    return Promise.resolve(true);
  };

  // log schedule list
  for (const s in schedules) {
    const schedule = schedules[s];
    if (!schedule.schedule.disable) app.coreLogger.info('[egg-schedule]: register schedule %s', schedule.key);
  }

  // register schedule event
  app.messenger.on('egg-schedule', async data => {
    const id = data.id;
    const key = data.key;
    const schedule = schedules[key];
    const { lockType, lockKey, disable, isLock } = schedule;
    const logger = app.loggers.scheduleLogger;
    logger.info(`[${id}] ${key} task received by app`);

    if (!schedule) {
      logger.warn(`[${id}] ${key} unknown task`);
      return;
    }
    /* istanbul ignore next */
    if (disable) return;

    // if process lock is enabled
    if (lockType === 'process') {
      if (isLock) {
        return;
      }
      schedule.isLock = true;
    }
    // if global lock is enabled
    if (lockType === 'global') {
      if (await app.redis.isGlobalLock(lockKey)) {
        return;
      }
      await app.redis.set(lockKey, 1);
    }
    // run with anonymous context
    const ctx = app.createAnonymousContext({
      method: 'SCHEDULE',
      url: `/__schedule?path=${key}&${qs.stringify(schedule.schedule)}`,
    });

    const start = Date.now();
    const task = schedule.task;
    logger.info(`[${id}] ${key} executing by app`);
    // execute
    task(ctx, ...data.args)
      .then(() => true) // succeed
      .catch(err => {
        logger.error(`[${id}] ${key} execute error.`, err);
        err.message = `[egg-schedule] ${key} execute error. ${err.message}`;
        app.logger.error(err);
        return false; // failed
      })
      .then(async success => {
        // if process lock is enabled
        if (lockType === 'process') {
          schedule.isLock = false;
        }
        // if global lock is enabled
        if (lockType === 'global') {
          await app.redis.set(lockKey, 0);
        }
        const rt = Date.now() - start;
        const status = success ? 'succeed' : 'failed';
        ctx.coreLogger.info(`[egg-schedule] ${key} execute ${status}, used ${rt}ms`);
        logger[success ? 'info' : 'error'](`[${id}] ${key} execute ${status}, used ${rt}ms`);
      });
  });
};
