#!/usr/bin/env node

/**
 * term.js
 * Copyright (c) 2012-2013, Christopher Jeffrey (MIT License)
 */

var http = require('http')
  , express = require('express')
  , io = require('socket.io')
  , pty = require('pty.js')
  , terminal = require('../')
  , crypto = require('crypto');

/**
 * term.js
 */

process.title = 'term.js';

/**
 * Dump
 */

var stream;
if (process.argv[2] === '--dump') {
  stream = require('fs').createWriteStream(__dirname + '/dump.log');
}

/**
 * Open Terminal
 */

delete process.env['TMUX'];
function createTerminal(socket) {
  var term = pty.fork(process.env.SHELL || 'sh', ['-c', 'tmux at'], {
    name: require('fs').existsSync('/usr/share/terminfo/x/xterm-256color')
      ? 'xterm-256color'
      : 'xterm',
    cols: 80,
    rows: 24,
    cwd: process.env.HOME
  });

  term.on('data', function(data) {
    if (stream) stream.write('OUT: ' + data + '\n-\n');
    socket.emit('data', data);
  });

  socket.on('data', function(data) {
    if (stream) stream.write('IN: ' + data + '\n-\n');
    //console.log(JSON.stringify(data));
    term.write(data);
  });

  socket.on('disconnect', function() {
    term.destroy();
    term = null;
    socket = null;
  });

  console.log(''
    + 'Created shell with pty master/slave'
    + ' pair (master: %d, pid: %d)',
    term.fd, term.pid);

  return term;
}

/**
 * App & Server
 */

var app = express()
  , server = http.createServer(app);

app.use(function(req, res, next) {
  var setHeader = res.setHeader;
  res.setHeader = function(name) {
    switch (name) {
      case 'Cache-Control':
      case 'Last-Modified':
      case 'ETag':
        return;
    }
    return setHeader.apply(res, arguments);
  };
  next();
});

var pass2 = process.env['PASS'];
app.use(express.basicAuth(function(user, pass, next) {
  if (user !== process.env['USER'] ||
      crypto.createHash('sha1').update(pass).digest('hex') !== pass2) {
    return next(true);
  }
  return next(null, user);
}));

app.use(express.static(__dirname));
app.use(terminal.middleware());

if (!~process.argv.indexOf('-n')) {
  server.on('connection', function(socket) {
    var address = socket.remoteAddress;
    if (address !== '127.0.0.1' && address !== '::1') {
      try {
        socket.destroy();
      } catch (e) {
        ;
      }
      console.log('Attempted connection from %s. Refused.', address);
    }
  });
}

/**
 * Sockets
 */

io = io.listen(server, {
  log: false,
  transports: [
    'xhr-polling',
    'jsonp-polling'
  ]
});

io.sockets.on('connection', function(sock) {
  createTerminal(sock);
});

server.listen(8022);
