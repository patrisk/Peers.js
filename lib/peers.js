var debug = require('debug')('torrent-lpd');
var net = require('net');
var dgram = require('dgram');
var util = require('util');
var events = require('events');
var parser = require('http-string-parser');

var Peers = function (options) {
  var multicast = {},
    zeros = new Buffer(40);

  events.EventEmitter.call(this);

  options = options || {};

  this.port = options.port || 6771;

  // Peer list and discovery
  this.peer_list = [];

  this.announcing = {};
  this.announcing.interval = options.interval || 1000; // Announce yourself every minute.
  this.discovery = {};
  this.discovery.identify = options.identify || true;

  // Multicast options
  this.multicast = multicast;
  this.multicast.membership = options.membership || [ '239.192.152.143' ];
  this.multicast.loopback = options.loopback || false;
  this.multicast.ttl = options.ttl || 1;
  this.socket = dgram.createSocket('udp4');

  zeros.fill(0);
  this.zeroHash = zeros.toString('hex');
};
util.inherits(Peers, events.EventEmitter);

Peers.prototype.listen = function () {
  var self = this;

  self.socket.on('listening', function () {
    debug('listening on %s', JSON.stringify(self.socket.address()));

    self.multicast.membership.forEach(function (group) {
      self.socket.addMembership(group);
    });

    self.socket.setMulticastTTL(self.multicast.ttl);
    self.socket.setMulticastLoopback(self.multicast.loopback);

    self.emit('listening');
  });

  self.socket.on('message', function (msg, rinfo) {
    debug('message: %s', msg.toString());
    self.discovered(msg, rinfo);
  });

  self.socket.bind(self.port);
};

Peers.prototype._buildMessage = function (torrentPort, infoHash) {
  var infoHashHex = infoHash.toString('hex'),
    msg = util.format('BT-SEARCH * HTTP/1.1\r\n' +
      'Host: 239.192.152.143:6771\r\n' +
      'Port: %d\r\n' +
      'Infohash: %s\r\n' +
      '\r\n\r\n', torrentPort, infoHashHex),
    buffer = new Buffer(msg);
  return buffer;
};

Peers.prototype._multicastMessage = function (msg, torrentPort, infoHash) {
  var self = this;

  self.multicast.membership.forEach(function (group) {
    debug('announce: torrent port %d, infoHash: %s on %s:%d',
      torrentPort, infoHash.toString('hex'), group, self.port);
    self.socket.send(msg, 0, msg.length, self.port, group);
  });
};

Peers.prototype.announce = function (torrentPort, infoHash) {
  var self = this,
    msg = self._buildMessage(torrentPort, infoHash),
    retry_count = 1,
    resendAnnouncement = function () {
      self._multicastMessage(msg, torrentPort, infoHash);

      if (++retry_count < 5) {
        self.resendTimeoutId = setTimeout(resendAnnouncement, 250 * retry_count);
      }
    };


  // Send out an announce packet
  self._multicastMessage(msg, torrentPort, infoHash);

  self.resendTimeoutId = setTimeout(resendAnnouncement, 250 * retry_count);
};

Peers.prototype.discovered = function (buffer, rinfo) {
  // A peer responed. Either add him to the list or not.
  var self = this,
    msg = buffer.toString().toLowerCase(),
    request = parser.parseRequest(msg),
    peerPort,
    peerInfoHashHex,
    peer;

  debug('discovered: %s', JSON.stringify(request));

  if (request.method !== 'bt-search') {
    debug('invalid HTTP method: %s', request.method);
    return;
  }

  peerPort = request.headers.port;
  if (peerPort === undefined) {
    debug('invalid BT-SEARCH, missing port');
    return;
  }

  peerInfoHashHex = request.headers.infohash;
  if (!peerInfoHashHex) {
    debug('invalid BT-SEARCH, missing infohash');
    return;
  }

  try {
    if (peerPort === 0 || peerInfoHashHex === self.zeroHash) {
      return;
    }
  } catch (err) {
    debug('error parsing peer infohash: %s: %s', peerInfoHashHex, err);
    return;
  }

  peer = util.format('%s:%s', rinfo.address, peerPort);

  if (self.discovery.identify) {
    if (self.peer_list.indexOf(peer) === -1) {
      self.peer_list.push(peer);
    }
  }

  debug('emitting peer: %s', peer);

  self.emit('peer', peer);
};

Peers.prototype.peers = function () {
  return this.peer_list;
};

Peers.prototype.stop = function (cb) {
  var self = this;

  if (self.resendTimeoutId) {
    clearTimeout(self.resendTimeoutId);
  }
  self.socket.close(cb);
};

exports.Peers = Peers;
