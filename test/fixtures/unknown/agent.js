'use strict';

module.exports = agent => {
  agent.messenger.once('egg-ready', () => {
    setTimeout(() => {
      agent.messenger.sendRandom('egg-lock-schedule', { key: 'no-exist' });
    }, 100);
  });
};