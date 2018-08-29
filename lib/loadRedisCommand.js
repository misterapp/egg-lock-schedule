/**
 * @file custom redis command definition
 * @author zengbaoqing<misterapptracy@gmail.com>
 */
'use strict';

const fs = require('fs');
const path = require('path');
const commandDir = path.join(__dirname, './lua');
const files = fs.readdirSync(commandDir);
module.exports = app => {
  const { redis } = app;
  files.forEach(filename => {
    // By default, the files in the lower level directory of the relative path ./lua are read.
    if (!/^[^\.]*\.[0-9]*\.lua$/i.test(filename)) {
      return;
    }
    const [ command, numberOfKeys ] = filename.split('.');
    const script = fs.readFileSync(`${commandDir}/${filename}`, 'utf8');
    redis.defineCommand(command, {
      numberOfKeys: parseInt(numberOfKeys),
      lua: script,
    });
  });
};
